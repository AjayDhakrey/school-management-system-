-- Examination scheduling on top of the existing per-paper `exams` rows.
--
-- Until now an "examination" was only the free-text `exams.name` shared by its subject papers.
-- This adds an `examinations` header (academic year, term, type, date range, classes, passing
-- percentage) that papers can belong to, and completes the existing lifecycle
-- DRAFT -> MARKS_ENTRY -> REVIEW -> PUBLISHED (+ CANCELLED), which is unchanged:
--   * teachers can now submit their marks for review (submit_exam_marks)
--   * reviewers can return marks with a comment (return_exam_marks)
--   * publishing requires every student to have marks or an attendance status
--   * scheduling rejects class / room / invigilator time clashes and out-of-range dates
--   * direct writes to `results` are held to the same rules as save_exam_marks
--
-- Additive only: existing papers are grouped into headers by (school, year, name) and keep
-- their data; papers without a header (examination_id null) keep working as before.

-- ============================================================================
-- 1) Exam types (a superset of the previous list) and the review/publish permission
-- ============================================================================

create or replace function public.exam_type_options()
returns text[]
language sql immutable as $$
  select array[
    'Unit Test', 'Monthly Test', 'Periodic Test', 'Mid-Term', 'Half-Yearly', 'Pre-Final',
    'End-Term', 'Final', 'Practical', 'Re-Test', 'Improvement', 'Compartment', 'Other'
  ]
$$;

alter table public.exams drop constraint if exists exams_type_check;
alter table public.exams add constraint exams_type_check check (
  exam_type = any (array[
    'Unit Test', 'Monthly Test', 'Periodic Test', 'Mid-Term', 'Half-Yearly', 'Pre-Final',
    'End-Term', 'Final', 'Practical', 'Re-Test', 'Improvement', 'Compartment', 'Other'
  ])
);

-- Reviewing (return / publish) is separated from entering marks (results.manage).
-- SCHOOL_ADMIN holds every school permission already; other roles get it via Roles.
insert into public.permissions (key) values ('results.publish') on conflict do nothing;

-- ============================================================================
-- 2) Examination header
-- ============================================================================

create table public.examinations (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  term text check (term is null or length(term) between 1 and 40),
  exam_type text not null check (
    exam_type = any (array[
      'Unit Test', 'Monthly Test', 'Periodic Test', 'Mid-Term', 'Half-Yearly', 'Pre-Final',
      'End-Term', 'Final', 'Practical', 'Re-Test', 'Improvement', 'Compartment', 'Other'
    ])
  ),
  name text not null check (length(name) between 1 and 120),
  description text check (description is null or length(description) <= 1000),
  start_date date not null,
  end_date date not null,
  passing_percentage numeric(5, 2) not null default 33
    check (passing_percentage >= 0 and passing_percentage <= 100),
  -- Applicable class-sections; empty means "any class of the academic year".
  class_ids uuid[] not null default '{}',
  -- Re-Test / Improvement / Compartment exams point at the exam they repeat. The original
  -- papers and results are never touched; the new exam has its own papers and results.
  based_on_examination_id uuid references public.examinations (id) on delete set null,
  schedule_published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint examinations_dates_valid check (start_date <= end_date)
);
create unique index uq_examinations_school_year_name
  on public.examinations (school_id, academic_year_id, lower(name));
create index idx_examinations_school_year
  on public.examinations (school_id, academic_year_id, start_date);

grant select, insert, update, delete on public.examinations to authenticated;
grant all on public.examinations to service_role;

alter table public.exams
  add column examination_id uuid references public.examinations (id) on delete restrict,
  add column invigilator_id uuid references public.teachers (id) on delete set null,
  add column review_note text check (review_note is null or length(review_note) <= 500),
  add column submitted_at timestamptz,
  add column submitted_by uuid,
  add column published_at timestamptz,
  add column published_by uuid;

-- ============================================================================
-- 3) Group existing papers under headers. Runs before tg_exams_guard is replaced: the
--    current guard lets examination_id change on any status because it is not a
--    schedule field there.
-- ============================================================================

insert into public.examinations (school_id, academic_year_id, exam_type, name, start_date,
                                 end_date, passing_percentage, class_ids, created_at)
