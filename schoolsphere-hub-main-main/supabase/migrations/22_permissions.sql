-- Canonical list of every permission string in the system. role_permission_defaults only
-- lists what's actually granted (a subset), so this table is what get_effective_permissions()
-- uses to compute the SCHOOL_ADMIN wildcard ("everything except schools.*").
create table public.permissions (
  key text primary key
);

-- SCHOOL_ADMIN/SUPER_ADMIN are wildcards resolved directly in has_permission() (23_rls_helpers.sql)
-- and never stored here — matches today's "not editable, no safe way to edit without lockout risk".
create table public.role_permission_defaults (
  id bigint generated always as identity primary key,
  role text not null check (role in ('TEACHER', 'STAFF', 'PARENT', 'STUDENT')),
  department text check (department in ('ADMIN', 'ACCOUNTS', 'LIBRARY', 'TRANSPORT')),
  permission text not null references public.permissions (key),
  unique nulls not distinct (role, department, permission)
);

-- Per-school override: presence of ANY row for a (school, role, department) combo means
-- "this is the complete effective permission set, replacing the default entirely" — the
-- enabled=1 rows are used as-is, not merged with the default. Absence of rows means
-- "use role_permission_defaults". See has_permission() in 23_rls_helpers.sql.
create table public.school_role_permissions (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  role text not null,
  department text,
  permission text not null references public.permissions (key),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (school_id, role, department, permission)
);
create index idx_school_role_permissions_lookup
  on public.school_role_permissions (school_id, role, department);

insert into public.permissions (key) values
  ('schools.view'), ('schools.manage'),
  ('students.view'), ('students.create'), ('students.update'), ('students.delete'),
  ('teachers.view'), ('teachers.create'), ('teachers.update'), ('teachers.delete'),
  ('staff.view'), ('staff.create'), ('staff.update'), ('staff.delete'),
  ('parents.view'), ('parents.create'), ('parents.update'),
  ('classes.view'), ('classes.manage'),
  ('subjects.view'), ('subjects.manage'),
  ('attendance.view'), ('attendance.create'), ('attendance.update'),
  ('fees.view'), ('fees.create'), ('fees.update'), ('fees.pay'),
  ('admissions.view'), ('admissions.manage'),
  ('exams.view'), ('exams.manage'),
  ('results.view'), ('results.manage'),
  ('homework.view'), ('homework.create'), ('homework.update'), ('homework.delete'), ('homework.submit'),
  ('notices.view'), ('notices.manage'),
  ('library.view'), ('library.manage'),
  ('transport.view'), ('transport.manage'),
  ('timetable.view'), ('timetable.manage'),
  ('rooms.view'), ('rooms.manage'),
  ('leave.view'), ('leave.manage'),
  ('settings.manage'),
  ('certificates.view'), ('certificates.manage'),
  ('fee_structures.view'), ('fee_structures.manage'),
  ('teacher_attendance.view'), ('teacher_attendance.manage'), ('teacher_attendance.self'),
  ('staff_attendance.view'), ('staff_attendance.manage'), ('staff_attendance.self'),
  ('holidays.view'), ('holidays.manage'),
  ('notifications.view'),
  ('users.view'), ('users.manage');

