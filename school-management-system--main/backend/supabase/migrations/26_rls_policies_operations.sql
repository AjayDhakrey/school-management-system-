-- ============================================================================
-- Attendance (student daily) — TEACHER writes require being the Class Teacher
-- specifically (is_class_teacher_of), not just teaching the class.
-- ============================================================================

alter table public.attendance enable row level security;

create policy "attendance_select" on public.attendance for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('attendance.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and public.teaches_class(class_id))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and public.owns_student(student_id))
  )
);
create policy "attendance_write" on public.attendance for all to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('attendance.create'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and public.is_class_teacher_of(class_id))
  )
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

-- ============================================================================
-- Teacher / staff self-attendance (admin marking + self check-in/check-out).
-- ============================================================================

alter table public.teacher_attendance enable row level security;
alter table public.staff_attendance enable row level security;

create policy "teacher_attendance_select" on public.teacher_attendance for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.has_permission('teacher_attendance.view'))
    or teacher_id = (select public.jwt_linked_teacher_id())
  )
);
create policy "teacher_attendance_write" on public.teacher_attendance for all to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.has_permission('teacher_attendance.manage'))
    or ((select public.has_permission('teacher_attendance.self'))
        and teacher_id = (select public.jwt_linked_teacher_id()))
  )
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

create policy "staff_attendance_select" on public.staff_attendance for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.has_permission('staff_attendance.view'))
    or staff_id = (select public.jwt_linked_staff_id())
  )
);
create policy "staff_attendance_write" on public.staff_attendance for all to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.has_permission('staff_attendance.manage'))
    or ((select public.has_permission('staff_attendance.self'))
        and staff_id = (select public.jwt_linked_staff_id()))
  )
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

-- ============================================================================
-- Fees. Deliberately NO update policy for PARENT/STUDENT — paying only happens
-- through pay_fee() (security definer RPC, 27_rpc_functions.sql).
-- ============================================================================

alter table public.fee_structures enable row level security;
alter table public.fees enable row level security;

create policy "fee_structures_select" on public.fee_structures for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('fee_structures.view'))
);
create policy "fee_structures_write" on public.fee_structures for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('fee_structures.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('fee_structures.manage'))
);

create policy "fees_select" on public.fees for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('fees.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and exists (
      select 1 from public.students s where s.id = fees.student_id and public.teaches_class(s.class_id)
    ))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and public.owns_student(student_id))
  )
);
create policy "fees_insert" on public.fees for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('fees.create'))
);
create policy "fees_update_staff" on public.fees for update to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('fees.update'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

-- ============================================================================
-- Exams / results. Results carry a 48h post-publish visibility window for
-- PARENT/STUDENT only — staff/teachers always see everything.
-- ============================================================================

alter table public.exams enable row level security;
alter table public.results enable row level security;

create policy "exams_select" on public.exams for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('exams.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and public.teaches_class(class_id))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and exists (
      select 1 from public.students s where s.class_id = exams.class_id and public.owns_student(s.id)
    ))
  )
);
create policy "exams_write" on public.exams for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('exams.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('exams.manage'))
);

create policy "results_select" on public.results for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('results.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and public.owns_student(student_id)
        and published_at >= now() - interval '48 hours')
  )
);
create policy "results_insert" on public.results for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('results.manage'))
  and (
    (select public.jwt_role()) <> 'TEACHER'
    or exists (select 1 from public.exams e where e.id = results.exam_id and public.is_class_teacher_of(e.class_id))
  )
);
create policy "results_update" on public.results for update to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('results.manage'))
  and (
    (select public.jwt_role()) <> 'TEACHER'
    or exists (select 1 from public.exams e where e.id = results.exam_id and public.is_class_teacher_of(e.class_id))
  )
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

-- ============================================================================
-- Homework + submissions.
-- ============================================================================

alter table public.homework enable row level security;
alter table public.homework_submissions enable row level security;