select e.school_id,
       e.academic_year_id,
       mode() within group (order by e.exam_type),
       min(trim(e.name)),
       min(e.date),
       max(e.date),
       coalesce(least(100, greatest(0, round(min(e.passing_marks / nullif(e.maximum_marks, 0) * 100), 2))), 33),
       array_agg(distinct e.class_id) filter (where e.class_id is not null),
       min(e.created_at)
  from public.exams e
 where e.academic_year_id is not null and nullif(trim(e.name), '') is not null
   and e.date is not null
 group by e.school_id, e.academic_year_id, lower(trim(e.name));

update public.exams e
   set examination_id = x.id
  from public.examinations x
 where e.examination_id is null
   and x.school_id = e.school_id
   and x.academic_year_id = e.academic_year_id
   and lower(x.name) = lower(trim(e.name));

-- Backfilled headers whose papers students could already see keep that visibility.
update public.examinations x
   set schedule_published_at = x.created_at
 where exists (
   select 1 from public.exams e
    where e.examination_id = x.id and e.status not in ('DRAFT', 'CANCELLED')
 );

create index idx_exams_examination on public.exams (examination_id, class_id);
create unique index uq_exam_paper on public.exams (examination_id, class_id, subject_id)
  where examination_id is not null and status <> 'CANCELLED';
create index idx_exams_room_date on public.exams (room_id, date) where room_id is not null;
create index idx_exams_invigilator_date on public.exams (invigilator_id, date)
  where invigilator_id is not null;
create index idx_results_exam on public.results (exam_id);

-- ============================================================================
-- 4) Header guard
-- ============================================================================

create or replace function public.tg_examinations_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_year public.academic_years;
  v_count int;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.exams where examination_id = old.id) then
      raise exception 'This examination still has papers. Delete its draft papers first — examinations with marks or cancelled papers are kept for the record';
    end if;
    return old;
  end if;

  new.name := trim(new.name);
  new.term := nullif(trim(new.term), '');
  new.description := nullif(trim(new.description), '');
  if new.name is null or new.name = '' then
    raise exception 'Examination name is required';
  end if;
  if new.exam_type is null or not (new.exam_type = any (public.exam_type_options())) then
    raise exception 'Choose a valid exam type';
  end if;
  if new.start_date is null or new.end_date is null then
    raise exception 'Start date and end date are required';
  end if;
  if new.end_date < new.start_date then
    raise exception 'End date cannot be before the start date';
  end if;
  if new.passing_percentage is null or new.passing_percentage < 0 or new.passing_percentage > 100 then
    raise exception 'Passing percentage must be between 0 and 100';
  end if;

  select * into v_year from public.academic_years
   where id = new.academic_year_id and school_id = new.school_id;
  if not found then
    raise exception 'Choose an academic year of this school';
  end if;
  if new.start_date < v_year.start_date or new.end_date > v_year.end_date then
    raise exception 'Examination dates must fall inside the academic year % (% to %)', v_year.name,
      to_char(v_year.start_date, 'DD Mon YYYY'), to_char(v_year.end_date, 'DD Mon YYYY');
  end if;

  new.class_ids := coalesce(array(select distinct c from unnest(new.class_ids) c where c is not null), '{}');
  select count(*) into v_count from unnest(new.class_ids) c
   where not exists (
     select 1 from public.classes cl
      where cl.id = c and cl.school_id = new.school_id and cl.academic_year_id = new.academic_year_id
   );
  if v_count > 0 then
    raise exception 'Every selected class must belong to this school and academic year';
  end if;

  if new.based_on_examination_id is not null and not exists (
    select 1 from public.examinations
     where id = new.based_on_examination_id and school_id = new.school_id and id <> new.id
  ) then
    raise exception 'The original examination was not found';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.schedule_published_at := case when new.schedule_published_at is not null then now() end;
    return new;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if new.schedule_published_at is not null then
    new.schedule_published_at := coalesce(old.schedule_published_at, now());
  end if;

  if exists (select 1 from public.exams where examination_id = old.id) then
    if new.academic_year_id is distinct from old.academic_year_id then
      raise exception 'The academic year cannot be changed after papers are scheduled';
    end if;
    if (new.name, new.exam_type) is distinct from (old.name, old.exam_type) and exists (
      select 1 from public.exams
       where examination_id = old.id and status not in ('DRAFT', 'CANCELLED')
    ) then
      raise exception 'Name and exam type are locked once marks entry has started';
    end if;
    select count(*) into v_count from public.exams
     where examination_id = old.id and status <> 'CANCELLED'
       and (date < new.start_date or date > new.end_date);
    if v_count > 0 then
      raise exception '% scheduled paper(s) fall outside the new dates. Reschedule them first', v_count;
    end if;
    if cardinality(new.class_ids) > 0 and exists (
      select 1 from public.exams
       where examination_id = old.id and status <> 'CANCELLED'
         and not (class_id = any (new.class_ids))
    ) then
      raise exception 'A class you removed still has papers in this examination. Delete those papers first';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_examinations_guard
  before insert or update or delete on public.examinations
  for each row execute function public.tg_examinations_guard();

