-- ============================================================================
-- School events / calendar. Express never had this table — the frontend
-- src/app/events.tsx ran entirely on src/data/mock.ts.
-- ============================================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  title text not null,
  description text,
  event_date date not null,
  event_time text,
  location text,
  category text not null default 'Academic'
    check (category in ('Sports','Academic','Meeting','Holiday','Cultural')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index idx_events_school on public.events (school_id, event_date);

alter table public.events enable row level security;

create policy "events_select" on public.events for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('events.view'))
);
create policy "events_write" on public.events for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('events.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('events.manage'))
);

-- New permission keys + defaults. view: every school role; manage: teachers and
-- the ADMIN staff department (SCHOOL_ADMIN gets it via the has_permission wildcard).
insert into public.permissions (key) values ('events.view'), ('events.manage')
on conflict (key) do nothing;

insert into public.role_permission_defaults (role, department, permission) values
  ('TEACHER', null, 'events.view'),
  ('TEACHER', null, 'events.manage'),
  ('PARENT',  null, 'events.view'),
  ('STUDENT', null, 'events.view'),
  ('STAFF', 'ADMIN',     'events.view'),
  ('STAFF', 'ADMIN',     'events.manage'),
  ('STAFF', 'ACCOUNTS',  'events.view'),
  ('STAFF', 'LIBRARY',   'events.view'),
  ('STAFF', 'TRANSPORT', 'events.view')
on conflict (role, department, permission) do nothing;
