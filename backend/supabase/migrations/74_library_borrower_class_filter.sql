-- Let the librarian narrow the "Issue a Book" student search by class and section.
-- Librarians do not hold classes.view, so the class/section options come from a library RPC.
-- With a class picked, the name search is optional and the whole class (or section) is listed.

drop function if exists public.library_find_borrowers(text, text);

create or replace function public.library_find_borrowers(
  p_query text,
  p_type text default null,
  p_class text default null,
  p_section text default null
)
returns table (borrower_type text, id uuid, name text, number text, detail text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_term text := lower(trim(coalesce(p_query, '')));
  v_q text := '%' || v_term || '%';
  v_class text := nullif(trim(coalesce(p_class, '')), '');
  v_section text := nullif(trim(coalesce(p_section, '')), '');
begin
  -- Without a class filter a search term is required, as before.
  if length(v_term) < 1 and v_class is null then
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
       and (v_class is null or coalesce(c.name, s.class_name) = v_class)
       and (v_section is null or coalesce(c.section, s.section) = v_section)
       and (lower(s.name) like v_q or lower(coalesce(s.admission_no, '')) like v_q)
    union all
    select 'TEACHER', t.id, t.name, t.employee_id, coalesce(t.designation, 'Teacher')
      from public.teachers t
     where t.school_id = v_school and t.employment_status <> 'INACTIVE'
       and v_class is null
       and (p_type is null or p_type = 'TEACHER')
       and (lower(t.name) like v_q or lower(coalesce(t.employee_id, '')) like v_q)
    union all
    select 'STAFF', st.id, st.name, st.employee_id, coalesce(st.designation, 'Staff')
      from public.staff st
     where st.school_id = v_school and st.employment_status <> 'INACTIVE'
       and v_class is null
       and (p_type is null or p_type = 'STAFF')
       and (lower(st.name) like v_q or lower(coalesce(st.employee_id, '')) like v_q)
  ) found
  order by 3
  limit case when v_class is null then 25 else 200 end;
end;
$$;

-- Class and section pairs that have at least one active student.
create or replace function public.library_student_classes()
returns table (class_name text, section text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
begin
  return query
  select distinct coalesce(c.name, s.class_name)::text, coalesce(c.section, s.section)::text
    from public.students s
    left join public.classes c on c.id = s.class_id
   where s.school_id = v_school and s.status = 'Active'
     and coalesce(c.name, s.class_name) is not null
   order by 1, 2;
end;
$$;

revoke execute on function public.library_find_borrowers(text, text, text, text) from public, anon;
grant execute on function public.library_find_borrowers(text, text, text, text)
  to authenticated, service_role;
revoke execute on function public.library_student_classes() from public, anon;
grant execute on function public.library_student_classes() to authenticated, service_role;
