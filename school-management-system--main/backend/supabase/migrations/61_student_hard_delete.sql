-- ============================================================================
-- Deleting a student always deletes them fully — it never falls back to archiving.
--
-- delete_student_permanently(p_student_id) removes, for a student of the caller's school:
--   • the student's portal login (auth.users → user_profiles → notifications cascade)
--   • their leave requests (no foreign key, so removed explicitly)
--   • the student row itself; every table that references students
--     (fees, fee_payments, attendance, results, homework_submissions, certificates,
--     library_records, transport_attendance, student_guardians, …) cascades with it.
--
-- The older delete_student() archived a student whenever linked records existed. It now
-- simply calls the permanent delete, so every caller behaves the same.
-- ============================================================================

create or replace function public.delete_student_permanently(p_student_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := (select public.jwt_school_id());
  v_name   text;
begin
  if v_school is null or not (select public.has_permission('students.delete')) then
    raise exception 'Forbidden';
  end if;

  select name into v_name from public.students
  where id = p_student_id and school_id = v_school;
  if v_name is null then
    raise exception 'Student not found';
  end if;

  -- Portal login(s) linked to this student.
  delete from auth.users
  where id in (select id from public.user_profiles where linked_student_id = p_student_id);

  -- Leave requests point at the student without a foreign key.
  delete from public.leave_requests
  where school_id = v_school and requester_type = 'STUDENT' and requester_id = p_student_id;

  -- The student; everything referencing it cascades.
  delete from public.students where id = p_student_id and school_id = v_school;

  perform public.log_audit('student.deleted', p_student_id::text, v_name);
  return jsonb_build_object('deleted', true, 'archived', false);
end;
$$;

revoke all on function public.delete_student_permanently(uuid) from public;
grant execute on function public.delete_student_permanently(uuid) to authenticated;

-- Keep the old entry point, but make it delete fully too.
drop function if exists public.delete_student(uuid);
create function public.delete_student(p_student_id uuid)
returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select public.delete_student_permanently(p_student_id);
$$;
revoke all on function public.delete_student(uuid) from public;
grant execute on function public.delete_student(uuid) to authenticated;

notify pgrst, 'reload schema';
