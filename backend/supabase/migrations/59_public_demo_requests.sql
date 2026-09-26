-- ============================================================================
-- Public "Book a demo" form on the marketing landing page.
--
-- Anonymous visitors cannot touch public.leads directly (RLS is Super Admin
-- only). Instead they call this narrow SECURITY DEFINER RPC, which validates
-- input, throttles repeat submissions and files a NEW lead that shows up on
-- the Super Admin -> Leads page.
-- ============================================================================

create or replace function public.submit_demo_request(
  p_school_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_school text := trim(coalesce(p_school_name, ''));
  v_contact text := trim(coalesce(p_contact_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
begin
  if length(v_school) < 2 or length(v_school) > 160 then
    raise exception 'Please enter your school name';
  end if;
  if length(v_contact) < 2 or length(v_contact) > 120 then
    raise exception 'Please enter your name';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    raise exception 'Please enter a valid email address';
  end if;
  if v_phone !~ '^[0-9+()\-\s]{7,20}$' then
    raise exception 'Please enter a valid phone number';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Message is too long';
  end if;

  -- Basic spam guard: one request per email every 10 minutes.
  if exists (
    select 1 from public.leads
    where lower(email) = v_email and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'We already have your request — our team will contact you shortly';
  end if;

  insert into public.leads (school_name, contact_name, email, phone, source, status, notes)
  values (v_school, v_contact, v_email, v_phone, 'Website - Book a demo', 'NEW', nullif(trim(p_notes), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_demo_request(text, text, text, text, text) from public;
grant execute on function public.submit_demo_request(text, text, text, text, text) to anon, authenticated;