-- Renaming a header (allowed only while its papers are drafts) renames the papers, which is
-- what report cards group by.
create or replace function public.tg_examinations_sync_papers()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.name, new.exam_type) is distinct from (old.name, old.exam_type) then
    update public.exams set name = new.name, exam_type = new.exam_type
     where examination_id = new.id and status = 'DRAFT';
  end if;
  return null;
end;
$$;

create trigger trg_examinations_sync_papers
  after update on public.examinations
  for each row execute function public.tg_examinations_sync_papers();

-- ============================================================================
-- 5) Paper guard: every rule of the previous version, plus header, clash and status checks
-- ============================================================================

create or replace function public.tg_exams_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_class public.classes;
  v_subject public.subjects;
  v_header public.examinations;
  v_year public.academic_years;
  v_allowed text[];
  v_clash record;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' or exists (select 1 from public.results where exam_id = old.id) then
      raise exception 'Only an unused draft exam can be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Workflow stamps are written only by the RPC that owns each step.
    if coalesce(current_setting('app.publishing_exam', true), '') <> old.id::text then
      new.published_at := old.published_at;
      new.published_by := old.published_by;
    end if;
    if coalesce(current_setting('app.submitting_exam', true), '') <> old.id::text then
      new.submitted_at := old.submitted_at;
      new.submitted_by := old.submitted_by;
    end if;

    if new.status is distinct from old.status then
      v_allowed := case old.status
        when 'DRAFT' then array['MARKS_ENTRY', 'CANCELLED']
        when 'MARKS_ENTRY' then array['REVIEW']
        when 'REVIEW' then array['MARKS_ENTRY', 'PUBLISHED']
        else array[]::text[]
      end;
      if not (new.status = any (v_allowed)) then
        raise exception 'Invalid exam lifecycle transition';
      end if;
      if new.status = 'PUBLISHED'
         and coalesce(current_setting('app.publishing_exam', true), '') <> old.id::text then
        raise exception 'Use Publish Results so marks are checked before publication';
      end if;
    end if;
    if (new.academic_year_id, new.class_id, new.subject_id, new.name, new.exam_type, new.date,
        new.start_time, new.end_time, new.maximum_marks, new.passing_marks, new.room_id,
        new.examination_id, new.invigilator_id)
       is not distinct from
       (old.academic_year_id, old.class_id, old.subject_id, old.name, old.exam_type, old.date,
        old.start_time, old.end_time, old.maximum_marks, old.passing_marks, old.room_id,
        old.examination_id, old.invigilator_id) then
      new.updated_at := now();
      return new;
    end if;
    if old.status <> 'DRAFT' then
      raise exception 'Schedule can only be edited while draft';
    end if;
  else
    new.status := 'DRAFT';
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.submitted_at := null;
    new.submitted_by := null;
    new.published_at := null;
    new.published_by := null;
  end if;

  if new.examination_id is not null then
    select * into v_header from public.examinations
     where id = new.examination_id and school_id = new.school_id;
    if not found then
      raise exception 'Examination not found';
    end if;
    new.name := v_header.name;
    new.exam_type := v_header.exam_type;
    new.academic_year_id := v_header.academic_year_id;
  end if;

  new.name := trim(new.name);
  if new.name is null or new.name = '' then
    raise exception 'Exam name is required';
  end if;
  if new.exam_type is null or not (new.exam_type = any (public.exam_type_options())) then
    raise exception 'Choose a valid exam type';
  end if;
  if new.date is null then
    raise exception 'Exam date is required';
  end if;
  if new.maximum_marks is null or new.maximum_marks <= 0 then
    raise exception 'Maximum marks must be greater than 0';
  end if;
  if new.passing_marks is null or new.passing_marks < 0 then
    raise exception 'Passing marks cannot be negative';
  end if;
  if new.passing_marks > new.maximum_marks then
    raise exception 'Passing marks cannot be more than maximum marks';
  end if;
  if (nullif(new.start_time, '') is not null and new.start_time !~ '^([01]\d|2[0-3]):[0-5]\d$')
     or (nullif(new.end_time, '') is not null and new.end_time !~ '^([01]\d|2[0-3]):[0-5]\d$') then
    raise exception 'Times must be in HH:MM format';
  end if;
  new.start_time := nullif(new.start_time, '');
  new.end_time := nullif(new.end_time, '');
  if (new.start_time is null) <> (new.end_time is null) then
    raise exception 'Enter both a start time and an end time';
  end if;
  if new.start_time is not null and new.start_time >= new.end_time then
    raise exception 'End time must be after start time';
  end if;

  select * into v_class from public.classes where id = new.class_id and school_id = new.school_id;
  if not found then
    raise exception 'Class not found';
  end if;
  if v_class.status is distinct from 'ACTIVE' then
    raise exception 'Class % % is inactive and cannot be scheduled', v_class.name, v_class.section;
  end if;
  new.academic_year_id := coalesce(new.academic_year_id, v_class.academic_year_id);
  if new.academic_year_id is distinct from v_class.academic_year_id then
    raise exception 'Class % % belongs to a different academic year', v_class.name, v_class.section;
  end if;

  select * into v_subject from public.subjects where id = new.subject_id and school_id = new.school_id;
  if not found then
    raise exception 'Subject not found';
  end if;
  if v_subject.status is distinct from 'ACTIVE' then
    raise exception '% is inactive and cannot be scheduled', v_subject.name;
  end if;
  if not exists (
    select 1 from public.class_subjects where class_id = new.class_id and subject_id = new.subject_id
  ) then
    raise exception '% is not assigned to Class % %. Assign it under Subjects first',
      v_subject.name, v_class.name, v_class.section;
  end if;

  select * into v_year from public.academic_years where id = new.academic_year_id;
  if found and (new.date < v_year.start_date or new.date > v_year.end_date) then
    raise exception 'Exam date must fall inside the academic year % (% to %)', v_year.name,
      to_char(v_year.start_date, 'DD Mon YYYY'), to_char(v_year.end_date, 'DD Mon YYYY');
  end if;

  if new.examination_id is not null then
    if new.date < v_header.start_date or new.date > v_header.end_date then
      raise exception 'Exam date must be between % and % (the examination dates)',
        to_char(v_header.start_date, 'DD Mon YYYY'), to_char(v_header.end_date, 'DD Mon YYYY');
    end if;
    if cardinality(v_header.class_ids) > 0 and not (new.class_id = any (v_header.class_ids)) then
      raise exception 'Class % % is not part of this examination. Add it to the examination first',
        v_class.name, v_class.section;
    end if;
    if exists (
      select 1 from public.exams o
       where o.examination_id = new.examination_id and o.class_id = new.class_id
         and o.subject_id = new.subject_id and o.status <> 'CANCELLED' and o.id <> new.id
    ) then
      raise exception '% is already scheduled for Class % % in this examination',
        v_subject.name, v_class.name, v_class.section;
    end if;
  end if;

  if new.room_id is not null and not exists (
    select 1 from public.rooms where id = new.room_id and school_id = new.school_id
  ) then
    raise exception 'Room does not belong to this school';
  end if;
  if new.invigilator_id is not null and not exists (
    select 1 from public.teachers
     where id = new.invigilator_id and school_id = new.school_id and employment_status <> 'INACTIVE'
  ) then
    raise exception 'Choose an active teacher of this school as invigilator';
  end if;

  -- Time clashes. Papers without times (older schedules) cannot be compared and are skipped.
  if new.start_time is not null then
    select o.subject, o.start_time, o.end_time into v_clash
      from public.exams o
     where o.school_id = new.school_id and o.id <> new.id and o.status <> 'CANCELLED'
       and o.class_id = new.class_id and o.date = new.date
       and o.start_time is not null and o.end_time is not null
       and o.start_time < new.end_time and new.start_time < o.end_time
     limit 1;
    if found then
      raise exception 'Class % % already has % from % to % on this date',
        v_class.name, v_class.section, v_clash.subject, v_clash.start_time, v_clash.end_time;
    end if;

    if new.room_id is not null then
      select o.subject, o.start_time, o.end_time, r.name room_name, c.name class_name,
             c.section class_section
        into v_clash
        from public.exams o
        join public.rooms r on r.id = o.room_id
        join public.classes c on c.id = o.class_id
       where o.school_id = new.school_id and o.id <> new.id and o.status <> 'CANCELLED'
         and o.room_id = new.room_id and o.date = new.date
         and o.start_time is not null and o.end_time is not null
         and o.start_time < new.end_time and new.start_time < o.end_time
       limit 1;
      if found then
        raise exception 'Room % is already booked for Class % % (%) from % to % on this date',
          v_clash.room_name, v_clash.class_name, v_clash.class_section, v_clash.subject,
          v_clash.start_time, v_clash.end_time;
      end if;
    end if;

    if new.invigilator_id is not null then
      select o.subject, o.start_time, o.end_time, t.name teacher_name, c.name class_name,
             c.section class_section
        into v_clash
        from public.exams o
        join public.teachers t on t.id = o.invigilator_id
        join public.classes c on c.id = o.class_id
       where o.school_id = new.school_id and o.id <> new.id and o.status <> 'CANCELLED'
         and o.invigilator_id = new.invigilator_id and o.date = new.date
         and o.start_time is not null and o.end_time is not null
         and o.start_time < new.end_time and new.start_time < o.end_time
       limit 1;
      if found then
        raise exception '% is already invigilating Class % % (%) from % to % on this date',
          v_clash.teacher_name, v_clash.class_name, v_clash.class_section, v_clash.subject,
          v_clash.start_time, v_clash.end_time;
      end if;
    end if;
  end if;

  new.subject := v_subject.name;
  new.term := new.name;
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- 6) Results guard: direct table writes get the same checks as save_exam_marks
-- ============================================================================

