create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  requester_type text not null check (requester_type in ('TEACHER', 'STAFF', 'STUDENT')),
  -- Polymorphic (teacher.id / user_profiles.id-for-staff / student.id depending on
  -- requester_type) — no FK, matches the original schema exactly.
  requester_id uuid not null,
  from_date date not null,
  to_date date not null,
  reason text,
  status text not null default 'Pending'
);
create index idx_leave_requests_school on public.leave_requests (school_id);
create index idx_leave_requests_requester on public.leave_requests (requester_type, requester_id);
