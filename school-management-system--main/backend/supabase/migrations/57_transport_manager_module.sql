-- ============================================================================
-- Transport Manager module: extends the existing `vehicles` table (additive
-- columns only — nothing dropped/renamed, so the existing Fleet/Route pages
-- and the parent/student "my transport" views keep working unmodified) and
-- adds new, transport-scoped tables for drivers, attendants, attendance,
-- maintenance and complaints. Everything is gated by the transport.view /
-- transport.manage permissions that already exist (22_permissions.sql) —
-- no new permission keys are introduced, only two new default grants for the
-- TRANSPORT department (students.view, fees.view — see below).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Vehicle Management: registration/document/insurance/fitness/pollution
-- tracking, plus integration-ready (unused-until-wired) GPS columns for Live
-- Tracking. All nullable — existing rows and existing code paths are
-- unaffected.
-- ----------------------------------------------------------------------------
alter table public.vehicles
  add column if not exists registration_no text,
  add column if not exists vehicle_type text,
  add column if not exists rc_expiry date,
  add column if not exists insurance_no text,
  add column if not exists insurance_expiry date,
  add column if not exists fitness_expiry date,
  add column if not exists pollution_expiry date,
  add column if not exists purchase_date date,
  add column if not exists last_lat numeric,
  add column if not exists last_lng numeric,
  add column if not exists last_location_at timestamptz;

-- ----------------------------------------------------------------------------
-- Driver & Attendant Management. Real entities (independent of a vehicle
-- assignment) so a driver/attendant can exist before being assigned, be
-- reassigned, or go on leave without losing their record. `assigned_vehicle_id`
-- is the one link back to a vehicle; the partial unique index keeps that link
-- single-valued (matches the existing single driver/driver_phone text fields
-- on `vehicles`, which the API layer keeps in sync on assignment — see
-- src/lib/api.ts — purely for backward compatibility with the pre-existing
-- Fleet view and parent/student transport pages).
-- ----------------------------------------------------------------------------
create table public.transport_drivers (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  phone text,
  license_no text,
  license_expiry date,
  id_proof_no text,
  address text,
  photo_url text,
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'On Leave')),
  assigned_vehicle_id uuid references public.vehicles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_transport_drivers_school on public.transport_drivers (school_id);
create unique index idx_transport_drivers_one_per_vehicle
  on public.transport_drivers (assigned_vehicle_id) where assigned_vehicle_id is not null;

create table public.transport_attendants (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  name text not null,
  phone text,
  id_proof_no text,
  address text,
  photo_url text,
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'On Leave')),
  assigned_vehicle_id uuid references public.vehicles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_transport_attendants_school on public.transport_attendants (school_id);
create unique index idx_transport_attendants_one_per_vehicle
  on public.transport_attendants (assigned_vehicle_id) where assigned_vehicle_id is not null;

alter table public.transport_drivers enable row level security;
alter table public.transport_attendants enable row level security;

create policy "transport_drivers_select" on public.transport_drivers for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.view'))
);
create policy "transport_drivers_write" on public.transport_drivers for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('transport.manage'))
);

create policy "transport_attendants_select" on public.transport_attendants for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.view'))
);
create policy "transport_attendants_write" on public.transport_attendants for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('transport.manage'))
);

-- ----------------------------------------------------------------------------
-- Transport Attendance: boarding/drop status per student per day. Deliberately
-- its own table (not the academic `attendance` table) — a different domain
-- with a different shape, so it can't collide with class attendance.
-- ----------------------------------------------------------------------------
create table public.transport_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  date date not null default current_date,
  boarding_status text not null default 'Not Marked'
    check (boarding_status in ('Boarded', 'Absent', 'Not Marked')),
  drop_status text not null default 'Not Marked'
    check (drop_status in ('Dropped', 'Absent', 'Not Marked')),
  marked_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, date)
);
create index idx_transport_attendance_school on public.transport_attendance (school_id, date desc);
create index idx_transport_attendance_vehicle on public.transport_attendance (vehicle_id, date desc);

alter table public.transport_attendance enable row level security;

create policy "transport_attendance_select" on public.transport_attendance for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('transport.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and public.owns_student(student_id))
  )
);
create policy "transport_attendance_write" on public.transport_attendance for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('transport.manage'))
);