create or replace function public.tg_results_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_exam public.exams;
begin
  -- Publishing only stamps published_at; it never changes marks.
  if tg_op = 'UPDATE'
     and (new.exam_id, new.student_id, new.marks, new.attendance_status, new.max_marks)
         is not distinct from
         (old.exam_id, old.student_id, old.marks, old.attendance_status, old.max_marks) then
    return new;
  end if;
  select * into v_exam from public.exams where id = new.exam_id;
  if not found then
    return new;
  end if;
  if new.school_id <> v_exam.school_id or not exists (
    select 1 from public.students
     where id = new.student_id and school_id = v_exam.school_id and class_id = v_exam.class_id
  ) then
    raise exception 'Every student must belong to the exam class and academic year';
  end if;
  if new.attendance_status = 'PRESENT' then
    if new.marks is null or new.marks < 0 or new.marks > v_exam.maximum_marks then
      raise exception 'Marks must be between 0 and %', v_exam.maximum_marks;
    end if;
  elsif new.marks is not null then
    raise exception 'Absent or Not Applicable students cannot have marks';
  end if;
  return new;
end;
$$;

create trigger trg_results_guard
  before insert or update on public.results
  for each row execute function public.tg_results_guard();

-- ============================================================================
-- 7) Helpers used by policies and RPCs
-- ============================================================================

