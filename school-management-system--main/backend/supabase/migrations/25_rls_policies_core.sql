-- ============================================================================
-- Platform tables: schools, plans, plan_features, leads, support_tickets,
-- announcements (platform-wide), payments, audit_log.
-- SUPER_ADMIN only, except `schools` which also allows a school's own members
-- to read/update their own row (needed for the school-profile page).
-- ============================================================================

alter table public.schools enable row level security;

create policy "schools_select" on public.schools for select to authenticated using (
  (select public.jwt_role()) = 'SUPER_ADMIN' or id = (select public.jwt_school_id())
);

create policy "schools_insert" on public.schools for insert to authenticated with check (
  (select public.jwt_role()) = 'SUPER_ADMIN'
);

-- SUPER_ADMIN can update any school; a SCHOOL_ADMIN with settings.manage can update only
-- their own school's row (mirrors school-profile.ts's whitelisted-field PATCH — the frontend
-- is expected to send only the whitelisted fields, RLS gates the row not individual columns).
create policy "schools_update" on public.schools for update to authenticated using (
  (select public.jwt_role()) = 'SUPER_ADMIN'
  or (id = (select public.jwt_school_id()) and (select public.has_permission('settings.manage')))
);

create policy "schools_delete" on public.schools for delete to authenticated using (
  (select public.jwt_role()) = 'SUPER_ADMIN'
);

alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.leads enable row level security;
alter table public.support_tickets enable row level security;
alter table public.announcements enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;

create policy "plans_all" on public.plans for all to authenticated
  using ((select public.jwt_role()) = 'SUPER_ADMIN')
  with check ((select public.jwt_role()) = 'SUPER_ADMIN');

create policy "plan_features_all" on public.plan_features for all to authenticated
  using ((select public.jwt_role()) = 'SUPER_ADMIN')
  with check ((select public.jwt_role()) = 'SUPER_ADMIN');

create policy "leads_all" on public.leads for all to authenticated
  using ((select public.jwt_role()) = 'SUPER_ADMIN')
  with check ((select public.jwt_role()) = 'SUPER_ADMIN');

create policy "support_tickets_all" on public.support_tickets for all to authenticated
  using ((select public.jwt_role()) = 'SUPER_ADMIN')
  with check ((select public.jwt_role()) = 'SUPER_ADMIN');

create policy "announcements_all" on public.announcements for all to authenticated
  using ((select public.jwt_role()) = 'SUPER_ADMIN')
  with check ((select public.jwt_role()) = 'SUPER_ADMIN');

create policy "payments_all" on public.payments for all to authenticated
  using ((select public.jwt_role()) = 'SUPER_ADMIN')
  with check ((select public.jwt_role()) = 'SUPER_ADMIN');

create policy "audit_log_select" on public.audit_log for select to authenticated using (
  (select public.jwt_role()) = 'SUPER_ADMIN'
);
-- No insert/update/delete policy for `authenticated` — written only via log_audit()
-- (security definer, 27_rpc_functions.sql).

-- ============================================================================
-- user_profiles: self, or SCHOOL_ADMIN/SUPER_ADMIN reading their school's roster.
-- No general write policy — creation goes through the manage-user-login Edge Function
-- (service role), status changes through set_user_status() (security definer RPC).
-- ============================================================================

create policy "user_profiles_select" on public.user_profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.jwt_role()) = 'SUPER_ADMIN'
  or ((select public.jwt_role()) = 'SCHOOL_ADMIN' and school_id = (select public.jwt_school_id()))
);

-- ============================================================================
-- Academic structure: classes, subjects, rooms, class_subjects.
-- ============================================================================

alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.rooms enable row level security;
alter table public.class_subjects enable row level security;

create policy "classes_select" on public.classes for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('classes.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and public.teaches_class(id))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and exists (
      select 1 from public.students s where s.class_id = classes.id and public.owns_student(s.id)
    ))
  )
);

create policy "classes_insert" on public.classes for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('classes.manage'))
);

create policy "classes_update" on public.classes for update to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('classes.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

create policy "classes_delete" on public.classes for delete to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('classes.manage'))
);

create policy "subjects_select" on public.subjects for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('subjects.view'))
);
create policy "subjects_write" on public.subjects for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('subjects.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('subjects.manage'))
);

create policy "rooms_select" on public.rooms for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('rooms.view'))
);
create policy "rooms_write" on public.rooms for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('rooms.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('rooms.manage'))
);

create policy "class_subjects_select" on public.class_subjects for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('subjects.view'))
);
create policy "class_subjects_write" on public.class_subjects for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('subjects.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('subjects.manage'))
);

-- ============================================================================
-- People: teachers, staff, parents, students, student_guardians.
-- ============================================================================

alter table public.teachers enable row level security;
alter table public.staff enable row level security;
alter table public.parents enable row level security;
alter table public.students enable row level security;
alter table public.student_guardians enable row level security;

create policy "teachers_select" on public.teachers for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and ((select public.has_permission('teachers.view')) or id = (select public.jwt_linked_teacher_id()))
);
create policy "teachers_insert" on public.teachers for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('teachers.create'))
);
-- Admin update (any field) OR self-service update of one's own row (frontend restricts to
-- phone/photo_url, matching PATCH /teachers/me today).
create policy "teachers_update" on public.teachers for update to authenticated using (
  school_id = (select public.jwt_school_id())
  and ((select public.has_permission('teachers.update')) or id = (select public.jwt_linked_teacher_id()))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);
create policy "teachers_delete" on public.teachers for delete to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('teachers.delete'))
);

create policy "staff_select" on public.staff for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and ((select public.has_permission('staff.view')) or id = (select public.jwt_linked_staff_id()))
);
create policy "staff_insert" on public.staff for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('staff.create'))
);
create policy "staff_update" on public.staff for update to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('staff.update'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);
create policy "staff_delete" on public.staff for delete to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('staff.delete'))
);

create policy "parents_select" on public.parents for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('parents.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or ((select public.jwt_role()) = 'PARENT' and id = (select public.jwt_linked_parent_id()))
    or ((select public.jwt_role()) = 'STUDENT' and exists (
      select 1 from public.student_guardians sg
      where sg.parent_id = parents.id and sg.student_id = (select public.jwt_linked_student_id())
    ))
  )
);
create policy "parents_insert" on public.parents for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('parents.create'))
);
create policy "parents_update" on public.parents for update to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('parents.update'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

create policy "students_select" on public.students for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('students.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and public.teaches_class(class_id))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and public.owns_student(id))
  )
);
create policy "students_insert" on public.students for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('students.create'))
);
-- Admin update (any field) OR self-service update of one's own row (frontend restricts to
-- email/phone/dob/address/photo_url/blood_group, matching PATCH /students/me today).
create policy "students_update" on public.students for update to authenticated using (
  school_id = (select public.jwt_school_id())
  and ((select public.has_permission('students.update')) or id = (select public.jwt_linked_student_id()))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);
create policy "students_delete" on public.students for delete to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('students.delete'))
);

create policy "student_guardians_select" on public.student_guardians for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or ((select public.jwt_role()) = 'PARENT' and parent_id = (select public.jwt_linked_parent_id()))
    or ((select public.jwt_role()) = 'STUDENT' and student_id = (select public.jwt_linked_student_id()))
  )
);
create policy "student_guardians_write" on public.student_guardians for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('parents.update'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('parents.update'))
);
