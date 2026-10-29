-- ROLLBACK for 54_exam_scheduling.sql (emergency use only).
-- Restores the pre-54 functions/policies captured from production on 2026-09-23 and removes
-- the new objects. Examination headers and new paper columns are dropped; papers and marks stay.
begin;
set local lock_timeout = '5s';

drop trigger if exists trg_results_guard on public.results;
drop trigger if exists trg_examinations_sync_papers on public.examinations;
drop trigger if exists trg_examinations_guard on public.examinations;

CREATE OR REPLACE FUNCTION public.tg_exams_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_class public.classes;
  v_subject_name text;
  v_allowed text[];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' or exists (select 1 from public.results where exam_id = old.id) then
      raise exception 'Only an unused draft exam can be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
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
        new.start_time, new.end_time, new.maximum_marks, new.passing_marks, new.room_id)
       is not distinct from
       (old.academic_year_id, old.class_id, old.subject_id, old.name, old.exam_type, old.date,
        old.start_time, old.end_time, old.maximum_marks, old.passing_marks, old.room_id) then
      new.updated_at := now();
      return new;
    end if;
    if old.status <> 'DRAFT' then
      raise exception 'Schedule can only be edited while draft';
    end if;
  else
    new.status := 'DRAFT';
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  end if;

  new.name := trim(new.name);
  if new.name is null or new.name = '' or new.date is null
     or new.exam_type is null or new.exam_type not in ('Unit Test', 'Monthly Test', 'Mid-Term', 'Half-Yearly', 'Final', 'Other')
     or new.maximum_marks is null or new.maximum_marks <= 0
     or new.passing_marks is null or new.passing_marks < 0 or new.passing_marks > new.maximum_marks
     or (nullif(new.start_time, '') is not null and new.start_time !~ '^([01]\d|2[0-3]):[0-5]\d$')
     or (nullif(new.end_time, '') is not null and new.end_time !~ '^([01]\d|2[0-3]):[0-5]\d$') then
    raise exception 'Invalid exam values';
  end if;
  new.start_time := nullif(new.start_time, '');
  new.end_time := nullif(new.end_time, '');
  if new.start_time is not null and new.end_time is not null and new.start_time >= new.end_time then
    raise exception 'End time must be after start time';
  end if;

  select * into v_class from public.classes where id = new.class_id and school_id = new.school_id;
  new.academic_year_id := coalesce(new.academic_year_id, v_class.academic_year_id);
  select s.name into v_subject_name
    from public.subjects s
    join public.class_subjects cs on cs.subject_id = s.id and cs.class_id = new.class_id
    where s.id = new.subject_id and s.school_id = new.school_id;
  if v_class.id is null or v_subject_name is null
     or new.academic_year_id is distinct from v_class.academic_year_id then
    raise exception 'Class, academic year and subject must be an assigned same-school relationship';
  end if;
  if new.room_id is not null and not exists (
    select 1 from public.rooms where id = new.room_id and school_id = new.school_id
  ) then
    raise exception 'Room does not belong to this school';
  end if;
  new.subject := v_subject_name;
  new.term := new.name;
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_exam_marks(p_exam_id uuid, p_entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_school text := public.require_school_permission('results.manage');
  v_exam public.exams;
  v_entry jsonb;
  v_student uuid;
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
  if (select public.jwt_role()) = 'TEACHER'
     and not public.is_class_teacher_of(v_exam.class_id)
     and not exists (
       select 1 from public.class_subjects
       where class_id = v_exam.class_id and subject_id = v_exam.subject_id
         and teacher_id = public.jwt_linked_teacher_id()
     ) then
    raise exception 'Not assigned to this class and subject' using errcode = '42501';
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
    if not exists (
      select 1 from public.students
      where id = v_student and school_id = v_school and class_id = v_exam.class_id
        and academic_year_id is not distinct from v_exam.academic_year_id and status <> 'Archived'
    ) then
      raise exception 'Every student must belong to the exam class and academic year';
    end if;

    v_state := coalesce(v_entry ->> 'attendanceStatus', 'PRESENT');
    v_marks := null;
    if v_state = 'PRESENT' then
      if jsonb_typeof(v_entry -> 'marks') is distinct from 'number' then
        raise exception 'Invalid marks or attendance status';
      end if;
      v_marks := (v_entry ->> 'marks')::numeric;
      if v_marks < 0 or v_marks > v_exam.maximum_marks then
        raise exception 'Invalid marks or attendance status';
      end if;
    elsif v_state not in ('ABSENT', 'NOT_APPLICABLE') then
      raise exception 'Invalid marks or attendance status';
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
$function$;

CREATE OR REPLACE FUNCTION public.publish_exam_results(p_exam_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_school text := public.require_school_permission('results.manage');
  v_exam public.exams;
  v_count int;
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

  perform set_config('app.publishing_exam', p_exam_id::text, true);
  update public.results set published_at = now() where exam_id = p_exam_id;
  update public.exams set status = 'PUBLISHED' where id = p_exam_id;
  perform set_config('app.publishing_exam', '', true);

  perform public.notify_user(up.id, 'Results', 'Result published',
    'A new exam result has been published for you.')
  from public.results r
  join public.user_profiles up on up.linked_student_id = r.student_id
  where r.exam_id = p_exam_id;

  perform public.log_audit('results.published', p_exam_id::text, json_build_object('count', v_count)::text);
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$function$;

drop policy if exists "exams_select" on public.exams;
create policy "exams_select" on public.exams for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('exams.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF')
    or ((select public.jwt_role()) = 'TEACHER' and class_id in (select public.current_teacher_class_ids()))
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT')
        and status not in ('DRAFT', 'CANCELLED')
        and exists (select 1 from public.students s
                     where s.class_id = exams.class_id and s.id in (select public.current_owned_student_ids())))
  )
);
drop policy if exists "results_select" on public.results;
create policy "results_select" on public.results for select to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('results.view'))
  and (
    (select public.jwt_role()) in ('SCHOOL_ADMIN', 'STAFF', 'TEACHER')
    or ((select public.jwt_role()) in ('PARENT', 'STUDENT')
        and student_id in (select public.current_owned_student_ids())
        and public.exam_is_published(exam_id))
  )
);
drop policy if exists "results_insert" on public.results;
create policy "results_insert" on public.results for insert to authenticated with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
  and (select public.has_permission('results.manage'))
  and ((select public.jwt_role()) <> 'TEACHER'
       or exists (select 1 from public.exams e where e.id = results.exam_id and public.is_class_teacher_of(e.class_id)))
);
drop policy if exists "results_update" on public.results;
create policy "results_update" on public.results for update to authenticated using (
  school_id = (select public.jwt_school_id())
  and (select public.has_permission('results.manage'))
  and ((select public.jwt_role()) <> 'TEACHER'
       or exists (select 1 from public.exams e where e.id = results.exam_id and public.is_class_teacher_of(e.class_id)))
) with check (
  school_id = (select public.jwt_school_id()) and (select public.school_is_active())
);

