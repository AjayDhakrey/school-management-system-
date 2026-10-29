-- Restore the administrator-only staff update policy.

drop policy if exists "staff_update" on public.staff;

create policy "staff_update" on public.staff for update to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('staff.update'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);