-- ----------------------------------------------------------------------------
-- Maintenance: service history + upcoming service dates + cost, per vehicle.
-- ----------------------------------------------------------------------------
create table public.transport_maintenance (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  service_date date not null default current_date,
  service_type text,
  description text,
  cost numeric(12, 2) not null default 0,
  vendor text,
  odometer_reading integer,
  next_service_date date,
  created_at timestamptz not null default now()
);
create index idx_transport_maintenance_school on public.transport_maintenance (school_id, service_date desc);
create index idx_transport_maintenance_vehicle on public.transport_maintenance (vehicle_id);

alter table public.transport_maintenance enable row level security;

create policy "transport_maintenance_select" on public.transport_maintenance for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.view'))
);
create policy "transport_maintenance_write" on public.transport_maintenance for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('transport.manage'))
);

-- ----------------------------------------------------------------------------
-- Safety & Complaints: incidents/complaints/emergency records. Raised by
-- transport staff, or self-raised by a parent/student about their own child's
-- vehicle — mirrors the requester-self-service shape already established by
-- `leave_requests` (26_rls_policies_operations.sql), simplified to a single
-- `raised_by_id = auth.uid()` check since there's no teacher/staff-profile-id
-- indirection to resolve here.
-- ----------------------------------------------------------------------------
create table public.transport_complaints (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  raised_by_role text not null check (raised_by_role in ('PARENT', 'STUDENT', 'STAFF', 'SCHOOL_ADMIN')),
  raised_by_id uuid not null,
  student_id uuid references public.students (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  category text not null default 'Other'
    check (category in ('Safety', 'Delay', 'Behavior', 'Cleanliness', 'Emergency', 'Other')),
  description text not null,
  status text not null default 'Open' check (status in ('Open', 'In Progress', 'Resolved', 'Closed')),
  resolution_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_transport_complaints_school on public.transport_complaints (school_id, created_at desc);

alter table public.transport_complaints enable row level security;

create policy "transport_complaints_select" on public.transport_complaints for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.has_permission('transport.manage'))
    or raised_by_id = (select auth.uid())
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT')
        and student_id is not null and public.owns_student(student_id))
  )
);
create policy "transport_complaints_insert" on public.transport_complaints for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('transport.view'))
  and raised_by_id = (select auth.uid())
  and (
    (select public.jwt_role()) in ('STAFF', 'SCHOOL_ADMIN')
    or ((select public.jwt_role()) = 'STUDENT' and student_id = (select public.jwt_linked_student_id()))
    or ((select public.jwt_role()) = 'PARENT' and student_id is not null and public.owns_student(student_id))
  )
);
create policy "transport_complaints_update" on public.transport_complaints for update to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('transport.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('transport.manage'))
);

-- ----------------------------------------------------------------------------
-- Student Transport: assigning a student to a vehicle/pickup/drop point is a
-- narrow, field-level write. Rather than granting the TRANSPORT department
-- broad students.update (which would also let it edit name/roll/class/etc.),
-- this scoped RPC only ever touches vehicle_id/pickup_point/drop_point —
-- same "self-validating RPC" shape as collect_fee_payment() in
-- 56_accountant_module.sql.
-- ----------------------------------------------------------------------------
create or replace function public.assign_student_transport(
  p_student_id uuid, p_vehicle_id uuid, p_pickup_point text, p_drop_point text
) returns public.students
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.jwt_school_id();
  v_student public.students;
begin
  if not (select public.has_permission('transport.manage')) then
    raise exception 'Not permitted to manage transport';
  end if;
  if not (select public.school_is_active()) then
    raise exception 'School is not active';
  end if;

  select * into v_student from public.students where id = p_student_id and school_id = v_school;
  if not found then
    raise exception 'Student not found';
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles where id = p_vehicle_id and school_id = v_school
  ) then
    raise exception 'Vehicle not found';
  end if;

  update public.students
  set vehicle_id = p_vehicle_id, pickup_point = p_pickup_point, drop_point = p_drop_point
  where id = p_student_id
  returning * into v_student;

  return v_student;
end;
$$;
grant execute on function public.assign_student_transport(uuid, uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Permission grants: the TRANSPORT department already has transport.view /
-- transport.manage (22_permissions.sql) and every new table above reuses
-- those two — no new permission keys. It was however missing students.view
-- entirely, so a real Transport Manager could not actually see the student
-- list to assign transport (the existing Fleet page's "Assigned Students"
-- list would have silently rendered empty for that role); and fees.view, to
-- support the read-only Transport Fees screen.
-- ----------------------------------------------------------------------------
insert into public.role_permission_defaults (role, department, permission) values
  ('STAFF', 'TRANSPORT', 'students.view'),
  ('STAFF', 'TRANSPORT', 'fees.view')
on conflict do nothing;