-- Students of the paper's class/year that have neither marks nor an attendance status.
create or replace function public.exam_missing_marks_count(p_exam_id uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int
    from public.exams e
    join public.students s
      on s.school_id = e.school_id and s.class_id = e.class_id
     and s.academic_year_id is not distinct from e.academic_year_id and s.status <> 'Archived'
   where e.id = p_exam_id
     and not exists (select 1 from public.results r where r.exam_id = e.id and r.student_id = s.id)
$$;

-- True when the caller may write marks for this paper right now (same rules as save_exam_marks).
create or replace function public.can_write_exam_marks(p_exam_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.exams e
     where e.id = p_exam_id and e.school_id = public.jwt_school_id()
       and case
         when public.jwt_role() = 'TEACHER' then
           e.status = 'MARKS_ENTRY'
           and (public.is_class_teacher_of(e.class_id) or exists (
             select 1 from public.class_subjects cs
              where cs.class_id = e.class_id and cs.subject_id = e.subject_id
                and cs.teacher_id = public.jwt_linked_teacher_id()
           ))
         else e.status in ('MARKS_ENTRY', 'REVIEW')
       end
  )
$$;

create or replace function public.examination_schedule_published(p_examination_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.examinations
     where id = p_examination_id and schedule_published_at is not null
  )
$$;

-- ============================================================================
-- 8) Marks workflow RPCs
-- ============================================================================

