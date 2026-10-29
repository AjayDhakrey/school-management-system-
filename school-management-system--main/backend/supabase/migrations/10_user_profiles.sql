-- The login/auth side of the system (mirrors today's `users` table), kept distinct from
-- the roster/entity tables (teachers/staff/parents/students) — a teacher can exist without
-- a portal login yet, exactly like today.
create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id text references public.schools (id) on delete cascade,
  role text not null
    check (role in ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'PARENT', 'STUDENT')),
  department text check (department in ('ADMIN', 'ACCOUNTS', 'LIBRARY', 'TRANSPORT')),
  name text not null,
  email text not null unique,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  linked_teacher_id uuid references public.teachers (id) on delete set null,
  linked_parent_id uuid references public.parents (id) on delete set null,
  linked_student_id uuid references public.students (id) on delete set null,
  linked_staff_id uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_user_profiles_school on public.user_profiles (school_id);

alter table public.user_profiles enable row level security;