drop function if exists public.submit_exam_marks(uuid);
drop function if exists public.return_exam_marks(uuid, text);
drop function if exists public.can_write_exam_marks(uuid);
drop function if exists public.examination_schedule_published(uuid);
drop function if exists public.exam_missing_marks_count(uuid);
drop function if exists public.tg_results_guard();
drop function if exists public.tg_examinations_sync_papers();
drop function if exists public.tg_examinations_guard();

drop policy if exists "examinations_select" on public.examinations;
drop policy if exists "examinations_write" on public.examinations;
alter table public.exams drop constraint if exists exams_examination_id_fkey;
drop table if exists public.examinations;
drop index if exists public.idx_results_exam;
drop index if exists public.uq_exam_paper;
alter table public.exams
  drop column if exists examination_id,
  drop column if exists invigilator_id,
  drop column if exists review_note,
  drop column if exists submitted_at,
  drop column if exists submitted_by,
  drop column if exists published_at,
  drop column if exists published_by;

-- Exam types added by 54 are folded back to Other before the old list is restored.
update public.exams set exam_type = 'Other'
 where exam_type not in ('Unit Test', 'Monthly Test', 'Mid-Term', 'Half-Yearly', 'Final', 'Other');
alter table public.exams drop constraint if exists exams_type_check;
alter table public.exams add constraint exams_type_check check (exam_type = any (array[
  'Unit Test', 'Monthly Test', 'Mid-Term', 'Half-Yearly', 'Final', 'Other']));
drop function if exists public.exam_type_options();
delete from public.school_role_permissions where permission = 'results.publish';
delete from public.permissions where key = 'results.publish';
delete from supabase_migrations.schema_migrations where version = '54';
commit;
