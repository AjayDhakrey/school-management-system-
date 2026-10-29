-- ============================================================================
-- notify_user / log_audit: best-effort side-effect writers. Failures are
-- swallowed so a logging/notification problem never aborts the caller's
-- transaction — matches today's notify()/logAudit() semantics exactly.
-- ============================================================================

create or replace function public.notify_user(
  p_user_id uuid, p_category text, p_title text, p_body text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.notifications (school_id, user_id, category, title, body)
  select school_id, id, p_category, p_title, p_body
  from public.user_profiles where id = p_user_id;
exception when others then
  null;
end;
$$;

create or replace function public.log_audit(
  p_action text, p_target text default null, p_details text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text;
begin
  select name into v_name from public.user_profiles where id = (select auth.uid());
  insert into public.audit_log (actor_id, actor_name, action, target, details)
  values ((select auth.uid()), v_name, p_action, p_target, p_details);
exception when others then
  null;
end;
$$;

grant execute on function public.notify_user to authenticated;
grant execute on function public.log_audit to authenticated;

-- ============================================================================
-- next_school_counter: atomic per-(school, counter) sequence, avoiding hundreds
-- of real Postgres SEQUENCEs (one per school x counter type). EXECUTE is revoked
-- from authenticated/anon — only callable from inside other security definer
-- functions below (convert_admission, the admission_no/application_no triggers).
-- ============================================================================

create table if not exists public.school_counters (
  school_id text not null references public.schools (id) on delete cascade,
  counter_name text not null,
  next_value integer not null default 1,
  primary key (school_id, counter_name)
);

create or replace function public.next_school_counter(p_school_id text, p_counter_name text)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_value integer;
begin
  insert into public.school_counters (school_id, counter_name, next_value)
    values (p_school_id, p_counter_name, 2)
  on conflict (school_id, counter_name)
    do update set next_value = school_counters.next_value + 1
  returning next_value - 1 into v_value;
  return v_value;
end;
$$;
revoke execute on function public.next_school_counter from authenticated, anon, public;

-- Assigns admission_no/application_no on direct inserts (not via convert_admission, which
-- assigns admission_no itself). Prefer a real counter over the original's
-- count-existing-rows-and-retry-on-collision loop, which could race under concurrent inserts.

create or replace function public.assign_student_admission_no()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.admission_no is null then
    new.admission_no := new.school_id || '-ADM-'
      || lpad(public.next_school_counter(new.school_id, 'admission_no')::text, 4, '0');
  end if;
  return new;
end;
$$;
create or replace trigger trg_assign_student_admission_no
  before insert on public.students
  for each row execute function public.assign_student_admission_no();

create or replace function public.assign_admission_application_no()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.application_no is null then
    new.application_no := new.school_id || '-APP-'
      || lpad(public.next_school_counter(new.school_id, 'application_no')::text, 4, '0');
  end if;
  return new;
end;
$$;
create or replace trigger trg_assign_admission_application_no
  before insert on public.admissions
  for each row execute function public.assign_admission_application_no();

-- ============================================================================
-- pay_fee: the only write path for PARENT/STUDENT (no general UPDATE policy
-- grants them access to `fees` — see 26_rls_policies_operations.sql).
-- ============================================================================

create or replace function public.pay_fee(p_fee_id uuid, p_amount numeric)
returns public.fees
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fee public.fees;
  v_payable numeric;
  v_new_paid numeric;
  v_status text;
  v_recipient uuid;
begin
  select * into v_fee from public.fees where id = p_fee_id;
  if v_fee is null then raise exception 'Fee not found'; end if;
  if v_fee.school_id <> (select public.jwt_school_id()) then raise exception 'Forbidden'; end if;
  if not public.owns_student(v_fee.student_id) then raise exception 'Forbidden'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  v_payable := v_fee.amount - v_fee.discount + v_fee.fine;
  v_new_paid := least(v_fee.paid_amount + p_amount, v_payable);
  v_status := case when v_new_paid >= v_payable then 'Paid' else 'Partial' end;

  update public.fees set
      paid_amount = v_new_paid,
      status = v_status,
      paid_on = now(),
      receipt_no = 'RCPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    where id = p_fee_id
    returning * into v_fee;

  select id into v_recipient from public.user_profiles
    where linked_student_id = v_fee.student_id limit 1;
  if v_recipient is not null then
    perform public.notify_user(v_recipient, 'Fees', 'Payment received',
      'Your fee payment of ' || p_amount || ' was recorded.');
  end if;

  return v_fee;
end;
$$;
grant execute on function public.pay_fee to authenticated;

-- ============================================================================
-- convert_admission: single transaction for a multi-table write that was
-- unwrapped separate statements in the original (a real bug, not preserved).
-- ============================================================================

create or replace function public.convert_admission(p_admission_id uuid)
returns public.students
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admission public.admissions;
  v_parent_id uuid;
  v_student public.students;
  v_seq integer;
begin
  select * into v_admission from public.admissions where id = p_admission_id;
  if v_admission is null then raise exception 'Admission not found'; end if;
  if v_admission.school_id <> (select public.jwt_school_id()) then raise exception 'Forbidden'; end if;
  if not (select public.has_permission('admissions.manage')) then raise exception 'Forbidden'; end if;
  if v_admission.stage <> 'APPROVED' then
    raise exception 'Admission must be APPROVED to convert (currently %)', v_admission.stage;
  end if;

  select id into v_parent_id from public.parents
    where school_id = v_admission.school_id
      and (
        (v_admission.contact_email is not null and email = v_admission.contact_email)
        or (v_admission.contact_phone is not null and phone = v_admission.contact_phone)
      )
    limit 1;

  if v_parent_id is null then
    insert into public.parents (school_id, name, email, phone)
      values (
        v_admission.school_id,
        coalesce(v_admission.parent_name, v_admission.applicant || ' Guardian'),
        v_admission.contact_email, v_admission.contact_phone
      )
      returning id into v_parent_id;
  end if;

  v_seq := public.next_school_counter(v_admission.school_id, 'admission_no');

  insert into public.students (
    school_id, name, admission_no, class_id, class_name, section, parent_id, dob, address, admitted_on
  ) values (
    v_admission.school_id, v_admission.applicant,
    v_admission.school_id || '-ADM-' || lpad(v_seq::text, 4, '0'),
    v_admission.class_id_applied, v_admission.class_applied, v_admission.section_applied,
    v_parent_id, v_admission.dob, v_admission.address, current_date
  ) returning * into v_student;

  insert into public.student_guardians (school_id, student_id, parent_id, is_primary)
    values (v_admission.school_id, v_student.id, v_parent_id, true);

  update public.admissions set
      stage = 'CONVERTED', converted_student_id = v_student.id,
      admission_no = v_student.admission_no, updated_at = now()
    where id = p_admission_id;

  -- admissions.stage is an enum (30_status_enums.sql); admission_status_history.from_stage
  -- stays plain text, so the enum value needs an explicit ::text on the way in.
  insert into public.admission_status_history (school_id, admission_id, from_stage, to_stage, changed_by)
    values (v_admission.school_id, p_admission_id, v_admission.stage::text, 'CONVERTED', (select auth.uid()));

  return v_student;
end;
$$;
grant execute on function public.convert_admission to authenticated;

-- ============================================================================
-- set_role_permissions / get_effective_permissions / set_user_status.
-- ============================================================================

-- Always a full delete+reinsert of the (school,role,department) permission set, matching
-- today's "writes ALL permission rows as a replace, not a merge" semantics. Hard-blocks
-- SCHOOL_ADMIN edits — preserves the original's lockout-risk safety rail.
create or replace function public.set_role_permissions(
  p_school_id text, p_role text, p_department text, p_permissions jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_school_id <> (select public.jwt_school_id()) then raise exception 'Forbidden'; end if;
  if not (select public.has_permission('users.manage')) then raise exception 'Forbidden'; end if;
  if p_role = 'SCHOOL_ADMIN' then raise exception 'SCHOOL_ADMIN permissions cannot be edited'; end if;
  if p_role not in ('TEACHER', 'STAFF', 'PARENT', 'STUDENT') then raise exception 'Invalid role'; end if;

  delete from public.school_role_permissions
    where school_id = p_school_id and role = p_role and department is not distinct from p_department;

  insert into public.school_role_permissions (school_id, role, department, permission, enabled)
  select p_school_id, p_role, p_department, perm.key, (perm.value #>> '{}')::boolean
  from jsonb_each(p_permissions) as perm (key, value);
end;
$$;
grant execute on function public.set_role_permissions to authenticated;

create or replace function public.get_effective_permissions()
returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.jwt_school_id();
  v_role text := public.jwt_role();
  v_dept text := public.jwt_department();
  v_override_exists boolean;
begin
  if v_role = 'SUPER_ADMIN' then
    return array['schools.view', 'schools.manage'];
  end if;
  if v_role = 'SCHOOL_ADMIN' then
    return array(select key from public.permissions where key not like 'schools.%');
  end if;

  select exists (
    select 1 from public.school_role_permissions srp
    where srp.school_id = v_school and srp.role = v_role and srp.department is not distinct from v_dept
  ) into v_override_exists;

  if v_override_exists then
    return array(
      select permission from public.school_role_permissions
      where school_id = v_school and role = v_role and department is not distinct from v_dept
        and enabled = true
    );
  end if;

  return array(
    select permission from public.role_permission_defaults
    -- see the matching cast in has_permission() (23_rls_helpers.sql) for why this is needed
    where role = v_role::public.assignable_role
      and department is not distinct from v_dept::public.staff_department
  );
end;
$$;
grant execute on function public.get_effective_permissions to authenticated;

-- Narrow enough not to need a general UPDATE policy on user_profiles.
create or replace function public.set_user_status(p_user_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_target public.user_profiles;
begin
  if p_status not in ('ACTIVE', 'SUSPENDED') then raise exception 'Invalid status'; end if;
  select * into v_target from public.user_profiles where id = p_user_id;
  if v_target is null then raise exception 'User not found'; end if;
  if v_target.id = (select auth.uid()) then raise exception 'Cannot change your own status'; end if;

  if (select public.jwt_role()) = 'SUPER_ADMIN' then
    null; -- allowed
  elsif (select public.jwt_role()) = 'SCHOOL_ADMIN' and v_target.school_id = (select public.jwt_school_id()) then
    null; -- allowed
  else
    raise exception 'Forbidden';
  end if;

  -- user_profiles.status is an enum (30_status_enums.sql); p_status is text, so cast.
  update public.user_profiles set status = p_status::public.user_profile_status where id = p_user_id;
end;
$$;
grant execute on function public.set_user_status to authenticated;

-- ============================================================================
-- bulk_upsert_attendance: one round trip for a whole class, atomic (all rows
-- save or none do) instead of 30-40 individual inserts.
-- ============================================================================

create or replace function public.bulk_upsert_attendance(
  p_class_id uuid, p_date date, p_entries jsonb  -- [{"student_id": "...", "status": "Present"}, ...]
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.jwt_school_id();
begin
  if not (select public.has_permission('attendance.create')) then raise exception 'Forbidden'; end if;
  if (select public.jwt_role()) = 'TEACHER' and not public.is_class_teacher_of(p_class_id) then
    raise exception 'Forbidden';
  end if;

  -- attendance.status is an enum (30_status_enums.sql); ->> always returns text, so cast.
  insert into public.attendance (school_id, student_id, class_id, date, status)
  select v_school, (e ->> 'student_id')::uuid, p_class_id, p_date, (e ->> 'status')::public.attendance_status
  from jsonb_array_elements(p_entries) as e
  where exists (
    select 1 from public.students s
    where s.id = (e ->> 'student_id')::uuid and s.class_id = p_class_id and s.school_id = v_school
  )
  on conflict (student_id, date) do update set status = excluded.status;
end;
$$;
grant execute on function public.bulk_upsert_attendance to authenticated;
