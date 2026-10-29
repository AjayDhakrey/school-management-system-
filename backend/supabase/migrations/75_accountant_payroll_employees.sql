-- Accountants prepare payroll for every teacher and non-teaching staff member
-- (52_payroll.sql already lets them read/write payroll_items and salary_structures),
-- but they had no teachers.view / staff.view, so RLS hid every teacher and every
-- staff row except their own and the payroll page listed only the accountant.

insert into public.role_permission_defaults (role, department, permission) values
  ('STAFF', 'ACCOUNTS', 'teachers.view'),
  ('STAFF', 'ACCOUNTS', 'staff.view')
on conflict do nothing;

-- A school that has customised its role matrix ignores the defaults above. Saving that
-- matrix stores every permission, unticked ones as enabled = false, so these two were
-- saved as "off" for accountants without anyone choosing that; switch them on.
-- Admins can still turn them off again from Roles & Permissions.
insert into public.school_role_permissions (school_id, role, department, permission, enabled)
select distinct srp.school_id, srp.role, srp.department, p.permission, true
from public.school_role_permissions srp
cross join (values ('teachers.view'), ('staff.view')) as p (permission)
where srp.role = 'STAFF' and srp.department = 'ACCOUNTS'
on conflict (school_id, role, department, permission)
  do update set enabled = true, updated_at = now();
