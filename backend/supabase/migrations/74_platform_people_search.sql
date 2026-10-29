-- ============================================================================
-- Header quick-search for SUPER_ADMIN. Students, teachers and staff are scoped to
-- jwt_school_id() under RLS, and a platform operator has no school, so the plain
-- table reads return nothing. This SECURITY DEFINER lookup searches every school by
-- name / admission no. / email and returns only what the search popover shows.
-- ============================================================================

create or replace function public.platform_search_people(p_query text, p_limit integer default 8)
returns table (
  kind text,
  id uuid,
  name text,
  detail text,
  school_id text,
  school_name text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_q text := nullif(trim(coalesce(p_query, '')), '');
  v_prefix text;
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 50);
begin
  if (select public.jwt_role()) <> 'SUPER_ADMIN' then raise exception 'Forbidden'; end if;
  if v_q is null then return; end if;
  -- Treat the user's text literally inside ILIKE.
  v_prefix := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select p.kind, p.id, p.name, p.detail, p.school_id, sc.name as school_name
  from (
    (select 'STUDENT'::text as kind, s.id, s.name,
        concat_ws(' · ', s.admission_no,
          nullif(concat_ws(' ', s.class_name, s.section), '')) as detail,
        s.school_id
      from public.students s
      where s.name ilike '%' || v_prefix or s.admission_no ilike '%' || v_prefix
      order by s.name
      limit v_limit)
    union all
    (select 'TEACHER'::text, t.id, t.name, concat_ws(' · ', t.designation, t.email), t.school_id
      from public.teachers t
      where t.name ilike '%' || v_prefix or t.email ilike '%' || v_prefix
      order by t.name
      limit v_limit)
    union all
    (select 'STAFF'::text, st.id, st.name, concat_ws(' · ', st.designation, st.email), st.school_id
      from public.staff st
      where st.name ilike '%' || v_prefix or st.email ilike '%' || v_prefix
      order by st.name
      limit v_limit)
  ) p
  join public.schools sc on sc.id = p.school_id
  -- Names that start with the query rank above mid-word matches.
  order by (p.name ilike v_prefix) desc, p.name
  limit v_limit;
end;
$$;

revoke execute on function public.platform_search_people(text, integer) from public, anon;
grant execute on function public.platform_search_people(text, integer) to authenticated;
