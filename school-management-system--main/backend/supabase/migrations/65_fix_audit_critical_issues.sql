-- ============================================================================
-- 65_fix_audit_critical_issues.sql
-- Remediates critical security, architectural, and performance issues identified
-- during the Senior Backend Engineering Audit:
--
-- 1. Drops the ambiguous submit_demo_request(text, text, email, phone, text)
--    overload so the landing page "Book a Demo" form stops throwing HTTP 300.
-- 2. Hardens collect_fee_payment authorization so unprivileged students/parents
--    cannot record unauthorized offline cash/cheque payments or pay for
--    unlinked students.
-- 3. Revokes anon execute privileges from internal database maintenance RPCs.
-- 4. Creates covering indexes for unindexed foreign keys flagged by the DB advisor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Landing Page Demo Request RPC Disambiguation
-- ----------------------------------------------------------------------------
drop function if exists public.submit_demo_request(text, text, public.email, public.phone, text);

create or replace function public.submit_demo_request(
  p_school_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_school text := trim(coalesce(p_school_name, ''));
  v_contact text := trim(coalesce(p_contact_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
begin
  if length(v_school) < 2 or length(v_school) > 160 then
    raise exception 'Please enter your school name';
  end if;
  if length(v_contact) < 2 or length(v_contact) > 120 then
    raise exception 'Please enter your name';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    raise exception 'Please enter a valid email address';
  end if;
  if v_phone !~ '^[0-9+()\-\s]{7,20}$' then
    raise exception 'Please enter a valid phone number';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Message is too long';
  end if;

  -- Basic spam guard: one request per email every 10 minutes.
  if exists (
    select 1 from public.leads
    where lower(email) = v_email and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'We already have your request — our team will contact you shortly';
  end if;

  insert into public.leads (school_name, contact_name, email, phone, source, status, notes)
  values (v_school, v_contact, v_email, v_phone, 'Website - Book a demo', 'NEW', nullif(trim(p_notes), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_demo_request(text, text, text, text, text) from public;
grant execute on function public.submit_demo_request(text, text, text, text, text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. Hardened Fee Collection Authorization
-- ----------------------------------------------------------------------------
drop function if exists public.collect_fee_payment(uuid, jsonb);

create or replace function public.collect_fee_payment(p_fee_id uuid, p_body jsonb)
returns public.fee_payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fee public.fees;
  v_school text := public.jwt_school_id();
  v_amount numeric := (p_body ->> 'payAmount')::numeric;
  v_method text := coalesce(p_body ->> 'method', 'Cash');
  v_reference text := nullif(p_body ->> 'transactionReference', '');
  v_idempotency text := nullif(p_body ->> 'idempotencyKey', '');
  v_paid_on timestamptz := coalesce((p_body ->> 'paymentDate')::timestamptz, now());
  v_payable numeric;
  v_new_paid numeric;
  v_status text;
  v_receipt text;
  v_payment public.fee_payments;
  v_actor_name text;
  v_is_staff boolean;
begin
  if not (select public.school_is_active()) then
    raise exception 'School account is not active';
  end if;

  select * into v_fee from public.fees where id = p_fee_id;
  if v_fee is null or v_fee.school_id <> v_school then
    raise exception 'Fee not found';
  end if;

  -- Authorization check:
  -- Staff with fees.update can collect any payment method (Cash, Cheque, Card, etc.).
  -- Parents/Students with fees.pay can only pay online for their own ward.
  v_is_staff := (select public.has_permission('fees.update'));
  if not v_is_staff then
    if not (select public.has_permission('fees.pay')) then
      raise exception 'Not authorized to pay fees';
    end if;

    -- Must own the student
    if not (select public.owns_student(v_fee.student_id)) then
      raise exception 'You can only pay fees for your own child';
    end if;

    -- Disallow offline counter payment methods when invoked by non-staff roles
    if lower(v_method) in ('cash', 'cheque', 'draft') then
      raise exception 'Offline counter payments (Cash/Cheque) must be collected by authorized school staff';
    end if;
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


-- ----------------------------------------------------------------------------
-- 3. Revoke Anon Execute on Database Maintenance Routine
-- ----------------------------------------------------------------------------
revoke all on function public.validate_pending_constraints() from public, anon;
grant execute on function public.validate_pending_constraints() to service_role;


-- ----------------------------------------------------------------------------
-- 4. Covering Indexes for Unindexed Foreign Keys
-- ----------------------------------------------------------------------------
create index if not exists idx_classes_room_id on public.classes(room_id);
create index if not exists idx_students_parent_id on public.students(parent_id);
create index if not exists idx_students_vehicle_id on public.students(vehicle_id);
create index if not exists idx_fee_structures_class_id on public.fee_structures(class_id);
create index if not exists idx_fees_academic_year_id on public.fees(academic_year_id);
create index if not exists idx_fees_class_id on public.fees(class_id);
create index if not exists idx_attendance_academic_year_id on public.attendance(academic_year_id);
create index if not exists idx_attendance_class_id on public.attendance(class_id);
create index if not exists idx_user_profiles_linked_parent_id on public.user_profiles(linked_parent_id);
create index if not exists idx_user_profiles_linked_staff_id on public.user_profiles(linked_staff_id);
create index if not exists idx_user_profiles_linked_student_id on public.user_profiles(linked_student_id);
create index if not exists idx_user_profiles_linked_teacher_id on public.user_profiles(linked_teacher_id);
create index if not exists idx_homework_class_id on public.homework(class_id);
create index if not exists idx_homework_subject_id on public.homework(subject_id);
create index if not exists idx_homework_teacher_id on public.homework(teacher_id);
create index if not exists idx_notices_created_by on public.notices(created_by);
create index if not exists idx_library_records_book_id on public.library_records(book_id);
create index if not exists idx_library_records_student_id on public.library_records(student_id);
create index if not exists idx_admissions_class_id_applied on public.admissions(class_id_applied);
create index if not exists idx_admissions_converted_student_id on public.admissions(converted_student_id);
create index if not exists idx_admission_documents_school_id on public.admission_documents(school_id);
create index if not exists idx_admission_notes_school_id on public.admission_notes(school_id);
create index if not exists idx_admission_status_history_school_id on public.admission_status_history(school_id);
create index if not exists idx_timetable_slots_subject_id on public.timetable_slots(subject_id);
create index if not exists idx_certificates_student_id on public.certificates(student_id);
create index if not exists idx_messages_school_id on public.messages(school_id);
create index if not exists idx_fee_receipts_fee_id on public.fee_receipts(fee_id);
create index if not exists idx_salary_structures_created_by on public.salary_structures(created_by);
create index if not exists idx_salary_structures_updated_by on public.salary_structures(updated_by);
create index if not exists idx_payroll_items_salary_structure_id on public.payroll_items(salary_structure_id);
create index if not exists idx_examinations_based_on_id on public.examinations(based_on_examination_id);
create index if not exists idx_fee_refunds_refunded_by on public.fee_refunds(refunded_by);
create index if not exists idx_expenses_created_by on public.expenses(created_by);
create index if not exists idx_invoices_created_by on public.invoices(created_by);
create index if not exists idx_invoices_vendor_id on public.invoices(vendor_id);
create index if not exists idx_transport_attendance_marked_by on public.transport_attendance(marked_by);
create index if not exists idx_transport_complaints_student_id on public.transport_complaints(student_id);
create index if not exists idx_transport_complaints_vehicle_id on public.transport_complaints(vehicle_id);
