-- JWT claim extractors. `app_role`/`school_id`/`department`/`linked_*_id` are injected by
-- the custom access token hook in 24_auth_hook.sql from user_profiles at token-issue time.
create or replace function public.jwt_role() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'app_role', '')
$$;

create or replace function public.jwt_school_id() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'school_id', '')
$$;

create or replace function public.jwt_department() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'department', '')
$$;

create or replace function public.jwt_linked_teacher_id() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'linked_teacher_id', '')::uuid
$$;

create or replace function public.jwt_linked_parent_id() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'linked_parent_id', '')::uuid
$$;

create or replace function public.jwt_linked_student_id() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'linked_student_id', '')::uuid
$$;

create or replace function public.jwt_linked_staff_id() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'linked_staff_id', '')::uuid
$$;

-- True if the caller (STUDENT: themself; PARENT: one of their guardian links) owns this student.
create or replace function public.owns_student(p_student_id uuid) returns boolean
language sql stable as $$
  select case public.jwt_role()
    when 'STUDENT' then p_student_id = public.jwt_linked_student_id()
    when 'PARENT' then exists (
      select 1 from public.student_guardians sg
      where sg.student_id = p_student_id and sg.parent_id = public.jwt_linked_parent_id()
    )
    else false
  end
$$;

-- True if the caller (TEACHER) is assigned to teach this class (class_subjects) OR is its
-- Class Teacher. Broader than is_class_teacher_of() below.
create or replace function public.teaches_class(p_class_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.class_subjects cs
    where cs.class_id = p_class_id and cs.teacher_id = public.jwt_linked_teacher_id()
  ) or exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.class_teacher_id = public.jwt_linked_teacher_id()
  )
$$;

-- True only if the caller is specifically the Class Teacher of this class — narrower than
-- teaches_class(), used to gate marking attendance / entering results / approving student leave.
create or replace function public.is_class_teacher_of(p_class_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.class_teacher_id = public.jwt_linked_teacher_id()
  )
$$;

-- Resolves the caller's effective permission set: any school_role_permissions row for
-- (school, role, department) replaces role_permission_defaults entirely (not merged);
-- zero rows falls back to the default. security definer because the caller's own RLS on
-- school_role_permissions would otherwise block reading other roles' override rows.
create or replace function public.has_permission(p_permission text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.jwt_school_id();
  v_role text := public.jwt_role();
  v_dept text := public.jwt_department();
  v_override_exists boolean;
begin
  if v_role in ('SUPER_ADMIN', 'SCHOOL_ADMIN') then
    return v_role = 'SUPER_ADMIN' and p_permission like 'schools.%'
        or v_role = 'SCHOOL_ADMIN' and p_permission not like 'schools.%';
  end if;

  select exists (
    select 1 from public.school_role_permissions srp
    where srp.school_id = v_school and srp.role = v_role
      and srp.department is not distinct from v_dept
  ) into v_override_exists;

  if v_override_exists then
    return coalesce((
      select bool_or(enabled) from public.school_role_permissions srp
      where srp.school_id = v_school and srp.role = v_role
        and srp.department is not distinct from v_dept
        and srp.permission = p_permission and srp.enabled = true
    ), false);
  end if;

  return exists (
    select 1 from public.role_permission_defaults d
    -- v_role/v_dept are text (from the JWT); role_permission_defaults.role/department are
    -- enums as of 30_status_enums.sql — cast explicitly, a bare `= v_role` won't auto-coerce
    -- a typed text value the way it coerces an untyped string literal.
    where d.role = v_role::public.assignable_role
      and d.department is not distinct from v_dept::public.staff_department
      and d.permission = p_permission
  );
end;
$$;

-- Gates WRITES only, not reads — a suspended school's admin should still see their own data
-- and know why they're locked out, just not create new rows. This is NEW enforcement, not
-- preserved behavior (nothing checks schools.status today). Confirm this product behavior
-- during Phase A verification before relying on it in the frontend.
create or replace function public.school_is_active() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select status not in ('SUSPENDED', 'EXPIRED') from public.schools
      where id = (select public.jwt_school_id())),
    false
  )
$$;