create policy "homework_select" on public.homework for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('homework.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and public.teaches_class(class_id))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and exists (
      select 1 from public.students s where s.class_id = homework.class_id and public.owns_student(s.id)
    ))
  )
);
create policy "homework_insert" on public.homework for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('homework.create'))
  and ((select public.jwt_role()) <> 'TEACHER' or public.teaches_class(class_id))
);
create policy "homework_update" on public.homework for update to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('homework.update'))
  and ((select public.jwt_role()) <> 'TEACHER' or teacher_id = (select public.jwt_linked_teacher_id()))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);
create policy "homework_delete" on public.homework for delete to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('homework.delete'))
  and ((select public.jwt_role()) <> 'TEACHER' or teacher_id = (select public.jwt_linked_teacher_id()))
);

create policy "homework_submissions_select" on public.homework_submissions for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('homework.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and public.owns_student(student_id))
  )
);
create policy "homework_submissions_insert" on public.homework_submissions for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('homework.submit'))
  and student_id = (select public.jwt_linked_student_id())
);
create policy "homework_submissions_update" on public.homework_submissions for update to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('homework.update'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

-- ============================================================================
-- Notices, notice reads, notifications.
-- ============================================================================

alter table public.notices enable row level security;
alter table public.notice_reads enable row level security;
alter table public.notifications enable row level security;

create policy "notices_select" on public.notices for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('notices.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or audience = 'All'
    or ((select public.jwt_role()) = 'TEACHER' and audience = 'Teachers')
    or ((select public.jwt_role()) = 'PARENT' and audience = 'Parents')
    or ((select public.jwt_role()) = 'STUDENT' and audience = 'Students')
  )
);
create policy "notices_write" on public.notices for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('notices.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('notices.manage'))
);

create policy "notice_reads_select" on public.notice_reads for select to authenticated using (
  user_id = (select auth.uid())
);
create policy "notice_reads_insert" on public.notice_reads for insert to authenticated with check (
  user_id = (select auth.uid())
);

create policy "notifications_select" on public.notifications for select to authenticated using (
  user_id = (select auth.uid())
);
create policy "notifications_update" on public.notifications for update to authenticated using (
  user_id = (select auth.uid())
) with check (
  user_id = (select auth.uid())
);
-- No insert policy for `authenticated` — written only via notify_user()
-- (security definer, 27_rpc_functions.sql).

-- ============================================================================
-- Library.
-- ============================================================================

alter table public.library_books enable row level security;
alter table public.library_records enable row level security;

create policy "library_books_select" on public.library_books for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('library.view'))
);
create policy "library_books_write" on public.library_books for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('library.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('library.manage'))
);

create policy "library_records_select" on public.library_records for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('library.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and public.owns_student(student_id))
  )
);
create policy "library_records_write" on public.library_records for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('library.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('library.manage'))
);

-- ============================================================================
-- Transport.
-- ============================================================================

alter table public.vehicles enable row level security;

create policy "vehicles_select" on public.vehicles for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.view'))
);
create policy "vehicles_write" on public.vehicles for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('transport.manage'))
);

-- ============================================================================
-- Admissions. Edits/deletes blocked once stage = 'CONVERTED' (conversion itself
-- happens only through convert_admission(), 27_rpc_functions.sql).
-- ============================================================================

alter table public.admissions enable row level security;
alter table public.admission_documents enable row level security;
alter table public.admission_notes enable row level security;
alter table public.admission_status_history enable row level security;

create policy "admissions_select" on public.admissions for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('admissions.view'))
);
create policy "admissions_insert" on public.admissions for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('admissions.manage'))
);
create policy "admissions_update" on public.admissions for update to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('admissions.manage'))
  and stage <> 'CONVERTED'
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);
create policy "admissions_delete" on public.admissions for delete to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('admissions.manage')) and stage <> 'CONVERTED'
);

create policy "admission_documents_all" on public.admission_documents for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('admissions.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('admissions.manage'))
);
create policy "admission_notes_all" on public.admission_notes for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('admissions.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('admissions.manage'))
);
create policy "admission_status_history_select" on public.admission_status_history for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('admissions.view'))
);
-- Inserted only as part of convert_admission()/plain-update trigger paths — no direct
-- write policy for `authenticated` needed beyond what admissions_update already allows
-- via application code calling this table in the same transaction is not possible under
-- RLS-only writes, so history rows for manual stage transitions are inserted by the
-- frontend immediately after a successful admissions_update, under this policy:
create policy "admission_status_history_insert" on public.admission_status_history for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('admissions.manage'))
);

