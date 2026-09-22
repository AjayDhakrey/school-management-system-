-- Custom Access Token Hook: injects role/school_id/department/linked_*_id from user_profiles
-- into every issued JWT, so RLS policies can read them via auth.jwt() without a DB round trip
-- per request. Registering this function as the active hook is a MANUAL step in the Supabase
-- Dashboard (Authentication -> Hooks -> Customize Access Token) or supabase/config.toml under
-- [auth.hook.custom_access_token] — it is not activated just by creating the function.
-- A misconfigured/unregistered hook means app_role/school_id are never set, and every RLS
-- policy in 25/26_rls_policies_*.sql silently evaluates to false (fails closed).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb := event -> 'claims';
  profile record;
begin
  select role, school_id, department, linked_teacher_id, linked_parent_id,
         linked_student_id, linked_staff_id
    into profile
    from public.user_profiles
    where id = (event ->> 'user_id')::uuid;

  -- NOT `if profile is not null`: row-wise NULL semantics make that true only when every
  -- selected column is non-null, and department/linked_*_id are legitimately null for most
  -- roles — so that check silently failed for ~every real user. `found` reflects whether the
  -- SELECT actually matched a row, which is what's intended here.
  if found then
    claims := claims || jsonb_build_object(
      'app_role', profile.role,
      'school_id', profile.school_id,
      'department', profile.department,
      'linked_teacher_id', profile.linked_teacher_id,
      'linked_parent_id', profile.linked_parent_id,
      'linked_student_id', profile.linked_student_id,
      'linked_staff_id', profile.linked_staff_id
    );
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on public.user_profiles to supabase_auth_admin;
create policy "auth admin reads profiles for claims"
  on public.user_profiles for select to supabase_auth_admin using (true);
