create table public.notices (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  title text not null,
  description text,
  category text,
  priority text,
  audience text check (audience in ('All', 'Teachers', 'Parents', 'Students')),
  date date not null default current_date,
  author text
);
create index idx_notices_school on public.notices (school_id);

-- The school-scoped "Announcements" feature in the frontend piggybacks on this table with
-- category = 'Announcement' — it is not the same as the platform-wide `announcements` table.
create table public.notice_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  notice_id uuid not null references public.notices (id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (user_id, notice_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  category text not null,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_school on public.notifications (school_id);
create index idx_notifications_user on public.notifications (user_id, read);
