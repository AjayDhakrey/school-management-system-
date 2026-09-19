create table public.teacher_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  date date not null,
  status text not null check (status in ('Present', 'Absent', 'Leave')),
  check_in text,
  check_out text,
  unique (teacher_id, date)
);
create index idx_teacher_attendance_school on public.teacher_attendance (school_id);

create table public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  date date not null,
  status text not null check (status in ('Present', 'Absent', 'Leave')),
  check_in text,
  check_out text,
  unique (staff_id, date)
);
create index idx_staff_attendance_school on public.staff_attendance (school_id);
