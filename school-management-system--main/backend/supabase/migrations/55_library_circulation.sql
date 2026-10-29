-- Library circulation on top of the existing library_books / library_records.
--
-- * library_books stays the catalogue entry (a title) and gains ISBN, category, publisher,
--   edition and shelf. Its `status` column is kept (Available / Issued / Unavailable) and is
--   now derived from the copies so older screens keep working.
-- * library_copies: one row per physical copy (accession number, barcode, copy status).
--   Every existing book becomes one copy.
-- * library_records gains the copy, borrower type (student / teacher / staff), due date,
--   renewals and return condition. Existing loans get a due date of issued_on + 14 days.
-- * library_settings: per-school loan length, borrowing limits and renewals.
-- * All circulation (issue / renew / return) goes through the RPCs below, which enforce the
--   rules; direct writes to library_records are no longer allowed.
-- * History is protected: a book or copy with borrowing history cannot be deleted.

-- ============================================================================
-- 1) Catalogue details and copies
-- ============================================================================

alter table public.library_books
  add column isbn text check (isbn is null or length(isbn) <= 20),
  add column category text check (category is null or length(category) <= 80),
  add column publisher text check (publisher is null or length(publisher) <= 120),
  add column edition text check (edition is null or length(edition) <= 40),
  add column shelf_location text check (shelf_location is null or length(shelf_location) <= 60),
  add column created_at timestamptz not null default now();
create index idx_library_books_school_title on public.library_books (school_id, title);

create table public.library_copies (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  book_id uuid not null references public.library_books (id) on delete cascade,
  accession_no text not null check (length(accession_no) between 1 and 40),
  barcode text check (barcode is null or length(barcode) between 1 and 60),
  status text not null default 'AVAILABLE'
    check (status in ('AVAILABLE', 'ISSUED', 'LOST', 'DAMAGED', 'WITHDRAWN')),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_library_copies_accession on public.library_copies (school_id, lower(accession_no));
create unique index uq_library_copies_barcode on public.library_copies (school_id, lower(barcode))
  where barcode is not null;
create index idx_library_copies_book on public.library_copies (book_id, status);

grant select, insert, update, delete on public.library_copies to authenticated;
grant all on public.library_copies to service_role;

create table public.library_settings (
  school_id text primary key references public.schools (id) on delete cascade,
  student_loan_days int not null default 14 check (student_loan_days between 1 and 365),
  teacher_loan_days int not null default 30 check (teacher_loan_days between 1 and 365),
  staff_loan_days int not null default 30 check (staff_loan_days between 1 and 365),
  student_max_books int not null default 2 check (student_max_books between 0 and 50),
  teacher_max_books int not null default 5 check (teacher_max_books between 0 and 50),
  staff_max_books int not null default 5 check (staff_max_books between 0 and 50),
  max_renewals int not null default 1 check (max_renewals between 0 and 10),
  block_when_overdue boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
grant select, insert, update on public.library_settings to authenticated;
grant all on public.library_settings to service_role;

-- ============================================================================
-- 2) Loans: copy, borrower type, due date, renewals, return condition
-- ============================================================================

alter table public.library_records
  add column copy_id uuid references public.library_copies (id),
  add column borrower_type text not null default 'STUDENT'
    check (borrower_type in ('STUDENT', 'TEACHER', 'STAFF')),
  add column teacher_id uuid references public.teachers (id) on delete cascade,
  add column staff_id uuid references public.staff (id) on delete cascade,
  add column due_date date,
  add column renew_count int not null default 0 check (renew_count >= 0),
  add column return_condition text check (return_condition in ('GOOD', 'DAMAGED', 'LOST')),
  add column remarks text check (remarks is null or length(remarks) <= 300),
  add column issued_by uuid,
  add column returned_by uuid;

-- Backfill: one copy per existing book, then attach every loan to its book's copy.
do $$
declare
  b record;
  v_no int;
begin
  for b in select * from public.library_books order by school_id, title, id loop
    v_no := public.next_school_counter(b.school_id, 'library_accession');
    insert into public.library_copies (school_id, book_id, accession_no, status)
    values (b.school_id, b.id, 'ACC-' || lpad(v_no::text, 5, '0'),
            case when exists (
              select 1 from public.library_records r where r.book_id = b.id and r.returned_on is null
            ) then 'ISSUED' else 'AVAILABLE' end);
  end loop;
end;
$$;

update public.library_records r
   set copy_id = c.id,
       due_date = coalesce(r.due_date, r.issued_on + 14)
  from public.library_copies c
 where c.book_id = r.book_id and r.copy_id is null;

alter table public.library_records add constraint library_records_borrower check (
  (borrower_type = 'STUDENT' and student_id is not null and teacher_id is null and staff_id is null)
  or (borrower_type = 'TEACHER' and teacher_id is not null and student_id is null and staff_id is null)
  or (borrower_type = 'STAFF' and staff_id is not null and student_id is null and teacher_id is null)
);

-- One open loan per physical copy (was: per book, which blocked multiple copies).
drop index if exists public.ux_library_one_active_issue_per_book;
create unique index ux_library_one_active_loan_per_copy on public.library_records (copy_id)
  where returned_on is null;
create index idx_library_records_open on public.library_records (school_id, returned_on, due_date);
create index idx_library_records_teacher on public.library_records (teacher_id) where teacher_id is not null;
create index idx_library_records_staff on public.library_records (staff_id) where staff_id is not null;

-- ============================================================================
-- 3) Guards
-- ============================================================================

