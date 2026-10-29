create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  number text,
  route text,
  driver text,
  driver_phone text,
  pickup_time text,
  drop_time text,
  capacity integer not null default 40,
  status text not null default 'Idle',
  stops jsonb not null default '[]'
);
create index idx_vehicles_school on public.vehicles (school_id);
