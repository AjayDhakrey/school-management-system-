create table public.homework (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  class_id uuid references public.classes (id) on delete cascade,
  subject text,
  title text not null,
  due_date date,
  teacher_id uuid references public.teachers (id) on delete set null,
  description text
);
create index idx_homework_school on public.homework (school_id);

create table public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  homework_id uuid not null references public.homework (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  file_name text,
  note text,
  status text not null default 'Submitted' check (status in ('Submitted', 'Late', 'Reviewed')),
  submitted_at timestamptz not null default now(),
  feedback text,
  grade text,
  unique (homework_id, student_id)
);
create index idx_homework_submissions_school on public.homework_submissions (school_id);