create or replace function public.library_isbn_valid(p_isbn text)
returns boolean
language sql immutable as $$
  select p_isbn is null
      or regexp_replace(upper(p_isbn), '[\s-]', '', 'g') ~ '^([0-9]{9}[0-9X]|[0-9]{13})$'
$$;

create or replace function public.tg_library_books_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    -- A school being deleted takes its whole library with it.
    if exists (select 1 from public.library_records where book_id = old.id)
       and exists (select 1 from public.schools where id = old.school_id) then
      raise exception 'This book has borrowing history and cannot be deleted. Mark its copies as Withdrawn instead';
    end if;
    return old;
  end if;

  new.title := trim(new.title);
  if new.title is null or new.title = '' then
    raise exception 'Book title is required';
  end if;
  if length(new.title) > 200 or length(new.author) > 200 then
    raise exception 'Title and author must be at most 200 characters';
  end if;
  new.author := nullif(trim(new.author), '');
  new.isbn := nullif(trim(new.isbn), '');
  new.category := nullif(trim(new.category), '');
  new.publisher := nullif(trim(new.publisher), '');
  new.edition := nullif(trim(new.edition), '');
  new.shelf_location := nullif(trim(new.shelf_location), '');
  if not public.library_isbn_valid(new.isbn) then
    raise exception 'ISBN must have 10 or 13 digits (hyphens allowed)';
  end if;

  -- status is derived from the copies; only the sync trigger may change it.
  if tg_op = 'UPDATE' then
    new.school_id := old.school_id;
    new.created_at := old.created_at;
    if coalesce(current_setting('app.library_sync', true), '') <> 'on' then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_library_books_guard
  before insert or update or delete on public.library_books
  for each row execute function public.tg_library_books_guard();

-- Books added the old way (a plain insert) get one copy so they can still be issued.
create or replace function public.tg_library_books_auto_copy()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.library_no_auto_copy', true), '') <> 'on' then
    insert into public.library_copies (school_id, book_id, accession_no)
    values (new.school_id, new.id,
            'ACC-' || lpad(public.next_school_counter(new.school_id, 'library_accession')::text, 5, '0'));
  end if;
  return null;
end;
$$;

create trigger trg_library_books_auto_copy
  after insert on public.library_books
  for each row execute function public.tg_library_books_auto_copy();

