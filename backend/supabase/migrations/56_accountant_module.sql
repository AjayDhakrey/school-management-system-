-- Accountant module: fee payment ledger, refunds, expenses/vendors, invoices,
-- financial settings and audit logging. Also fixes a pre-existing gap: the
-- frontend (src/lib/api.ts) already calls a `collect_fee_payment` RPC for
-- staff-recorded fee payments, but no such function existed in any migration
-- — that write path was broken. fees.paid_amount/receipt_no also only ever
-- stored the single latest payment, so a second partial payment silently
-- overwrote the first payment's receipt — no real transaction history.

-- ============================================================================
-- New permission keys. SCHOOL_ADMIN/SUPER_ADMIN stay wildcards (has_permission
-- in 23_rls_helpers.sql) and don't need explicit grants below.
-- ============================================================================
insert into public.permissions (key) values
  ('fee_payments.view'), ('fee_payments.create'),
  ('fee_refunds.view'), ('fee_refunds.create'),
  ('expenses.view'), ('expenses.manage'),
  ('vendors.view'), ('vendors.manage'),
  ('invoices.view'), ('invoices.manage'),
  ('reports.view'),
  ('audit_logs.view'),
  ('financial_settings.manage')
on conflict (key) do nothing;

insert into public.role_permission_defaults (role, department, permission) values
  -- Accountants could already view/create/update fees but had no way to
  -- actually record a payment against one — the real gap this migration fixes.
  ('STAFF', 'ACCOUNTS', 'fees.pay'),
  ('STAFF', 'ACCOUNTS', 'fee_payments.view'),
  ('STAFF', 'ACCOUNTS', 'fee_payments.create'),
  ('STAFF', 'ACCOUNTS', 'fee_refunds.view'),
  ('STAFF', 'ACCOUNTS', 'fee_refunds.create'),
  ('STAFF', 'ACCOUNTS', 'expenses.view'),
  ('STAFF', 'ACCOUNTS', 'expenses.manage'),
  ('STAFF', 'ACCOUNTS', 'vendors.view'),
  ('STAFF', 'ACCOUNTS', 'vendors.manage'),
  ('STAFF', 'ACCOUNTS', 'invoices.view'),
  ('STAFF', 'ACCOUNTS', 'invoices.manage'),
  ('STAFF', 'ACCOUNTS', 'reports.view'),
  ('STAFF', 'ACCOUNTS', 'audit_logs.view'),
  ('STAFF', 'ACCOUNTS', 'financial_settings.manage')
on conflict do nothing;

-- ============================================================================
-- Fee payments — the transaction ledger. One immutable row per receipt.
-- `fees` stays the per-bill aggregate (paid_amount/status/receipt_no keep
-- reflecting the *latest* payment, unchanged shape for existing readers),
-- but this table is now the real source of truth for transaction history,
-- receipts and refunds. No UPDATE/DELETE policy anywhere — a payment is
-- corrected by issuing a refund against it, never by editing the row.
-- ============================================================================
create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  fee_id uuid not null references public.fees (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Online')),
  transaction_reference text,
  receipt_no text not null unique,
  idempotency_key uuid,
  collected_by uuid references auth.users (id),
  collected_by_name text,
  paid_on timestamptz not null default now(),
  refunded_amount numeric(12, 2) not null default 0 check (refunded_amount >= 0),
  status text not null default 'Completed' check (status in ('Completed', 'Partially Refunded', 'Refunded')),
  created_at timestamptz not null default now(),
  check (refunded_amount <= amount)
);
create index idx_fee_payments_school on public.fee_payments (school_id);
create index idx_fee_payments_fee on public.fee_payments (fee_id);
create index idx_fee_payments_student on public.fee_payments (student_id);
-- Same idempotency key from the same school never creates a second payment row.
create unique index idx_fee_payments_idempotency
  on public.fee_payments (school_id, idempotency_key) where idempotency_key is not null;

alter table public.fee_payments enable row level security;

create policy "fee_payments_select" on public.fee_payments for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.has_permission('fee_payments.view'))
    or (
      (select public.jwt_role()) in ('PARENT', 'STUDENT')
      and public.owns_student(student_id)
    )
  )
);
-- No insert/update/delete policy: every write goes through collect_fee_payment()
-- (security definer) below, which enforces the permission + validation itself.

-- ============================================================================
-- Refunds — always against a specific payment, capped at that payment's
-- remaining (unrefunded) amount. Immutable ledger, no update/delete policy.
-- ============================================================================
create table public.fee_refunds (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  fee_payment_id uuid not null references public.fee_payments (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null,
  refunded_by uuid references auth.users (id),
  refunded_by_name text,
  refunded_on timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_fee_refunds_school on public.fee_refunds (school_id);
create index idx_fee_refunds_payment on public.fee_refunds (fee_payment_id);

alter table public.fee_refunds enable row level security;

create policy "fee_refunds_select" on public.fee_refunds for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('fee_refunds.view'))
);
-- Writes only via issue_fee_refund() below.

