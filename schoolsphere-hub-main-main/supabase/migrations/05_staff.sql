create table public.staff (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  department text check (department in ('ADMIN', 'ACCOUNTS', 'LIBRARY', 'TRANSPORT')),
  designation text,
  email text,
  phone text,
  employment_status text not null default 'ACTIVE'
    check (employment_status in ('ACTIVE', 'ON_LEAVE', 'INACTIVE'))
);
create index idx_staff_school on public.staff (school_id);