insert into public.role_permission_defaults (role, department, permission) values
  ('TEACHER', null, 'students.view'),
  ('TEACHER', null, 'classes.view'),
  ('TEACHER', null, 'subjects.view'),
  ('TEACHER', null, 'attendance.view'),
  ('TEACHER', null, 'attendance.create'),
  ('TEACHER', null, 'attendance.update'),
  ('TEACHER', null, 'homework.view'),
  ('TEACHER', null, 'homework.create'),
  ('TEACHER', null, 'homework.update'),
  ('TEACHER', null, 'homework.delete'),
  ('TEACHER', null, 'exams.view'),
  ('TEACHER', null, 'results.view'),
  ('TEACHER', null, 'results.manage'),
  ('TEACHER', null, 'notices.view'),
  ('TEACHER', null, 'timetable.view'),
  ('TEACHER', null, 'library.view'),
  ('TEACHER', null, 'leave.view'),
  ('TEACHER', null, 'teacher_attendance.view'),
  ('TEACHER', null, 'teacher_attendance.self'),
  ('TEACHER', null, 'holidays.view'),
  ('TEACHER', null, 'notifications.view'),

  ('STAFF', 'ADMIN', 'students.view'),
  ('STAFF', 'ADMIN', 'students.create'),
  ('STAFF', 'ADMIN', 'students.update'),
  ('STAFF', 'ADMIN', 'admissions.view'),
  ('STAFF', 'ADMIN', 'admissions.manage'),
  ('STAFF', 'ADMIN', 'leave.view'),
  ('STAFF', 'ADMIN', 'staff_attendance.view'),
  ('STAFF', 'ADMIN', 'staff_attendance.self'),
  ('STAFF', 'ADMIN', 'holidays.view'),
  ('STAFF', 'ADMIN', 'notifications.view'),

  ('STAFF', 'ACCOUNTS', 'fees.view'),
  ('STAFF', 'ACCOUNTS', 'fees.create'),
  ('STAFF', 'ACCOUNTS', 'fees.update'),
  ('STAFF', 'ACCOUNTS', 'fee_structures.view'),
  ('STAFF', 'ACCOUNTS', 'fee_structures.manage'),
  ('STAFF', 'ACCOUNTS', 'leave.view'),
  ('STAFF', 'ACCOUNTS', 'staff_attendance.view'),
  ('STAFF', 'ACCOUNTS', 'staff_attendance.self'),
  ('STAFF', 'ACCOUNTS', 'holidays.view'),
  ('STAFF', 'ACCOUNTS', 'notifications.view'),

  ('STAFF', 'LIBRARY', 'library.view'),
  ('STAFF', 'LIBRARY', 'library.manage'),
  ('STAFF', 'LIBRARY', 'leave.view'),
  ('STAFF', 'LIBRARY', 'staff_attendance.view'),
  ('STAFF', 'LIBRARY', 'staff_attendance.self'),
  ('STAFF', 'LIBRARY', 'holidays.view'),
  ('STAFF', 'LIBRARY', 'notifications.view'),

  ('STAFF', 'TRANSPORT', 'transport.view'),
  ('STAFF', 'TRANSPORT', 'transport.manage'),
  ('STAFF', 'TRANSPORT', 'leave.view'),
  ('STAFF', 'TRANSPORT', 'staff_attendance.view'),
  ('STAFF', 'TRANSPORT', 'staff_attendance.self'),
  ('STAFF', 'TRANSPORT', 'holidays.view'),
  ('STAFF', 'TRANSPORT', 'notifications.view'),

  ('PARENT', null, 'students.view'),
  ('PARENT', null, 'attendance.view'),
  ('PARENT', null, 'results.view'),
  ('PARENT', null, 'exams.view'),
  ('PARENT', null, 'homework.view'),
  ('PARENT', null, 'timetable.view'),
  ('PARENT', null, 'notices.view'),
  ('PARENT', null, 'library.view'),
  ('PARENT', null, 'transport.view'),
  ('PARENT', null, 'certificates.view'),
  ('PARENT', null, 'holidays.view'),
  ('PARENT', null, 'notifications.view'),
  ('PARENT', null, 'leave.view'),
  ('PARENT', null, 'fees.view'),
  ('PARENT', null, 'fees.pay'),

  ('STUDENT', null, 'students.view'),
  ('STUDENT', null, 'attendance.view'),
  ('STUDENT', null, 'results.view'),
  ('STUDENT', null, 'exams.view'),
  ('STUDENT', null, 'homework.view'),
  ('STUDENT', null, 'homework.submit'),
  ('STUDENT', null, 'timetable.view'),
  ('STUDENT', null, 'notices.view'),
  ('STUDENT', null, 'library.view'),
  ('STUDENT', null, 'transport.view'),
  ('STUDENT', null, 'certificates.view'),
  ('STUDENT', null, 'holidays.view'),
  ('STUDENT', null, 'notifications.view'),
  ('STUDENT', null, 'leave.view'),
  ('STUDENT', null, 'fees.view'),
  ('STUDENT', null, 'fees.pay'),
  ('STUDENT', null, 'teachers.view'),
  ('STUDENT', null, 'subjects.view'),
  ('STUDENT', null, 'parents.view');
