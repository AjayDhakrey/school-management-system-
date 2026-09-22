create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  section text not null,
  -- FK to teachers added in 04_teachers.sql once that table exists.
  class_teacher_id uuid
);
create index idx_classes_school on public.classes (school_id);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  code text,
  type text not null default 'Core',
  credits numeric(4, 1) not null default 3,
  description text
);
create index idx_subjects_school on public.subjects (school_id);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null
);
create index idx_rooms_school on public.rooms (school_id);