create or replace function public.tg_library_copies_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_circulating boolean := coalesce(current_setting('app.library_circulation', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.library_records where copy_id = old.id)
       and exists (select 1 from public.schools where id = old.school_id)
       and exists (select 1 from public.library_books where id = old.book_id) then
      raise exception 'This copy has borrowing history and cannot be deleted. Mark it as Withdrawn instead';
    end if;
    return old;
  end if;

  new.accession_no := trim(new.accession_no);
  new.barcode := nullif(trim(new.barcode), '');
  new.note := nullif(trim(new.note), '');
  if new.accession_no is null or new.accession_no = '' then
    raise exception 'Accession number is required';
  end if;
  if not exists (
    select 1 from public.library_books where id = new.book_id and school_id = new.school_id
  ) then
    raise exception 'Book not found';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'ISSUED' and not v_circulating then
      raise exception 'A new copy cannot start as issued';
    end if;
  else
    new.school_id := old.school_id;
    new.book_id := old.book_id;
    new.created_at := old.created_at;
    if new.status is distinct from old.status and not v_circulating then
      if old.status = 'ISSUED' then
        raise exception 'This copy is issued. Return it first (choose Lost or Damaged on return if needed)';
      end if;
      if new.status = 'ISSUED' then
        raise exception 'Use Issue Book to lend a copy';
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_library_copies_guard
  before insert or update or delete on public.library_copies
  for each row execute function public.tg_library_copies_guard();

create or replace function public.library_sync_book_status(p_book_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('app.library_sync', 'on', true);
  update public.library_books b
     set status = case
       when exists (select 1 from public.library_copies c where c.book_id = b.id and c.status = 'AVAILABLE') then 'Available'
       when exists (select 1 from public.library_copies c where c.book_id = b.id and c.status = 'ISSUED') then 'Issued'
       else 'Unavailable'
     end
   where b.id = p_book_id;
  perform set_config('app.library_sync', '', true);
end;
$$;

create or replace function public.tg_library_copies_sync_book()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.library_sync_book_status(coalesce(new.book_id, old.book_id));
  return null;
end;
$$;

create trigger trg_library_copies_sync_book
  after insert or update of status or delete on public.library_copies
  for each row execute function public.tg_library_copies_sync_book();

-- ============================================================================
-- 4) Settings and borrower helpers
-- ============================================================================

-- Settings for the caller's school, with defaults when the school has not saved any.
create or replace function public.library_settings_for(p_school_id text)
returns public.library_settings
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select s from public.library_settings s where s.school_id = p_school_id),
    row(p_school_id, 14, 30, 30, 2, 5, 5, 1, true, now(), null)::public.library_settings
  )
$$;

create or replace function public.library_get_settings()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.view');
begin
  return to_jsonb(public.library_settings_for(v_school)) - 'updated_by';
end;
$$;

create or replace function public.library_save_settings(p_settings jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_old public.library_settings;
begin
  perform public.require_active_school();
  v_old := public.library_settings_for(v_school);
  insert into public.library_settings as s (school_id, student_loan_days, teacher_loan_days,
    staff_loan_days, student_max_books, teacher_max_books, staff_max_books, max_renewals,
    block_when_overdue, updated_at, updated_by)
  values (v_school,
    coalesce((p_settings ->> 'studentLoanDays')::int, v_old.student_loan_days),
    coalesce((p_settings ->> 'teacherLoanDays')::int, v_old.teacher_loan_days),
    coalesce((p_settings ->> 'staffLoanDays')::int, v_old.staff_loan_days),
    coalesce((p_settings ->> 'studentMaxBooks')::int, v_old.student_max_books),
    coalesce((p_settings ->> 'teacherMaxBooks')::int, v_old.teacher_max_books),
    coalesce((p_settings ->> 'staffMaxBooks')::int, v_old.staff_max_books),
    coalesce((p_settings ->> 'maxRenewals')::int, v_old.max_renewals),
    coalesce((p_settings ->> 'blockWhenOverdue')::boolean, v_old.block_when_overdue),
    now(), (select auth.uid()))
  on conflict (school_id) do update set
    student_loan_days = excluded.student_loan_days, teacher_loan_days = excluded.teacher_loan_days,
    staff_loan_days = excluded.staff_loan_days, student_max_books = excluded.student_max_books,
    teacher_max_books = excluded.teacher_max_books, staff_max_books = excluded.staff_max_books,
    max_renewals = excluded.max_renewals, block_when_overdue = excluded.block_when_overdue,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform public.log_audit('library.settings_saved', v_school, p_settings::text);
  return public.library_get_settings();
exception
  when check_violation then
    raise exception 'Loan days must be 1–365, limits 0–50 and renewals 0–10';
  when invalid_text_representation then
    raise exception 'Settings must be whole numbers';
end;
$$;

-- Name / number search across students, teachers and staff for the issue screen.
-- Librarians cannot read the teacher and staff tables, so this returns only what is needed.
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

-- ============================================================================
-- 5) Catalogue RPCs
-- ============================================================================

