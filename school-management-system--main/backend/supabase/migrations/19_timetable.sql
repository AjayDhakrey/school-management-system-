create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  class_id uuid references public.classes (id) on delete cascade,
  day text not null,
  period integer not null,
  subject text,
  teacher_id uuid references public.teachers (id) on delete set null,
  -- Free text, not FK'd to `rooms` — matches the original schema.
  room text
);
create index idx_timetable_slots_school on public.timetable_slots (school_id);
create index idx_timetable_slots_class on public.timetable_slots (class_id);
