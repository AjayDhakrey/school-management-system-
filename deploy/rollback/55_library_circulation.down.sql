-- ROLLBACK for 55_library_circulation.sql (emergency use only).
-- Restores the pre-55 library functions/policies captured from production on 2026-09-23.
-- Copies, settings and loans to teachers/staff are removed; student loans are kept.
begin;
set local lock_timeout = '5s';
drop trigger if exists trg_library_books_guard on public.library_books;
drop trigger if exists trg_library_books_auto_copy on public.library_books;

drop function if exists public.library_return_book(uuid, text, text);
drop function if exists public.library_issue(uuid, text, uuid, date);
drop function if exists public.library_renew(uuid);
drop function if exists public.library_circulation();
drop function if exists public.library_find_borrowers(text, text);
drop function if exists public.library_add_copies(uuid, int);
drop function if exists public.library_create_book(jsonb, int);
drop function if exists public.library_get_settings();
drop function if exists public.library_save_settings(jsonb);
drop function if exists public.library_settings_for(text);
CREATE OR REPLACE FUNCTION public.library_issue_book(p_book_id uuid, p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_school text := public.require_school_permission('library.manage');
  v_book public.library_books;
  v_id uuid;
begin
  perform public.require_active_school();
  select * into v_book from public.library_books where id = p_book_id and school_id = v_school for update;
  if not found then
    raise exception 'Book not found';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and school_id = v_school) then
    raise exception 'Student not found';
  end if;
  if v_book.status = 'Issued' or exists (
    select 1 from public.library_records where book_id = p_book_id and returned_on is null
  ) then
    raise exception 'Book is already issued';
  end if;
  insert into public.library_records (school_id, book_id, student_id, issued_on)
  values (v_school, p_book_id, p_student_id, public.app_local_today())
  returning id into v_id;
  update public.library_books set status = 'Issued' where id = p_book_id;
  return jsonb_build_object('id', v_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.library_return_book(p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_school text := public.require_school_permission('library.manage');
  v_record public.library_records;
begin
  perform public.require_active_school();
  select * into v_record from public.library_records where id = p_record_id and school_id = v_school for update;
  if not found then
    raise exception 'Record not found';
  end if;
  if v_record.returned_on is not null then
    raise exception 'Book was already returned';
  end if;
  update public.library_records set returned_on = public.app_local_today() where id = p_record_id;
  update public.library_books set status = 'Available' where id = v_record.book_id;
  return jsonb_build_object('ok', true);
end;
$function$;
revoke execute on function public.library_issue_book(uuid, uuid) from public, anon;
revoke execute on function public.library_return_book(uuid) from public, anon;
grant execute on function public.library_issue_book(uuid, uuid) to authenticated, service_role;
grant execute on function public.library_return_book(uuid) to authenticated, service_role;

drop policy if exists "library_records_select" on public.library_records;
create policy "library_records_select" on public.library_records for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('library.view'))
  and ((select public.jwt_role()) = any (array['SCHOOL_ADMIN', 'STAFF', 'TEACHER'])
       or ((select public.jwt_role()) = any (array['PARENT', 'STUDENT'])
           and student_id in (select public.current_owned_student_ids())))
);
create policy "library_records_write" on public.library_records for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('library.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('library.manage'))
);

-- Loans made to teachers/staff cannot exist in the old schema.
delete from public.library_records where borrower_type <> 'STUDENT';
drop index if exists public.ux_library_one_active_loan_per_copy;
drop index if exists public.idx_library_records_open;
drop index if exists public.idx_library_records_teacher;
drop index if exists public.idx_library_records_staff;
alter table public.library_records drop constraint if exists library_records_borrower;
alter table public.library_records
  drop column if exists copy_id, drop column if exists borrower_type, drop column if exists teacher_id,
  drop column if exists staff_id, drop column if exists due_date, drop column if exists renew_count,
  drop column if exists return_condition, drop column if exists remarks, drop column if exists issued_by,
  drop column if exists returned_by;
-- Fails if a title has several copies out at once; close those loans first.
create unique index ux_library_one_active_issue_per_book on public.library_records (book_id) where returned_on is null;

drop table if exists public.library_copies cascade;
drop function if exists public.tg_library_copies_guard();
drop function if exists public.tg_library_copies_sync_book();
drop function if exists public.library_sync_book_status(uuid);
drop function if exists public.tg_library_books_guard();
drop function if exists public.tg_library_books_auto_copy();
drop table if exists public.library_settings;
drop index if exists public.idx_library_books_school_title;
alter table public.library_books drop column if exists isbn, drop column if exists category,
  drop column if exists publisher, drop column if exists edition, drop column if exists shelf_location,
  drop column if exists created_at;
drop function if exists public.library_isbn_valid(text);
update public.library_books b set status = case when exists (select 1 from public.library_records r where r.book_id = b.id and r.returned_on is null) then 'Issued' else 'Available' end;
delete from public.role_permission_defaults where role = 'STAFF' and permission = 'library.view'
  and department in ('ADMIN', 'ACCOUNTS', 'TRANSPORT');
delete from public.school_counters where counter_name = 'library_accession';
delete from supabase_migrations.schema_migrations where version = '55';
commit;
