create table public.leads (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  contact_name text,
  email text,
  phone text,
  source text,
  status text not null default 'NEW'
    check (status in ('NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'CONVERTED', 'LOST')),
  notes text,
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  school_id text references public.schools (id) on delete set null,
  subject text not null,
  message text,
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  created_at timestamptz not null default now()
);
create index idx_support_tickets_school on public.support_tickets (school_id);

-- Platform-wide broadcast, not tied to a school.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  audience text not null default 'ALL' check (audience in ('ALL', 'TRIAL', 'ACTIVE')),
  created_at timestamptz not null default now()
);

-- The only place schools.subscription_expires_at / payment_status / status get written
-- (via the pay-and-extend logic in the RPC layer, mirroring today's payments.ts).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  amount numeric(12, 2) not null,
  method text,
  plan text,
  paid_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index idx_payments_school on public.payments (school_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  action text not null,
  target text,
  details text,
  created_at timestamptz not null default now()
);
