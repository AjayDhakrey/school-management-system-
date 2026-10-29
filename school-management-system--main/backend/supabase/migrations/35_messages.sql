-- ============================================================================
-- Internal messaging. New feature — no Express equivalent. One flat message
-- table; a "reply" is just a new row with subject "Re: ...". Threading can be
-- layered on later with a nullable parent_id.
-- ============================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  sender_id uuid not null references public.user_profiles (id) on delete cascade,
  recipient_id uuid not null references public.user_profiles (id) on delete cascade,
  subject text not null default '(no subject)',
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_messages_recipient on public.messages (recipient_id, read, created_at desc);
create index idx_messages_sender on public.messages (sender_id, created_at desc);

alter table public.messages enable row level security;

create policy "messages_select" on public.messages for select to authenticated using (
  sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
);
create policy "messages_insert" on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid())
  and school_id = (select public.jwt_school_id())
  and exists (
    select 1 from public.user_profiles up
    where up.id = recipient_id and up.school_id = (select public.jwt_school_id())
  )
);
-- Only the recipient can mutate a message, and only to flip `read`.
create policy "messages_update" on public.messages for update to authenticated using (
  recipient_id = (select auth.uid())
) with check (
  recipient_id = (select auth.uid())
);

-- Deliver a notification to the recipient on every new message.
create or replace function public.tg_notify_new_message()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.notify_user(new.recipient_id, 'Messages', 'New message', new.subject);
  return null;
exception when others then
  return null;
end;
$$;
create or replace trigger trg_notify_new_message
  after insert on public.messages
  for each row execute function public.tg_notify_new_message();