-- ============================================================================
-- Expenses / vendors — ordinary admin data, direct CRUD via RLS (not RPC-gated;
-- there's no ledger-immutability concern here the way there is for payments).
-- ============================================================================
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index idx_expense_categories_school on public.expense_categories (school_id);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_vendors_school on public.vendors (school_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  category_id uuid references public.expense_categories (id) on delete set null,
  vendor_id uuid references public.vendors (id) on delete set null,
  title text not null,
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  payment_method text check (payment_method in ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Online')),
  notes text,
  created_by uuid references auth.users (id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create index idx_expenses_school on public.expenses (school_id, expense_date desc);
create index idx_expenses_category on public.expenses (category_id);
create index idx_expenses_vendor on public.expenses (vendor_id);

alter table public.expense_categories enable row level security;
alter table public.vendors enable row level security;
alter table public.expenses enable row level security;

create policy "expense_categories_select" on public.expense_categories for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('expenses.view'))
);
create policy "expense_categories_write" on public.expense_categories for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('expenses.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('expenses.manage'))
);

create policy "vendors_select" on public.vendors for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('vendors.view'))
);
create policy "vendors_write" on public.vendors for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('vendors.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('vendors.manage'))
);

create policy "expenses_select" on public.expenses for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('expenses.view'))
);
create policy "expenses_write" on public.expenses for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('expenses.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('expenses.manage'))
);

-- ============================================================================
-- Invoices — bills owed to vendors/payees, distinct from student fees.
-- ============================================================================
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  vendor_id uuid references public.vendors (id) on delete set null,
  invoice_no text not null,
  title text not null,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'Unpaid' check (status in ('Unpaid', 'Paid', 'Overdue', 'Cancelled')),
  due_date date,
  paid_on timestamptz,
  notes text,
  created_by uuid references auth.users (id),
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (school_id, invoice_no)
);
create index idx_invoices_school on public.invoices (school_id, due_date);

alter table public.invoices enable row level security;

create policy "invoices_select" on public.invoices for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('invoices.view'))
);
create policy "invoices_write" on public.invoices for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('invoices.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('invoices.manage'))
);

-- ============================================================================
-- Financial settings — one row per school. Currently just the accepted
-- payment methods (drives the method picker in fee collection/expenses).
-- ============================================================================
create table public.school_financial_settings (
  school_id text primary key references public.schools (id) on delete cascade,
  accepted_payment_methods text[] not null default array['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Online'],
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

alter table public.school_financial_settings enable row level security;

create policy "school_financial_settings_select" on public.school_financial_settings for select to authenticated using (
  school_id = (select public.jwt_school_id())
);
create policy "school_financial_settings_write" on public.school_financial_settings for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('financial_settings.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('financial_settings.manage'))
);

-- ============================================================================
-- Audit logs — append-only. No update/delete policy at all; rows are written
-- only via public.log_audit_event(), never directly.
-- ============================================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  actor_id uuid references auth.users (id),
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_school on public.audit_logs (school_id, created_at desc);

alter table public.audit_logs enable row level security;

create policy "audit_logs_select" on public.audit_logs for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('audit_logs.view'))
);

