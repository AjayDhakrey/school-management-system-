-- Allow a linked staff member to update their own staff record. This enables the
-- self-service contact profile used by staff, accountants, librarians and transport managers.
-- The frontend only submits phone and photo_url through PATCH /staff/me.

drop policy if exists "staff_update" on public.staff;

create policy "staff_update" on public.staff for update to authenticated using (
  school_id = (select public.jwt_school_id())
  and (
    (select public.has_permission('staff.update'))
    or id = (select public.jwt_linked_staff_id())
  )
) with check (
  school_id = (select public.jwt_school_id())
  and (select public.school_is_active())
);
