-- ============================================================================
-- Student IDs for logging in without an email address.
--
-- Many students (especially young ones) have no email, so each student gets a
-- Student ID: school code + first two letters of their name + last four digits of
-- their admission number, e.g. DPS + SH + 0042 = DPSSH0042. Their login uses an
-- internal address derived from that ID (see the manage-user-login function); the
-- first password is their date of birth (DDMMYYYY) and must be changed on first login.
-- Class teachers (or the school admin) create the logins for a whole class at once.
-- ============================================================================

-- The "School code" field in School Settings writes schools.code; make sure it exists.
alter table public.schools add column if not exists code text;

alter table public.students add column if not exists student_code text;
create unique index if not exists uq_students_student_code
  on public.students (upper(student_code)) where student_code is not null;

alter table public.user_profiles
  add column if not exists must_change_password boolean not null default false;

-- ----------------------------------------------------------------------------
-- School part of the ID: the School code if one is set (letters/digits only),
-- otherwise the initials of the school's name ("Delhi Public School" -> DPS).
-- ----------------------------------------------------------------------------
create or replace function public.school_login_prefix(p_school_id text)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_code text;
  v_name text;
  v_initials text := '';
  v_word text;
begin
  select code, name into v_code, v_name from public.schools where id = p_school_id;
  v_code := upper(regexp_replace(coalesce(v_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_code <> '' then return left(v_code, 6); end if;
  foreach v_word in array regexp_split_to_array(coalesce(v_name, ''), '[^A-Za-z]+') loop
    if v_word <> '' then v_initials := v_initials || upper(left(v_word, 1)); end if;
  end loop;
  return coalesce(nullif(left(v_initials, 4), ''), 'SCH');
end;
$$;

-- ----------------------------------------------------------------------------
-- School code + 2 name letters + last 4 admission digits. Admission numbers without
-- digits use the school's counter instead; a clash gets a letter suffix (…A, …B).
-- ----------------------------------------------------------------------------
create or replace function public.make_student_code(
  p_school_id text, p_name text, p_admission_no text
) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_letters text;
  v_digits text;
  v_base text;
  v_try text;
  v_n integer := 0;
begin
  v_letters := rpad(upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'), 2)), 2, 'X');
  v_digits := regexp_replace(coalesce(p_admission_no, ''), '[^0-9]', '', 'g');
  if v_digits = '' then
    v_digits := public.next_school_counter(p_school_id, 'student_code')::text;
  end if;
  v_digits := right(lpad(v_digits, 4, '0'), 4);
  v_base := public.school_login_prefix(p_school_id) || v_letters || v_digits;
  v_try := v_base;
  while exists (select 1 from public.students where upper(student_code) = v_try) loop
    v_n := v_n + 1;
    v_try := v_base || case when v_n <= 26 then chr(64 + v_n) else v_n::text end;
  end loop;
  return v_try;
end;
$$;
revoke execute on function public.make_student_code(text, text, text) from public, anon, authenticated;

-- New students (direct adds and converted admissions) get their ID on insert. This fires
-- after trg_assign_student_admission_no (triggers run in name order), so the admission
-- number is already there. The ID never changes afterwards, so renames don't break logins.
create or replace function public.assign_student_code()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.student_code is null then
    new.student_code := public.make_student_code(new.school_id, new.name, new.admission_no);
  end if;
  return new;
end;
$$;
create or replace trigger trg_assign_student_code
  before insert on public.students
  for each row execute function public.assign_student_code();

-- Existing students: one at a time so each new ID is visible to the clash check.
do $$
declare
  r record;
begin
  for r in
    select id, school_id, name, admission_no from public.students
    where student_code is null
    order by school_id, admission_no nulls last, id
  loop
    update public.students
      set student_code = public.make_student_code(r.school_id, r.name, r.admission_no)
      where id = r.id;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Login status for one class, for the class teacher or the school admin.
-- user_profiles is only readable by admins, so this is the teacher's window into it.
-- ----------------------------------------------------------------------------
create or replace function public.class_student_logins(p_class_id uuid)
returns table (
  student_id uuid,
  name text,
  roll integer,
  admission_no text,
  student_code text,
  dob date,
  has_login boolean,
  login_is_student_id boolean,
  must_change_password boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_school text;
  v_class_teacher uuid;
begin
  select c.school_id, c.class_teacher_id into v_school, v_class_teacher
  from public.classes c where c.id = p_class_id;
  if v_school is null or v_school <> (select public.jwt_school_id()) then
    raise exception 'Class not found';
  end if;
  if not (
    (select public.jwt_role()) = 'SCHOOL_ADMIN'
    or ((select public.jwt_role()) = 'TEACHER'
        and v_class_teacher = (select public.jwt_linked_teacher_id()))
  ) then
    raise exception 'Only the class teacher or the school admin can manage these logins';
  end if;

  return query
  select s.id, s.name, s.roll, s.admission_no, s.student_code, s.dob,
         up.id is not null,
         coalesce(up.email like '%@students.edunex.invalid', false),
         coalesce(up.must_change_password, false)
  from public.students s
  left join public.user_profiles up on up.linked_student_id = s.id
  where s.class_id = p_class_id
  order by s.roll nulls last, s.name;
end;
$$;
grant execute on function public.class_student_logins(uuid) to authenticated;

-- A student finishing their forced first-login password change.
create or replace function public.complete_password_change()
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.user_profiles set must_change_password = false where id = auth.uid();
$$;
grant execute on function public.complete_password_change() to authenticated;
