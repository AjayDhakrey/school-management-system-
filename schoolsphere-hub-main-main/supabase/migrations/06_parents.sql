create table public.parents (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  email text,
  phone text
);
create index idx_parents_school on public.parents (school_id);