-- ============================================================================
-- Timetable.
-- ============================================================================

alter table public.timetable_slots enable row level security;

create policy "timetable_slots_select" on public.timetable_slots for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('timetable.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and public.teaches_class(class_id))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and exists (
      select 1 from public.students s where s.class_id = timetable_slots.class_id and public.owns_student(s.id)
    ))
  )
);
create policy "timetable_slots_write" on public.timetable_slots for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('timetable.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('timetable.manage'))
);

-- ============================================================================
-- Leave requests. `leave_requests_approve` carries the bespoke carve-out:
-- leave.manage OR being the Class Teacher of the requesting student specifically.
-- ============================================================================

alter table public.leave_requests enable row level security;

create policy "leave_requests_select" on public.leave_requests for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.has_permission('leave.manage'))
    or ((select public.jwt_role()) = 'TEACHER' and requester_type = 'TEACHER'
        and requester_id = (select public.jwt_linked_teacher_id()))
    or ((select public.jwt_role()) = 'TEACHER' and requester_type = 'STUDENT' and exists (
      select 1 from public.students s where s.id = leave_requests.requester_id
        and public.is_class_teacher_of(s.class_id)
    ))
    or ((select public.jwt_role()) = 'STAFF' and requester_type = 'STAFF'
        and requester_id = (select auth.uid()))
    or ((select public.jwt_role()) = 'STUDENT' and requester_type = 'STUDENT'
        and requester_id = (select public.jwt_linked_student_id()))
    or ((select public.jwt_role()) = 'PARENT' and requester_type = 'STUDENT'
        and public.owns_student(requester_id))
  )
);

create policy "leave_requests_insert" on public.leave_requests for insert to authenticated with check (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('leave.view'))
  and (
    ((select public.jwt_role()) = 'TEACHER' and requester_type = 'TEACHER'
      and requester_id = (select public.jwt_linked_teacher_id()))
    or ((select public.jwt_role()) = 'STAFF' and requester_type = 'STAFF'
        and requester_id = (select auth.uid()))
    or ((select public.jwt_role()) = 'STUDENT' and requester_type = 'STUDENT'
        and requester_id = (select public.jwt_linked_student_id()))
    or ((select public.jwt_role()) = 'PARENT' and requester_type = 'STUDENT'
        and public.owns_student(requester_id))
    or ((select public.jwt_role()) = 'SCHOOL_ADMIN' and requester_type = 'STUDENT')
  )
);

-- Approve/reject: leave.manage, OR the caller is the Class Teacher (narrower than "teaches")
-- of the requesting student specifically.
create policy "leave_requests_approve" on public.leave_requests for update to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.jwt_role()) = 'SCHOOL_ADMIN'
    or (select public.has_permission('leave.manage'))
    or ((select public.jwt_role()) = 'TEACHER' and requester_type = 'STUDENT' and exists (
      select 1 from public.students s where s.id = leave_requests.requester_id
        and public.is_class_teacher_of(s.class_id)
    ))
  )
) with check (
  school_id = (select public.jwt_school_id())
);

-- ============================================================================
-- Certificates, holidays.
-- ============================================================================

alter table public.certificates enable row level security;
alter table public.holidays enable row level security;

create policy "certificates_select" on public.certificates for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('certificates.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and public.owns_student(student_id))
  )
);
create policy "certificates_write" on public.certificates for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('certificates.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('certificates.manage'))
);

create policy "holidays_select" on public.holidays for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('holidays.view'))
);
create policy "holidays_write" on public.holidays for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('holidays.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('holidays.manage'))
);

-- ============================================================================
-- school_role_permissions: readable by anyone who can manage users (to render the
-- Roles admin page); all writes go through set_role_permissions() (security definer
-- RPC, 27_rpc_functions.sql), which also hard-blocks editing SCHOOL_ADMIN.
-- ============================================================================

alter table public.school_role_permissions enable row level security;

create policy "school_role_permissions_select" on public.school_role_permissions for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('users.view'))
);
