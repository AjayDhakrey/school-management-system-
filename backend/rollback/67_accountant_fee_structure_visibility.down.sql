-- Revert the additional supporting reads for users who can view fee structures.
-- The pre-existing academic-year and class policies, if any, are left intact.

drop policy if exists "academic_years_fee_structures_select" on public.academic_years;
drop policy if exists "academic_years_settings_write" on public.academic_years;
drop policy if exists "classes_fee_structures_select" on public.classes;
