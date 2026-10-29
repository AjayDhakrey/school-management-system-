-- Restore the original two-argument borrower search and drop the class options RPC.

drop function if exists public.library_student_classes();
drop function if exists public.library_find_borrowers(text, text, text, text);

create or replace function public.library_find_borrowers(p_query text, p_type text default null)
returns table (borrower_type text, id uuid, name text, number text, detail text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_q text := '%' || lower(trim(coalesce(p_query, ''))) || '%';
begin
  if length(trim(coalesce(p_query, ''))) < 1 then
    return;
  end if;
  return query
  select * from (
    select 'STUDENT'::text, s.id, s.name, s.admission_no,
           trim(coalesce(c.name, s.class_name, '') || ' ' || coalesce(c.section, s.section, ''))
             || coalesce(' · Roll ' || s.roll, '')
      from public.students s
      left join public.classes c on c.id = s.class_id
     where s.school_id = v_school and s.status = 'Active'
       and (p_type is null or p_type = 'STUDENT')
       and (lower(s.name) like v_q or lower(coalesce(s.admission_no, '')) like v_q)
    union all
    select 'TEACHER', t.id, t.name, t.employee_id, coalesce(t.designation, 'Teacher')
      from public.teachers t
     where t.school_id = v_school and t.employment_status <> 'INACTIVE'
       and (p_type is null or p_type = 'TEACHER')
       and (lower(t.name) like v_q or lower(coalesce(t.employee_id, '')) like v_q)
    union all
    select 'STAFF', st.id, st.name, st.employee_id, coalesce(st.designation, 'Staff')
      from public.staff st
     where st.school_id = v_school and st.employment_status <> 'INACTIVE'
       and (p_type is null or p_type = 'STAFF')
       and (lower(st.name) like v_q or lower(coalesce(st.employee_id, '')) like v_q)
  ) found
  order by 3
  limit 25;
end;
$$;

revoke execute on function public.library_find_borrowers(text, text) from public, anon;
grant execute on function public.library_find_borrowers(text, text) to authenticated, service_role;
