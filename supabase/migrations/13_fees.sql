create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  class_id uuid references public.classes (id) on delete cascade,
  fee_type text not null,
  amount numeric(12, 2) not null,
  session text
);
create index idx_fee_structures_school on public.fee_structures (school_id);

-- status/paid_amount are server-derived (see pay_fee() in 27_rpc_functions.sql) — no general
-- UPDATE policy is granted to PARENT/STUDENT for this table, see 26_rls_policies_operations.sql.
create table public.fees (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  amount numeric(12, 2) not null,
  status text not null default 'Pending',
  due_date date,
  paid_on timestamptz,
  fee_type text not null default 'Tuition',
  discount numeric(12, 2) not null default 0,
  fine numeric(12, 2) not null default 0,
  receipt_no text,
  paid_amount numeric(12, 2) not null default 0
);
create index idx_fees_school on public.fees (school_id);
create index idx_fees_student on public.fees (student_id);