-- Same contract as before. Changes: teachers can no longer edit marks they have submitted
-- (REVIEW), remarks are length-checked, and errors name the student.
create or replace function public.save_exam_marks(p_exam_id uuid, p_entries jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('results.manage');
  v_exam public.exams;
  v_entry jsonb;
  v_student uuid;
  v_student_name text;
  v_state text;
  v_marks numeric;
  v_count int;
begin
  perform public.require_active_school();
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'examId and entries are required';
  end if;
  select * into v_exam from public.exams where id = p_exam_id and school_id = v_school;
  if not found then
    raise exception 'Exam not found';
  end if;
  if v_exam.status not in ('MARKS_ENTRY', 'REVIEW') then
    raise exception 'Exam is not open for marks entry';
  end if;
  if (select public.jwt_role()) = 'TEACHER' then
    if not public.is_class_teacher_of(v_exam.class_id)
       and not exists (
         select 1 from public.class_subjects
          where class_id = v_exam.class_id and subject_id = v_exam.subject_id
            and teacher_id = public.jwt_linked_teacher_id()
       ) then
      raise exception 'Not assigned to this class and subject' using errcode = '42501';
    end if;
    if v_exam.status <> 'MARKS_ENTRY' then
      raise exception 'These marks have been submitted for review and are locked. Ask the School Admin to return them if a correction is needed';
    end if;
  end if;

  select count(*) into v_count from (
    select e ->> 'studentId' from jsonb_array_elements(p_entries) e group by 1 having count(*) > 1
  ) d;
  if v_count > 0 then
    raise exception 'Duplicate student entry';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    if coalesce(v_entry ->> 'studentId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Every student must belong to the exam class and academic year';
    end if;
    v_student := (v_entry ->> 'studentId')::uuid;
    select name into v_student_name from public.students
     where id = v_student and school_id = v_school and class_id = v_exam.class_id
       and academic_year_id is not distinct from v_exam.academic_year_id and status <> 'Archived';
    if not found then
      raise exception 'Every student must belong to the exam class and academic year';
    end if;

    v_state := coalesce(v_entry ->> 'attendanceStatus', 'PRESENT');
    v_marks := null;
    if v_state = 'PRESENT' then
      if jsonb_typeof(v_entry -> 'marks') is distinct from 'number' then
        raise exception 'Enter marks for % or mark them Absent / Not Applicable', v_student_name;
      end if;
      v_marks := (v_entry ->> 'marks')::numeric;
      if v_marks < 0 or v_marks > v_exam.maximum_marks then
        raise exception 'Marks for % must be between 0 and %', v_student_name, v_exam.maximum_marks;
      end if;
    elsif v_state not in ('ABSENT', 'NOT_APPLICABLE') then
      raise exception 'Invalid marks or attendance status';
    end if;
    if length(v_entry ->> 'remarks') > 300 then
      raise exception 'Remarks for % must be 300 characters or less', v_student_name;
    end if;

    insert into public.results (school_id, student_id, exam_id, marks, max_marks, grade,
                                attendance_status, remarks, entered_by)
    values (v_school, v_student, p_exam_id, v_marks, v_exam.maximum_marks,
            case v_state when 'NOT_APPLICABLE' then null when 'ABSENT' then 'F'
              else public.grade_for_percentage(v_marks / v_exam.maximum_marks * 100) end,
            v_state, nullif(v_entry ->> 'remarks', ''), (select auth.uid()))
    on conflict (exam_id, student_id) where exam_id is not null do update set
      marks = excluded.marks, max_marks = excluded.max_marks, grade = excluded.grade,
      attendance_status = excluded.attendance_status, remarks = excluded.remarks,
      entered_by = excluded.entered_by;
  end loop;

  perform public.log_audit('results.marks_saved', p_exam_id::text,
    json_build_object('count', jsonb_array_length(p_entries))::text);
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(p_entries));
end;
$$;

create or replace function public.submit_exam_marks(p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('results.manage');
  v_exam public.exams;
  v_missing int;
begin
  perform public.require_active_school();
  select * into v_exam from public.exams where id = p_exam_id and school_id = v_school for update;
  if not found then
    raise exception 'Exam not found';
  end if;
  if (select public.jwt_role()) = 'TEACHER'
     and not public.is_class_teacher_of(v_exam.class_id)
     and not exists (
       select 1 from public.class_subjects
        where class_id = v_exam.class_id and subject_id = v_exam.subject_id
          and teacher_id = public.jwt_linked_teacher_id()
     ) then
    raise exception 'Not assigned to this class and subject' using errcode = '42501';
  end if;
  if v_exam.status <> 'MARKS_ENTRY' then
    raise exception 'Marks can only be submitted while the paper is open for marks entry';
  end if;
  v_missing := public.exam_missing_marks_count(p_exam_id);
  if v_missing > 0 then
    raise exception '% student(s) have no marks yet. Enter their marks or mark them Absent / Not Applicable before submitting', v_missing;
  end if;

  perform set_config('app.submitting_exam', p_exam_id::text, true);
  update public.exams
     set status = 'REVIEW', submitted_at = now(), submitted_by = (select auth.uid()), review_note = null
   where id = p_exam_id;
  perform set_config('app.submitting_exam', '', true);

  perform public.log_audit('results.submitted', p_exam_id::text, null);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.return_exam_marks(p_exam_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('results.publish');
  v_exam public.exams;
  v_note text := nullif(trim(p_note), '');
begin
  perform public.require_active_school();
  if (select public.jwt_role()) = 'TEACHER' then
    raise exception 'Only school administration can review marks' using errcode = '42501';
  end if;
  select * into v_exam from public.exams where id = p_exam_id and school_id = v_school for update;
  if not found then
    raise exception 'Exam not found';
  end if;
  if v_exam.status <> 'REVIEW' then
    raise exception 'Only marks that are under review can be returned';
  end if;
  if length(v_note) > 500 then
    raise exception 'Review comment must be 500 characters or less';
  end if;

  update public.exams set status = 'MARKS_ENTRY', review_note = v_note where id = p_exam_id;

  if v_exam.submitted_by is not null then
    perform public.notify_user(v_exam.submitted_by, 'Results', 'Marks returned for correction',
      coalesce(v_exam.subject, 'Exam') || ' — ' || v_exam.name || coalesce(': ' || v_note, ''));
  end if;
  perform public.log_audit('results.returned', p_exam_id::text, v_note);
  return jsonb_build_object('ok', true);
end;
$$;

-- Same as before, plus: needs results.publish, every student must have marks or an
-- attendance status, and the paper records who published it and when.
create or replace function public.publish_exam_results(p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.require_school_permission('results.publish');
  v_exam public.exams;
  v_count int;
  v_missing int;
begin
  perform public.require_active_school();
  select * into v_exam from public.exams where id = p_exam_id and school_id = v_school for update;
  if not found then
    raise exception 'Exam not found';
  end if;
  if (select public.jwt_role()) = 'TEACHER' then
    raise exception 'Only school administration can publish results' using errcode = '42501';
  end if;
  if v_exam.status <> 'REVIEW' then
    raise exception 'Exam must be in REVIEW before publication';
  end if;
  select count(*) into v_count from public.results where exam_id = p_exam_id;
  if v_count = 0 then
    raise exception 'Cannot publish an exam without marks';
  end if;
  v_missing := public.exam_missing_marks_count(p_exam_id);
  if v_missing > 0 then
    raise exception '% student(s) have no marks yet. Return the paper for correction or enter the missing marks first', v_missing;
  end if;

  perform set_config('app.publishing_exam', p_exam_id::text, true);
  update public.results set published_at = now() where exam_id = p_exam_id;
  update public.exams
     set status = 'PUBLISHED', published_at = now(), published_by = (select auth.uid())
   where id = p_exam_id;
  perform set_config('app.publishing_exam', '', true);

  perform public.notify_user(up.id, 'Results', 'Result published',
    'A new exam result has been published for you.')
  from public.results r
  join public.user_profiles up on up.linked_student_id = r.student_id
  where r.exam_id = p_exam_id;

  perform public.log_audit('results.published', p_exam_id::text, json_build_object('count', v_count)::text);
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

revoke execute on function public.exam_missing_marks_count(uuid) from public, anon, authenticated;
revoke execute on function public.can_write_exam_marks(uuid) from public, anon;
revoke execute on function public.examination_schedule_published(uuid) from public, anon;
revoke execute on function public.submit_exam_marks(uuid) from public, anon;
revoke execute on function public.return_exam_marks(uuid, text) from public, anon;
grant execute on function public.can_write_exam_marks(uuid) to authenticated, service_role;
grant execute on function public.examination_schedule_published(uuid) to authenticated, service_role;
grant execute on function public.submit_exam_marks(uuid) to authenticated, service_role;
grant execute on function public.return_exam_marks(uuid, text) to authenticated, service_role;

-- ============================================================================
-- 9) Row-level security
-- ============================================================================

alter table public.examinations enable row level security;

create policy "examinations_select" on public.examinations for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('exams.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or (
      (select public.jwt_role()) in ('PARENT', 'STUDENT')
      and exists (
        select 1 from public.students s
         where s.id in (select public.current_owned_student_ids())
           and (cardinality(examinations.class_ids) = 0 or s.class_id = any (examinations.class_ids))
      )
      and (
        schedule_published_at is not null
        or exists (
          select 1 from public.exams e
           where e.examination_id = examinations.id and e.status not in ('DRAFT', 'CANCELLED')
        )
      )
    )
  )
);
create policy "examinations_write" on public.examinations for all to authenticated using (
  school_id = (select public.jwt_school_id()) and (select public.has_permission('exams.manage'))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('exams.manage'))
);

