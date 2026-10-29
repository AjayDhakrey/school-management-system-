create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric(12, 2) not null default 0,
  billing_cycle text not null default 'MONTHLY' check (billing_cycle in ('MONTHLY', 'YEARLY')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now()
);

-- id stays a human-readable business key ("SCH-0001"), not a uuid.
create table public.schools (
  id text primary key,
  name text not null,
  short_name text not null,
  tagline text,
  address text,
  phone text,
  email text,
  principal text,
  session text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRIAL', 'EXPIRED')),
  plan text not null default 'TRIAL',
  billing_cycle text default 'MONTHLY' check (billing_cycle in ('MONTHLY', 'YEARLY')),
  payment_status text default 'PENDING' check (payment_status in ('PAID', 'PENDING', 'OVERDUE')),
  subscription_started_at timestamptz,
  subscription_expires_at timestamptz,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.plan_features (
  plan_id uuid not null references public.plans (id) on delete cascade,
  feature_key text not null check (
    feature_key in (
      'Attendance', 'Fees', 'Exams', 'Homework', 'Library', 'Transport', 'Timetable', 'Admissions'
    )
  ),
  enabled boolean not null default true,
  primary key (plan_id, feature_key)
);
