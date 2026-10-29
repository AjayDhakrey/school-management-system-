-- Restore the built-in role permission defaults.
-- role_permission_defaults was found empty on the linked project, although migrations 22, 34,
-- 55, 56 and 57 seed it. has_permission() falls back to these defaults whenever a school has
-- no school_role_permissions override for a (role, department), so with the table empty every
-- TEACHER / STAFF / PARENT / STUDENT login in such a school resolved to no permissions at all
-- (e.g. parents could not see their own children). This re-runs those seeds verbatim; every
-- statement skips rows that already exist, so it is safe on a database that still has them.
-- Schools that saved overrides from Roles & Permissions are unaffected (overrides replace
-- defaults entirely).

-- from 22_permissions.sql
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
  ('STUDENT', null, 'parents.view')
on conflict do nothing;

-- from 34_events.sql
insert into public.role_permission_defaults (role, department, permission) values
  ('TEACHER', null, 'events.view'),
  ('TEACHER', null, 'events.manage'),
  ('PARENT',  null, 'events.view'),
  ('STUDENT', null, 'events.view'),
  ('STAFF', 'ADMIN',     'events.view'),
  ('STAFF', 'ADMIN',     'events.manage'),
  ('STAFF', 'ACCOUNTS',  'events.view'),
  ('STAFF', 'LIBRARY',   'events.view'),
  ('STAFF', 'TRANSPORT', 'events.view')
on conflict (role, department, permission) do nothing;

-- from 55_library_circulation.sql
insert into public.role_permission_defaults (role, department, permission)
select 'STAFF', d::public.staff_department, 'library.view'
  from unnest(array['ADMIN', 'ACCOUNTS', 'TRANSPORT']) d
 where not exists (
   select 1 from public.role_permission_defaults x
    where x.role = 'STAFF' and x.department = d::public.staff_department and x.permission = 'library.view'
 )
on conflict do nothing;

-- from 56_accountant_module.sql
insert into public.role_permission_defaults (role, department, permission) values
  -- Accountants could already view/create/update fees but had no way to
  -- actually record a payment against one — the real gap this migration fixes.
  ('STAFF', 'ACCOUNTS', 'fees.pay'),
  ('STAFF', 'ACCOUNTS', 'fee_payments.view'),
  ('STAFF', 'ACCOUNTS', 'fee_payments.create'),
  ('STAFF', 'ACCOUNTS', 'fee_refunds.view'),
  ('STAFF', 'ACCOUNTS', 'fee_refunds.create'),
  ('STAFF', 'ACCOUNTS', 'expenses.view'),
  ('STAFF', 'ACCOUNTS', 'expenses.manage'),
  ('STAFF', 'ACCOUNTS', 'vendors.view'),
  ('STAFF', 'ACCOUNTS', 'vendors.manage'),
  ('STAFF', 'ACCOUNTS', 'invoices.view'),
  ('STAFF', 'ACCOUNTS', 'invoices.manage'),
  ('STAFF', 'ACCOUNTS', 'reports.view'),
  ('STAFF', 'ACCOUNTS', 'audit_logs.view'),
  ('STAFF', 'ACCOUNTS', 'financial_settings.manage')
on conflict do nothing;

-- from 57_transport_manager_module.sql
insert into public.role_permission_defaults (role, department, permission) values
  ('STAFF', 'TRANSPORT', 'students.view'),
  ('STAFF', 'TRANSPORT', 'fees.view')
on conflict do nothing;
