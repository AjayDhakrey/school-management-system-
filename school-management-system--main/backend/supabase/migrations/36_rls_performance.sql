-- ============================================================================
-- RLS performance fix.
--
-- teaches_class(class_id) / is_class_teacher_of(class_id) / owns_student(id)
-- take a per-row argument, so Postgres re-evaluates them for every candidate
-- row — and each call re-parses auth.jwt(). On a teacher login that blew the
-- 8s statement_timeout on `students`, `classes` and `homework`.
--
-- Fix: expose the caller's class / student id sets as STABLE set-returning
-- functions, then test membership with `col in (select fn())`. A zero-arg STABLE
-- function is hoisted, so it is evaluated ONCE per statement instead of per row.
-- The row-level helpers are kept (still used inside RPCs and WITH CHECK, where
-- the row count is 1).
-- ============================================================================

create index if not exists idx_classes_class_teacher on public.classes (class_teacher_id);
create index if not exists idx_student_guardians_parent on public.student_guardians (parent_id, student_id);
create index if not exists idx_results_student on public.results (student_id);
create index if not exists idx_fees_student on public.fees (student_id);
create index if not exists idx_attendance_student on public.attendance (student_id);

-- Classes the caller teaches (assigned via class_subjects OR is Class Teacher of).
create or replace function public.current_teacher_class_ids()
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select cs.class_id from public.class_subjects cs
    where cs.teacher_id = public.jwt_linked_teacher_id()
  union
  select cl.id from public.classes cl
    where cl.class_teacher_id = public.jwt_linked_teacher_id()
$$;

-- Classes the caller is specifically the Class Teacher of (narrower).
create or replace function public.current_class_teacher_class_ids()
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select cl.id from public.classes cl
   where cl.class_teacher_id = public.jwt_linked_teacher_id()
$$;

-- Students the caller owns: themself (STUDENT) or their wards (PARENT).
create or replace function public.current_owned_student_ids()
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select public.jwt_linked_student_id()
   where public.jwt_role() = 'STUDENT' and public.jwt_linked_student_id() is not null
  union
  select sg.student_id from public.student_guardians sg
   where public.jwt_role() = 'PARENT' and sg.parent_id = public.jwt_linked_parent_id()
$$;

grant execute on function public.current_teacher_class_ids to authenticated;
grant execute on function public.current_class_teacher_class_ids to authenticated;
grant execute on function public.current_owned_student_ids to authenticated;

-- ---------------------------------------------------------------------------
-- Repoint every policy that used the per-row helpers.
-- ---------------------------------------------------------------------------

-- students
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('students.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and class_id in (select public.current_teacher_class_ids()))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and id in (select public.current_owned_student_ids()))
  )
);

-- classes
drop policy if exists "classes_select" on public.classes;
create policy "classes_select" on public.classes for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('classes.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and id in (select public.current_teacher_class_ids()))
    or (
      (select public.jwt_role()) in ('PARENT', 'STUDENT')
      and exists (
        select 1 from public.students s
         where s.class_id = classes.id and s.id in (select public.current_owned_student_ids())
      )
    )
  )
);

-- parents (STUDENT branch used a student_guardians lookup per row)
drop policy if exists "parents_select" on public.parents;
create policy "parents_select" on public.parents for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('parents.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or ((select public.jwt_role()) = 'PARENT' and id = (select public.jwt_linked_parent_id()))
    or (
      (select public.jwt_role()) = 'STUDENT'
      and exists (
        select 1 from public.student_guardians sg
         where sg.parent_id = parents.id and sg.student_id = (select public.jwt_linked_student_id())
      )
    )
  )
);

-- attendance
drop policy if exists "attendance_select" on public.attendance;
create policy "attendance_select" on public.attendance for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('attendance.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and class_id in (select public.current_teacher_class_ids()))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and student_id in (select public.current_owned_student_ids()))
  )
);
drop policy if exists "attendance_write" on public.attendance;
create policy "attendance_write" on public.attendance for all to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('attendance.create'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and class_id in (select public.current_class_teacher_class_ids()))
  )
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

-- fees
drop policy if exists "fees_select" on public.fees;
create policy "fees_select" on public.fees for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('fees.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or (
      (select public.jwt_role()) = 'TEACHER'
      and exists (
        select 1 from public.students s
         where s.id = fees.student_id and s.class_id in (select public.current_teacher_class_ids())
      )
    )
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and student_id in (select public.current_owned_student_ids()))
  )
);

-- exams
drop policy if exists "exams_select" on public.exams;
create policy "exams_select" on public.exams for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('exams.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and class_id in (select public.current_teacher_class_ids()))
    or (
      (select public.jwt_role()) in ('PARENT', 'STUDENT')
      and exists (
        select 1 from public.students s
         where s.class_id = exams.class_id and s.id in (select public.current_owned_student_ids())
      )
    )
  )
);