create or replace function public.library_add_copies(p_book_id uuid, p_count int default 1)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_i int;
begin
  perform public.require_active_school();
  if not exists (select 1 from public.library_books where id = p_book_id and school_id = v_school) then
    raise exception 'Book not found';
  end if;
  if p_count is null or p_count < 1 or p_count > 100 then
    raise exception 'Number of copies must be between 1 and 100';
  end if;
  for v_i in 1 .. p_count loop
    insert into public.library_copies (school_id, book_id, accession_no)
    values (v_school, p_book_id,
            'ACC-' || lpad(public.next_school_counter(v_school, 'library_accession')::text, 5, '0'));
  end loop;
  return jsonb_build_object('ok', true, 'count', p_count);
end;
$$;

create or replace function public.library_create_book(p_book jsonb, p_copies int default 1)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_id uuid;
begin
  perform public.require_active_school();
  if p_copies is null or p_copies < 1 or p_copies > 100 then
    raise exception 'Number of copies must be between 1 and 100';
  end if;
  perform set_config('app.library_no_auto_copy', 'on', true);
  insert into public.library_books (school_id, title, author, isbn, category, publisher, edition, shelf_location)
  values (v_school, p_book ->> 'title', p_book ->> 'author', p_book ->> 'isbn', p_book ->> 'category',
          p_book ->> 'publisher', p_book ->> 'edition', p_book ->> 'shelfLocation')
  returning id into v_id;
  perform set_config('app.library_no_auto_copy', '', true);
  perform public.library_add_copies(v_id, p_copies);
  return jsonb_build_object('id', v_id);
end;
$$;

-- ============================================================================
-- 6) Circulation RPCs
-- ============================================================================

