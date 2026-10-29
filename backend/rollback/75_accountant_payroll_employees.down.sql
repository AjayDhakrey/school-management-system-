-- Remove the accountant's default access to the teacher and staff lists.
-- Per-school override rows are left alone: they can't be told apart from grants an
-- admin made in the role matrix, which can switch them off there.

delete from public.role_permission_defaults
where role = 'STAFF' and department = 'ACCOUNTS'
  and permission in ('teachers.view', 'staff.view');
