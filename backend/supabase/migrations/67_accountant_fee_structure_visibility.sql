-- Fee Structure supporting data is also required by Accounts staff.  The fee
-- structure policy already scopes the actual fees by school and requires
-- `fee_structures.view`, but the related academic_years/classes reads were
-- still governed by their own policies.  That made the chart look as though
-- the school had no session when an accountant opened it.
--
-- Use the existing fee-structure read permission for the two supporting
-- lookups.  This keeps custom role overrides authoritative: removing
-- `fee_structures.view` also removes these reads.  Both policies retain the
-- JWT school predicate, so they cannot disclose another school's sessions or
-- class metadata.

alter table public.academic_years enable row level security;

drop policy if exists "academic_years_fee_structures_select" on public.academic_years;
create policy "academic_years_fee_structures_select"
  on public.academic_years
  for select
  to authenticated
  using (
    school_id = (select public.jwt_school_id())
    and (select public.has_permission('fee_structures.view'))
  );

-- If this table came from the pre-Supabase schema it may not yet have had an
-- RLS write policy.  Keep the School Admin's academic-year management path
-- working while restricting writes to the existing settings permission.
drop policy if exists "academic_years_settings_write" on public.academic_years;
create policy "academic_years_settings_write"
  on public.academic_years
  for all
  to authenticated
  using (
    school_id = (select public.jwt_school_id())
    and (select public.has_permission('settings.manage'))
  )
  with check (
    school_id = (select public.jwt_school_id())
    and (select public.school_is_active())
    and (select public.has_permission('settings.manage'))
  );

drop policy if exists "classes_fee_structures_select" on public.classes;
create policy "classes_fee_structures_select"
  on public.classes
  for select
  to authenticated
  using (
    school_id = (select public.jwt_school_id())
    and (select public.has_permission('fee_structures.view'))
  );