create or replace function public.log_audit_event(
  p_action text, p_entity_type text, p_entity_id text, p_details jsonb default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_logs (school_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    public.jwt_school_id(), auth.uid(),
    (select name from public.user_profiles where id = auth.uid()),
    p_action, p_entity_type, p_entity_id, p_details
  );
end;
$$;

-- ============================================================================
-- collect_fee_payment: the write path the frontend already calls
-- (POST /fees/:id/pay -> rpc('collect_fee_payment', ...)) but that never
-- existed in the database — fee collection by staff was silently broken.
-- Validates amount, caps at the remaining payable balance, is idempotent on
-- p_body.idempotencyKey, records an immutable ledger row, and updates the
-- parent fees row's aggregate (paid_amount/status/receipt_no/paid_on).
-- ============================================================================
create or replace function public.collect_fee_payment(p_fee_id uuid, p_body jsonb)
returns public.fee_payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fee public.fees;
  v_school text := public.jwt_school_id();
  v_amount numeric := (p_body ->> 'payAmount')::numeric;
  v_method text := coalesce(p_body ->> 'method', 'Cash');
  v_reference text := nullif(p_body ->> 'transactionReference', '');
  v_idempotency uuid := nullif(p_body ->> 'idempotencyKey', '')::uuid;
  v_paid_on timestamptz := coalesce((p_body ->> 'paymentDate')::timestamptz, now());
  v_payable numeric;
  v_new_paid numeric;
  v_status text;
  v_receipt text;
  v_payment public.fee_payments;
  v_actor_name text;
begin
  if not (select public.has_permission('fees.pay')) then
    raise exception 'Not authorized to collect fee payments';
  end if;
  if not (select public.school_is_active()) then
    raise exception 'School account is not active';
  end if;

  -- Idempotent replay: the exact same client-generated key never creates a
  -- second payment, even on a retried/duplicated request.
  if v_idempotency is not null then
    select * into v_payment from public.fee_payments
      where school_id = v_school and idempotency_key = v_idempotency;
    if found then
      return v_payment;
    end if;
  end if;

  select * into v_fee from public.fees where id = p_fee_id;
  if v_fee is null or v_fee.school_id <> v_school then
    raise exception 'Fee not found';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  v_payable := v_fee.amount - v_fee.discount + v_fee.fine;
  if v_amount > (v_payable - v_fee.paid_amount) then
    raise exception 'Payment amount exceeds the remaining balance';
  end if;

  v_new_paid := v_fee.paid_amount + v_amount;
  v_status := case when v_new_paid >= v_payable then 'Paid' else 'Partial' end;
  v_receipt := 'RCPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  select name into v_actor_name from public.user_profiles where id = auth.uid();

  insert into public.fee_payments (
    school_id, fee_id, student_id, amount, method, transaction_reference,
    receipt_no, idempotency_key, collected_by, collected_by_name, paid_on
  ) values (
    v_school, p_fee_id, v_fee.student_id, v_amount, v_method, v_reference,
    v_receipt, v_idempotency, auth.uid(), v_actor_name, v_paid_on
  ) returning * into v_payment;

  update public.fees set
      paid_amount = v_new_paid,
      status = v_status,
      paid_on = v_paid_on,
      receipt_no = v_receipt
    where id = p_fee_id;

  perform public.log_audit_event(
    'fee_payment.collected', 'fee_payments', v_payment.id::text,
    jsonb_build_object('feeId', p_fee_id, 'amount', v_amount, 'method', v_method)
  );

  return v_payment;
end;
$$;
grant execute on function public.collect_fee_payment(uuid, jsonb) to authenticated;

-- ============================================================================
-- issue_fee_refund: refunds are always against a specific payment, capped at
-- that payment's remaining (unrefunded) amount — never an arbitrary amount
-- against a fee — so a fee can never be refunded past what was actually paid.
-- ============================================================================
create or replace function public.issue_fee_refund(p_fee_payment_id uuid, p_amount numeric, p_reason text)
returns public.fee_refunds
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payment public.fee_payments;
  v_fee public.fees;
  v_school text := public.jwt_school_id();
  v_refundable numeric;
  v_refund public.fee_refunds;
  v_new_refunded numeric;
  v_payment_status text;
  v_new_fee_paid numeric;
  v_fee_status text;
  v_actor_name text;
begin
  if not (select public.has_permission('fee_refunds.create')) then
    raise exception 'Not authorized to issue refunds';
  end if;
  if not (select public.school_is_active()) then
    raise exception 'School account is not active';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be positive';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A refund reason is required';
  end if;

  select * into v_payment from public.fee_payments where id = p_fee_payment_id;
  if v_payment is null or v_payment.school_id <> v_school then
    raise exception 'Payment not found';
  end if;

  v_refundable := v_payment.amount - v_payment.refunded_amount;
  if p_amount > v_refundable then
    raise exception 'Refund amount exceeds the payment''s remaining refundable balance';
  end if;

  select name into v_actor_name from public.user_profiles where id = auth.uid();

  insert into public.fee_refunds (school_id, fee_payment_id, amount, reason, refunded_by, refunded_by_name)
  values (v_school, p_fee_payment_id, p_amount, trim(p_reason), auth.uid(), v_actor_name)
  returning * into v_refund;

  v_new_refunded := v_payment.refunded_amount + p_amount;
  v_payment_status := case
    when v_new_refunded >= v_payment.amount then 'Refunded'
    else 'Partially Refunded'
  end;
  update public.fee_payments set refunded_amount = v_new_refunded, status = v_payment_status
    where id = p_fee_payment_id;

  select * into v_fee from public.fees where id = v_payment.fee_id;
  if v_fee is not null then
    v_new_fee_paid := greatest(0, v_fee.paid_amount - p_amount);
    v_fee_status := case
      when v_new_fee_paid <= 0 then 'Pending'
      when v_new_fee_paid >= (v_fee.amount - v_fee.discount + v_fee.fine) then 'Paid'
      else 'Partial'
    end;
    update public.fees set paid_amount = v_new_fee_paid, status = v_fee_status where id = v_fee.id;
  end if;

  perform public.log_audit_event(
    'fee_payment.refunded', 'fee_refunds', v_refund.id::text,
    jsonb_build_object('feePaymentId', p_fee_payment_id, 'amount', p_amount, 'reason', p_reason)
  );

  return v_refund;
end;
$$;
grant execute on function public.issue_fee_refund(uuid, numeric, text) to authenticated;
