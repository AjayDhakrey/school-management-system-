create table public.exams (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  subject text,
  class_id uuid references public.classes (id) on delete cascade,
  date date,
  status text not null default 'Scheduled',
  term text not null default 'Term 1'
);
create index idx_exams_school on public.exams (school_id);

-- published_at drives a 48h rolling visibility window for STUDENT/PARENT roles,
-- enforced in the RLS policy (26_rls_policies_operations.sql), not here.
create table public.results (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  exam_id uuid references public.exams (id) on delete cascade,
  marks numeric(6, 2),
  grade text,
  max_marks numeric(6, 2) not null default 100,
  published_at timestamptz not null default now()
);
create index idx_results_school on public.results (school_id);
create index idx_results_student on public.results (student_id);
