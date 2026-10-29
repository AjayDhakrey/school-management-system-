-- ============================================================================
-- Plans are sold by school size: each plan allows up to N students.
--   Starter 100 · Growth 500 · Pro 1000 · Enterprise 1500
-- Null means no limit. Edited from Super Admin → Plans.
-- ============================================================================
alter table public.plans
  add column if not exists max_students integer check (max_students is null or max_students > 0);

update public.plans set max_students = 100  where lower(name) = 'starter'    and max_students is null;
update public.plans set max_students = 500  where lower(name) = 'growth'     and max_students is null;
update public.plans set max_students = 1000 where lower(name) = 'pro'        and max_students is null;
update public.plans set max_students = 1500 where lower(name) = 'enterprise' and max_students is null;

-- Let PostgREST see the new column straight away.
notify pgrst, 'reload schema';
