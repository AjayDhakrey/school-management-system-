-- ============================================================================
-- Multi-step writes that were application code in Express and can't be a single
-- RLS-governed statement: SUPER_ADMIN subscription/lead flows, school id-gen,
-- the Roles admin matrix, and the teacher-assignment replace.
-- ============================================================================

-- schools.id is a human key ("SCH-000123"). Express generated it as
-- `SCH-${String(Date.now()).slice(-6)}`. Do the same in a BEFORE INSERT trigger
-- so the client can just insert (name, short_name, ...).
create or replace function public.tg_schools_generate_id()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id is null or new.id = '' then
    new.id := 'SCH-' || right((extract(epoch from clock_timestamp()) * 1000)::bigint::text, 6);
  end if;
  return new;
end;
$$;
create or replace trigger trg_schools_generate_id
  before insert on public.schools
  for each row execute function public.tg_schools_generate_id();

-- ----------------------------------------------------------------------------
-- record_payment: insert a payment + renew the school's subscription.
-- Mirrors server/src/routes/payments.ts POST.
-- ----------------------------------------------------------------------------
create or replace function public.record_payment(
  p_school_id text,
  p_amount numeric,
  p_method text default 'Manual',
  p_plan text default null,
  p_extends_days integer default 30
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_expires timestamptz;
  v_days integer := greatest(coalesce(p_extends_days, 30), 1);
begin
  if (select public.jwt_role()) <> 'SUPER_ADMIN' then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select subscription_expires_at into v_expires from public.schools where id = p_school_id;
  if not found then raise exception 'School not found'; end if;

  insert into public.payments (school_id, amount, method, plan)
    values (p_school_id, p_amount, coalesce(p_method, 'Manual'), p_plan)
    returning id into v_id;

  update public.schools set
      payment_status = 'PAID',
      status = case when status in ('TRIAL','EXPIRED','INACTIVE') then 'ACTIVE'::public.school_status else status end,
      subscription_expires_at =
        (case when v_expires is not null and v_expires > now() then v_expires else now() end)
        + (v_days || ' days')::interval
    where id = p_school_id;

  perform public.log_audit('payment.recorded', p_school_id, p_amount || ' via ' || coalesce(p_method,'Manual'));
  return v_id;
end;
$$;
grant execute on function public.record_payment to authenticated;

-- ----------------------------------------------------------------------------
-- convert_lead: spin up a TRIAL school from a lead. Mirrors leads.ts convert.
-- ----------------------------------------------------------------------------
create or replace function public.convert_lead(
  p_lead_id uuid,
  p_plan text default 'Basic',
  p_billing_cycle text default 'MONTHLY'
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lead public.leads;
  v_school_id text;
  v_short text;
begin
  if (select public.jwt_role()) <> 'SUPER_ADMIN' then raise exception 'Forbidden'; end if;
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then raise exception 'Lead not found'; end if;
  if v_lead.status = 'CONVERTED' then raise exception 'Lead already converted'; end if;

  v_short := nullif(array_to_string((string_to_array(v_lead.school_name, ' '))[1:2], ' '), '');
  v_school_id := 'SCH-' || right((extract(epoch from clock_timestamp()) * 1000)::bigint::text, 6);

  insert into public.schools (id, name, short_name, email, phone, status, plan, billing_cycle, payment_status, subscription_started_at)
    values (v_school_id, v_lead.school_name, coalesce(v_short, v_lead.school_name),
            v_lead.email, v_lead.phone, 'TRIAL', coalesce(p_plan,'Basic'),
            coalesce(p_billing_cycle,'MONTHLY')::public.billing_cycle, 'PENDING', current_date);

  update public.leads set status = 'CONVERTED' where id = p_lead_id;
  perform public.log_audit('lead.converted', p_lead_id::text, v_school_id);
  return v_school_id;
end;
$$;
grant execute on function public.convert_lead to authenticated;

-- ----------------------------------------------------------------------------
-- get_school_role_matrix: the /roles admin page. get_effective_permissions()
-- only covers the current user; this returns every editable role's effective +
-- default set for the caller's school. Shape matches ApiRolesResponse.roles[].
-- ----------------------------------------------------------------------------
create or replace function public.get_school_role_matrix()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.jwt_school_id();
  v_rows jsonb := '[]'::jsonb;
  r record;
  v_default text[];
  v_effective text[];
  v_customized boolean;
begin
  if not (select public.has_permission('users.view')) then raise exception 'Forbidden'; end if;

  for r in
    select 'TEACHER'::text role, null::text dept
    union all select 'PARENT', null
    union all select 'STUDENT', null
    union all select 'STAFF', 'ADMIN'
    union all select 'STAFF', 'ACCOUNTS'
    union all select 'STAFF', 'LIBRARY'
    union all select 'STAFF', 'TRANSPORT'
  loop
    v_default := array(
      select permission from public.role_permission_defaults
      where role = r.role::public.assignable_role
        and department is not distinct from r.dept::public.staff_department
    );
    select exists (
      select 1 from public.school_role_permissions
      where school_id = v_school and role = r.role and department is not distinct from r.dept
    ) into v_customized;
    if v_customized then
      v_effective := array(
        select permission from public.school_role_permissions
        where school_id = v_school and role = r.role and department is not distinct from r.dept
          and enabled = true
      );
    else
      v_effective := v_default;
    end if;
    v_rows := v_rows || jsonb_build_object(
      'role', r.role, 'department', r.dept,
      'permissions', to_jsonb(v_effective),
      'customized', v_customized,
      'defaultPermissions', to_jsonb(v_default)
    );
  end loop;

  return jsonb_build_object(
    'permissions', to_jsonb(array(select key from public.permissions order by key)),
    'editableRoles', to_jsonb(array['TEACHER','STAFF','PARENT','STUDENT']),
    'roles', v_rows,
    'schoolAdminPermissions', to_jsonb(array(select key from public.permissions where key not like 'schools.%' order by key))
  );
end;
$$;
grant execute on function public.get_school_role_matrix to authenticated;

-- ----------------------------------------------------------------------------
-- set_teacher_assignments: atomic replace of a teacher's class_subjects rows.
-- Fixes M8 (the frontend syncAssignments fired N un-batched calls, could
-- half-apply, and left the teacher's old pairs released even on a later error).
-- p_class_ids x p_subject_ids is the cross-product the teacher now teaches.
-- ----------------------------------------------------------------------------
create or replace function public.set_teacher_assignments(
  p_teacher_id uuid,
  p_class_ids uuid[],
  p_subject_ids uuid[]
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.jwt_school_id();
begin
  if not (select public.has_permission('subjects.manage')) then raise exception 'Forbidden'; end if;
  if not exists (select 1 from public.teachers where id = p_teacher_id and school_id = v_school) then
    raise exception 'Teacher not found';
  end if;

  -- release everything this teacher currently owns
  update public.class_subjects set teacher_id = null
    where teacher_id = p_teacher_id and school_id = v_school;

  -- claim the new cross-product (insert the mapping row if the class/subject pair
  -- doesn't exist yet, else point it at this teacher)
  insert into public.class_subjects (school_id, class_id, subject_id, teacher_id)
  select v_school, c, s, p_teacher_id
  from unnest(coalesce(p_class_ids, '{}')) c
  cross join unnest(coalesce(p_subject_ids, '{}')) s
  where exists (select 1 from public.classes cl where cl.id = c and cl.school_id = v_school)
    and exists (select 1 from public.subjects su where su.id = s and su.school_id = v_school)
  on conflict (class_id, subject_id) do update set teacher_id = excluded.teacher_id;
end;
$$;
grant execute on function public.set_teacher_assignments to authenticated;
