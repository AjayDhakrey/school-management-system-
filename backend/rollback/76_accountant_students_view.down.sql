-- Remove the accountant's default access to the student list.
-- Per-school override rows are left alone; switch them off from Roles & Permissions.

delete from public.role_permission_defaults
where role = 'STAFF' and department = 'ACCOUNTS' and permission = 'students.view';
