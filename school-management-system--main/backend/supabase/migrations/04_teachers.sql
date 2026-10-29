create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  department text,
  email text,
  phone text,
  employment_status text not null default 'ACTIVE'
    check (employment_status in ('ACTIVE', 'ON_LEAVE', 'INACTIVE')),
  photo_url text,
  designation text,
  joining_date date
);
create index idx_teachers_school on public.teachers (school_id);

alter table public.classes
  add constraint classes_class_teacher_id_fkey
  foreign key (class_teacher_id) references public.teachers (id) on delete set null;

-- Replaces the legacy teachers.assigned_classes/assigned_subjects JSON columns —
-- this join table is the only source of truth for teaching assignments.
create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  teacher_id uuid references public.teachers (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, subject_id)
);
create index idx_class_subjects_school on public.class_subjects (school_id);
create index idx_class_subjects_teacher on public.class_subjects (teacher_id, class_id);
