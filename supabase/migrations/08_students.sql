-- Note: the legacy `attendance` percentage column is dropped — it was never recomputed
-- by any route in the original app (dead/stale data). Compute attendance % on read instead.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  admission_no text,
  class_id uuid references public.classes (id) on delete set null,
  class_name text,
  section text,
  roll integer,
  -- "primary guardian" convenience pointer, kept in sync by the trigger in
  -- 09_student_guardians.sql. student_guardians is the real source of truth.
  parent_id uuid references public.parents (id) on delete set null,
  status text not null default 'Active',
  fee_status text not null default 'Pending',
  email text,
  phone text,
  dob date,
  address text,
  photo_url text,
  blood_group text,
  admitted_on date,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  pickup_point text,
  drop_point text
);
create index idx_students_school on public.students (school_id);
create index idx_students_class on public.students (class_id);