-- results
drop policy if exists "results_select" on public.results;
create policy "results_select" on public.results for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('results.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or (
      (select public.jwt_role()) in ('PARENT', 'STUDENT')
      and student_id in (select public.current_owned_student_ids())
      and published_at >= now() - interval '48 hours'
    )
  )
);

-- homework
drop policy if exists "homework_select" on public.homework;
create policy "homework_select" on public.homework for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('homework.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and class_id in (select public.current_teacher_class_ids()))
    or (
      (select public.jwt_role()) in ('PARENT', 'STUDENT')
      and exists (
        select 1 from public.students s
         where s.class_id = homework.class_id and s.id in (select public.current_owned_student_ids())
      )
    )
  )
);
drop policy if exists "homework_insert" on public.homework;
create policy "homework_insert" on public.homework for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('homework.create'))
  and ((select public.jwt_role()) <> 'TEACHER' or class_id in (select public.current_teacher_class_ids()))
);

-- homework_submissions
drop policy if exists "homework_submissions_select" on public.homework_submissions;
create policy "homework_submissions_select" on public.homework_submissions for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('homework.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and student_id in (select public.current_owned_student_ids()))
  )
);

-- library_records
drop policy if exists "library_records_select" on public.library_records;
create policy "library_records_select" on public.library_records for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('library.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and student_id in (select public.current_owned_student_ids()))
  )
);

-- certificates
drop policy if exists "certificates_select" on public.certificates;
create policy "certificates_select" on public.certificates for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('certificates.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and student_id in (select public.current_owned_student_ids()))
  )
);

-- timetable_slots
drop policy if exists "timetable_slots_select" on public.timetable_slots;
create policy "timetable_slots_select" on public.timetable_slots for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('timetable.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and class_id in (select public.current_teacher_class_ids()))
    or (
      (select public.jwt_role()) in ('PARENT', 'STUDENT')
      and exists (
        select 1 from public.students s
         where s.class_id = timetable_slots.class_id and s.id in (select public.current_owned_student_ids())
      )
    )
  )
);

-- leave_requests
drop policy if exists "leave_requests_select" on public.leave_requests;
create policy "leave_requests_select" on public.leave_requests for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.has_permission('leave.manage'))
    or ((select public.jwt_role()) = 'TEACHER' and requester_type = 'TEACHER'
        and requester_id = (select public.jwt_linked_teacher_id()))
    or (
      (select public.jwt_role()) = 'TEACHER' and requester_type = 'STUDENT'
      and exists (
        select 1 from public.students s
         where s.id = leave_requests.requester_id
           and s.class_id in (select public.current_class_teacher_class_ids())
      )
    )
    or ((select public.jwt_role()) = 'STAFF' and requester_type = 'STAFF' and requester_id = (select auth.uid()))
    or ((select public.jwt_role()) = 'STUDENT' and requester_type = 'STUDENT'
        and requester_id = (select public.jwt_linked_student_id()))
    or ((select public.jwt_role()) = 'PARENT' and requester_type = 'STUDENT'
        and requester_id in (select public.current_owned_student_ids()))
  )
);
drop policy if exists "leave_requests_insert" on public.leave_requests;
create policy "leave_requests_insert" on public.leave_requests for insert to authenticated with check (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('leave.view'))
  and (
    ((select public.jwt_role()) = 'TEACHER' and requester_type = 'TEACHER'
      and requester_id = (select public.jwt_linked_teacher_id()))
    or ((select public.jwt_role()) = 'STAFF' and requester_type = 'STAFF' and requester_id = (select auth.uid()))
    or ((select public.jwt_role()) = 'STUDENT' and requester_type = 'STUDENT'
        and requester_id = (select public.jwt_linked_student_id()))
    or ((select public.jwt_role()) = 'PARENT' and requester_type = 'STUDENT'
        and requester_id in (select public.current_owned_student_ids()))
    or ((select public.jwt_role()) = 'SCHOOL_ADMIN' and requester_type = 'STUDENT')
  )
);
drop policy if exists "leave_requests_approve" on public.leave_requests;
create policy "leave_requests_approve" on public.leave_requests for update to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.jwt_role()) = 'SCHOOL_ADMIN'
    or (select public.has_permission('leave.manage'))
    or (
      (select public.jwt_role()) = 'TEACHER' and requester_type = 'STUDENT'
      and exists (
        select 1 from public.students s
         where s.id = leave_requests.requester_id
           and s.class_id in (select public.current_class_teacher_class_ids())
      )
    )
  )
) with check (
  school_id = (select public.jwt_school_id())
);