create or replace function public.library_issue(
  p_copy_id uuid, p_borrower_type text, p_borrower_id uuid, p_due_date date default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_settings public.library_settings;
  v_copy public.library_copies;
  v_today date := public.app_local_today();
  v_name text;
  v_open int;
  v_limit int;
  v_days int;
  v_due date;
  v_id uuid;
begin
  perform public.require_active_school();
  v_settings := public.library_settings_for(v_school);

  select * into v_copy from public.library_copies where id = p_copy_id and school_id = v_school for update;
  if not found then
    raise exception 'Copy not found';
  end if;
  if v_copy.status <> 'AVAILABLE' then
    raise exception 'Copy % is not available (%)', v_copy.accession_no, lower(v_copy.status);
  end if;

  case p_borrower_type
    when 'STUDENT' then
      select name into v_name from public.students
       where id = p_borrower_id and school_id = v_school and status = 'Active';
      v_limit := v_settings.student_max_books; v_days := v_settings.student_loan_days;
    when 'TEACHER' then
      select name into v_name from public.teachers
       where id = p_borrower_id and school_id = v_school and employment_status <> 'INACTIVE';
      v_limit := v_settings.teacher_max_books; v_days := v_settings.teacher_loan_days;
    when 'STAFF' then
      select name into v_name from public.staff
       where id = p_borrower_id and school_id = v_school and employment_status <> 'INACTIVE';
      v_limit := v_settings.staff_max_books; v_days := v_settings.staff_loan_days;
    else
      raise exception 'Choose whether the borrower is a student, teacher or staff member';
  end case;
  if v_name is null then
    raise exception 'Borrower not found or not active';
  end if;

  select count(*) into v_open from public.library_records
   where school_id = v_school and returned_on is null
     and p_borrower_id = case p_borrower_type
       when 'STUDENT' then student_id when 'TEACHER' then teacher_id else staff_id end;
  if v_open >= v_limit then
    raise exception '% already has % book(s) issued; the limit is %', v_name, v_open, v_limit;
  end if;
  if v_settings.block_when_overdue and exists (
    select 1 from public.library_records
     where school_id = v_school and returned_on is null and due_date < v_today
       and p_borrower_id = case p_borrower_type
         when 'STUDENT' then student_id when 'TEACHER' then teacher_id else staff_id end
  ) then
    raise exception '% has an overdue book. Return it before issuing another', v_name;
  end if;

  v_due := coalesce(p_due_date, v_today + v_days);
  if v_due < v_today then
    raise exception 'Due date cannot be in the past';
  end if;
  if v_due > v_today + 365 then
    raise exception 'Due date cannot be more than a year away';
  end if;

  perform set_config('app.library_circulation', 'on', true);
  insert into public.library_records (school_id, book_id, copy_id, borrower_type, student_id,
                                      teacher_id, staff_id, issued_on, due_date, issued_by)
  values (v_school, v_copy.book_id, v_copy.id, p_borrower_type,
          case when p_borrower_type = 'STUDENT' then p_borrower_id end,
          case when p_borrower_type = 'TEACHER' then p_borrower_id end,
          case when p_borrower_type = 'STAFF' then p_borrower_id end,
          v_today, v_due, (select auth.uid()))
  returning id into v_id;
  update public.library_copies set status = 'ISSUED' where id = v_copy.id;
  perform set_config('app.library_circulation', '', true);

  perform public.log_audit('library.issued', v_id::text, v_copy.accession_no);
  return jsonb_build_object('id', v_id, 'dueDate', v_due);
end;
$$;

-- Existing contract (book + student) kept for older screens: issues the first available copy.
create or replace function public.library_issue_book(p_book_id uuid, p_student_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_copy uuid;
begin
  perform public.require_active_school();
  if not exists (select 1 from public.library_books where id = p_book_id and school_id = v_school) then
    raise exception 'Book not found';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and school_id = v_school) then
    raise exception 'Student not found';
  end if;
  select id into v_copy from public.library_copies
   where book_id = p_book_id and school_id = v_school and status = 'AVAILABLE'
   order by accession_no limit 1;
  if v_copy is null then
    raise exception 'Book is already issued';
  end if;
  return public.library_issue(v_copy, 'STUDENT', p_student_id, null);
end;
$$;

-- Adds an optional condition (GOOD / DAMAGED / LOST) and remarks; old callers pass only the id.
drop function if exists public.library_return_book(uuid);
create or replace function public.library_return_book(
  p_record_id uuid, p_condition text default 'GOOD', p_remarks text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_record public.library_records;
  v_condition text := upper(coalesce(p_condition, 'GOOD'));
begin
  perform public.require_active_school();
  select * into v_record from public.library_records where id = p_record_id and school_id = v_school for update;
  if not found then
    raise exception 'Record not found';
  end if;
  if v_record.returned_on is not null then
    raise exception 'Book was already returned';
  end if;
  if v_condition not in ('GOOD', 'DAMAGED', 'LOST') then
    raise exception 'Condition must be Good, Damaged or Lost';
  end if;
  if length(p_remarks) > 300 then
    raise exception 'Remarks must be 300 characters or less';
  end if;

  perform set_config('app.library_circulation', 'on', true);
  update public.library_records
     set returned_on = public.app_local_today(), return_condition = v_condition,
         remarks = nullif(trim(p_remarks), ''), returned_by = (select auth.uid())
   where id = p_record_id;
  if v_record.copy_id is not null then
    update public.library_copies
       set status = case v_condition when 'GOOD' then 'AVAILABLE' else v_condition end
     where id = v_record.copy_id;
  else
    perform public.library_sync_book_status(v_record.book_id);
  end if;
  perform set_config('app.library_circulation', '', true);

  perform public.log_audit('library.returned', p_record_id::text, v_condition);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.library_renew(p_record_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_settings public.library_settings;
  v_record public.library_records;
  v_today date := public.app_local_today();
  v_days int;
  v_due date;
begin
  perform public.require_active_school();
  v_settings := public.library_settings_for(v_school);
  select * into v_record from public.library_records where id = p_record_id and school_id = v_school for update;
  if not found then
    raise exception 'Record not found';
  end if;
  if v_record.returned_on is not null then
    raise exception 'This book has already been returned';
  end if;
  if v_record.due_date < v_today then
    raise exception 'This book is overdue. Return it instead of renewing';
  end if;
  if v_record.renew_count >= v_settings.max_renewals then
    raise exception 'Renewal limit reached (% allowed)', v_settings.max_renewals;
  end if;
  v_days := case v_record.borrower_type
    when 'STUDENT' then v_settings.student_loan_days
    when 'TEACHER' then v_settings.teacher_loan_days
    else v_settings.staff_loan_days end;
  v_due := greatest(v_record.due_date, v_today + v_days);
  update public.library_records set due_date = v_due, renew_count = renew_count + 1 where id = p_record_id;
  perform public.log_audit('library.renewed', p_record_id::text, v_due::text);
  return jsonb_build_object('ok', true, 'dueDate', v_due);
end;
$$;

-- All loans of the school with book, copy and borrower details, for the librarian's screens.
create or replace function public.library_circulation()
returns table (
  id uuid, book_id uuid, copy_id uuid, title text, author text, isbn text, category text,
  accession_no text, barcode text, borrower_type text, borrower_id uuid, borrower_name text,
  borrower_number text, borrower_detail text, issued_on date, due_date date, returned_on date,
  renew_count int, return_condition text, remarks text, overdue_days int
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('library.manage');
  v_today date := public.app_local_today();
begin
  return query
  select r.id, r.book_id, r.copy_id, b.title, b.author, b.isbn, b.category,
         c.accession_no, c.barcode, r.borrower_type,
         coalesce(r.student_id, r.teacher_id, r.staff_id),
         coalesce(s.name, t.name, st.name),
         coalesce(s.admission_no, t.employee_id, st.employee_id),
         case r.borrower_type
           when 'STUDENT' then trim(coalesce(cl.name, s.class_name, '') || ' ' || coalesce(cl.section, s.section, ''))
           when 'TEACHER' then coalesce(t.designation, 'Teacher')
           else coalesce(st.designation, 'Staff') end,
         r.issued_on, r.due_date, r.returned_on, r.renew_count, r.return_condition, r.remarks,
         case when r.returned_on is null and r.due_date < v_today then (v_today - r.due_date) else 0 end
    from public.library_records r
    left join public.library_books b on b.id = r.book_id
    left join public.library_copies c on c.id = r.copy_id
    left join public.students s on s.id = r.student_id
    left join public.classes cl on cl.id = s.class_id
    left join public.teachers t on t.id = r.teacher_id
    left join public.staff st on st.id = r.staff_id
   where r.school_id = v_school
   order by r.issued_on desc, r.id;
end;
$$;

revoke execute on function public.library_settings_for(text) from public, anon, authenticated;
revoke execute on function public.library_sync_book_status(uuid) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.library_get_settings()', 'public.library_save_settings(jsonb)',
    'public.library_find_borrowers(text, text)', 'public.library_add_copies(uuid, int)',
    'public.library_create_book(jsonb, int)', 'public.library_issue(uuid, text, uuid, date)',
    'public.library_issue_book(uuid, uuid)', 'public.library_return_book(uuid, text, text)',
    'public.library_renew(uuid)', 'public.library_circulation()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

-- ============================================================================
-- 7) Row-level security
-- ============================================================================

alter table public.library_copies enable row level security;
alter table public.library_settings enable row level security;

-- Copy rows carry no borrower details, so every library reader may see availability.
create policy "library_copies_select" on public.library_copies for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('library.view'))
);
create policy "library_copies_write" on public.library_copies for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('library.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('library.manage'))
);

create policy "library_settings_select" on public.library_settings for select to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('library.view'))
);

-- Loans: the library team sees all; everyone else sees only their own (was: teachers saw all).
drop policy if exists "library_records_select" on public.library_records;
create policy "library_records_select" on public.library_records for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('library.view'))
  and (
    (select public.jwt_role()) = 'SCHOOL_ADMIN'
    or (select public.has_permission('library.manage'))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT') and student_id in (select public.current_owned_student_ids()))
    or ((select public.jwt_role()) = 'TEACHER' and teacher_id = (select public.jwt_linked_teacher_id()))
    or ((select public.jwt_role()) = 'STAFF' and staff_id = (select public.jwt_linked_staff_id()))
  )
);
-- Issue / renew / return only through the RPCs above.
drop policy if exists "library_records_write" on public.library_records;

-- Other staff departments can browse the catalogue and see their own loans.
insert into public.role_permission_defaults (role, department, permission)
select 'STAFF', d::public.staff_department, 'library.view'
  from unnest(array['ADMIN', 'ACCOUNTS', 'TRANSPORT']) d
 where not exists (
   select 1 from public.role_permission_defaults x
    where x.role = 'STAFF' and x.department = d::public.staff_department and x.permission = 'library.view'
 );
