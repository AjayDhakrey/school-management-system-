-- Accountants collect fees per student: the fee records, collection and transactions
-- screens all join fees to the student list, and the header search looks students up.
-- Without students.view, RLS hid every student from them.

insert into public.role_permission_defaults (role, department, permission) values
  ('STAFF', 'ACCOUNTS', 'students.view')
on conflict do nothing;

-- Schools with a saved role matrix ignore the defaults; saving that matrix stores
-- unticked permissions as enabled = false, so switch this one on there too.
-- Admins can still turn it off again from Roles & Permissions.
insert into public.school_role_permissions (school_id, role, department, permission, enabled)
select distinct srp.school_id, srp.role, srp.department, 'students.view', true
from public.school_role_permissions srp
where srp.role = 'STAFF' and srp.department = 'ACCOUNTS'
on conflict (school_id, role, department, permission)
  do update set enabled = true, updated_at = now();
