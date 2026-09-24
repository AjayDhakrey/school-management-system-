create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  class_id uuid references public.classes (id) on delete set null,
  date date not null,
  status text not null check (status in ('Present', 'Absent', 'Leave')),
  unique (student_id, date)
);
create index idx_attendance_school on public.attendance (school_id);
create index idx_attendance_student on public.attendance (student_id);