-- Students/parents also see draft papers once the examination's schedule is published.
drop policy if exists "exams_select" on public.exams;
create policy "exams_select" on public.exams for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('exams.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and class_id in (select public.current_teacher_class_ids()))
    or (
      (select public.jwt_role()) in ('PARENT', 'STUDENT')
      and (
        status not in ('DRAFT', 'CANCELLED')
        or (status = 'DRAFT' and public.examination_schedule_published(examination_id))
      )
      and exists (
        select 1 from public.students s
         where s.class_id = exams.class_id and s.id in (select public.current_owned_student_ids())
      )
    )
  )
);

-- Teachers read results of the classes they teach only (was: the whole school).
drop policy if exists "results_select" on public.results;
create policy "results_select" on public.results for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('results.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or (
      (select public.jwt_role()) = 'TEACHER'
      and exists (
        select 1 from public.exams e
         where e.id = results.exam_id and e.class_id in (select public.current_teacher_class_ids())
      )
    )
    or (
      (select public.jwt_role()) in ('PARENT', 'STUDENT')
      and student_id in (select public.current_owned_student_ids())
      and public.exam_is_published(exam_id)
    )
  )
);

-- Direct writes follow the same rules as save_exam_marks: an open paper, and for teachers
-- only while it is in MARKS_ENTRY and they teach that subject or are the Class Teacher.
drop policy if exists "results_insert" on public.results;
create policy "results_insert" on public.results for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('results.manage'))
  and public.can_write_exam_marks(exam_id)
);
drop policy if exists "results_update" on public.results;
create policy "results_update" on public.results for update to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('results.manage'))
  and public.can_write_exam_marks(exam_id)
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and public.can_write_exam_marks(exam_id)
);
