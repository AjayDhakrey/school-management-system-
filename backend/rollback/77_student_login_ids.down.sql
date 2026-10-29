-- Remove Student-ID logins' database pieces. Logins already created stay in Supabase Auth
-- (delete them from User Management if needed); students keep their data.

drop function if exists public.complete_password_change();
drop function if exists public.class_student_logins(uuid);
drop trigger if exists trg_assign_student_code on public.students;
drop function if exists public.assign_student_code();
drop function if exists public.make_student_code(text, text, text);
drop function if exists public.school_login_prefix(text);
drop index if exists public.uq_students_student_code;
alter table public.students drop column if exists student_code;
alter table public.user_profiles drop column if exists must_change_password;
-- schools.code is left in place: School Settings uses it.
