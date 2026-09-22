create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  type text not null check (type in ('BONAFIDE', 'TRANSFER', 'CHARACTER')),
  issued_on date not null default current_date,
  issued_by text
);
create index idx_certificates_school on public.certificates (school_id);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  date date not null,
  day text,
  type text not null default 'Holiday',
  session text
);
create index idx_holidays_school on public.holidays (school_id);
