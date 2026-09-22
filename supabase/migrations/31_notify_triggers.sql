-- ============================================================================
-- Notification fan-out triggers.
--
-- The Express backend fanned notifications out in application code (a loop over
-- users after each insert). Under RLS-only writes the client just does the plain
-- insert/update; these AFTER triggers do the fan-out, calling notify_user()
-- (security definer, best-effort, 27_rpc_functions.sql). Categories / titles /
-- bodies are copied verbatim from server/src/routes/*.ts so the notification
-- centre reads identically.
-- ============================================================================

-- New notice -> every user_profiles row in the school whose role matches the
-- notice audience (All | Teachers | Parents | Students). Mirrors notices.ts:61.
create or replace function public.tg_notify_new_notice()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.notifications (school_id, user_id, category, title, body)
  select new.school_id, up.id, 'Notices', 'New notice', new.title
  from public.user_profiles up
  where up.school_id = new.school_id
    and (
      new.audience = 'All'
      or (new.audience = 'Teachers' and up.role = 'TEACHER')
      or (new.audience = 'Parents'  and up.role = 'PARENT')
      or (new.audience = 'Students' and up.role = 'STUDENT')
    );
  return null;
exception when others then
  return null;
end;
$$;
create or replace trigger trg_notify_new_notice
  after insert on public.notices
  for each row execute function public.tg_notify_new_notice();

-- New homework -> every student login in that class. Mirrors homework.ts:74.
create or replace function public.tg_notify_new_homework()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.notifications (school_id, user_id, category, title, body)
  select new.school_id, up.id, 'Homework', 'New homework assigned', new.title
  from public.students s
  join public.user_profiles up on up.linked_student_id = s.id
  where s.class_id = new.class_id and s.school_id = new.school_id;
  return null;
exception when others then
  return null;
end;
$$;
create or replace trigger trg_notify_new_homework
  after insert on public.homework
  for each row execute function public.tg_notify_new_homework();

-- Result published -> the student's login. Mirrors results.ts:83.
create or replace function public.tg_notify_result_published()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.notify_user(up.id, 'Results', 'Result published',
    'A new exam result has been published for you.')
  from public.user_profiles up
  where up.linked_student_id = new.student_id;
  return null;
exception when others then
  return null;
end;
$$;
create or replace trigger trg_notify_result_published
  after insert on public.results
  for each row execute function public.tg_notify_result_published();

-- Homework submission created -> the homework's teacher login. Mirrors
-- homework-submissions.ts:67. Submission REVIEWED -> the student's login.
-- Mirrors homework-submissions.ts:92.
create or replace function public.tg_notify_submission()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hw public.homework;
begin
  if tg_op = 'INSERT' then
    select * into v_hw from public.homework where id = new.homework_id;
    if v_hw.teacher_id is not null then
      perform public.notify_user(up.id, 'Homework', 'Homework submitted',
        'A student submitted "' || v_hw.title || '"')
      from public.user_profiles up
      where up.linked_teacher_id = v_hw.teacher_id;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'Reviewed' and old.status is distinct from 'Reviewed' then
    perform public.notify_user(up.id, 'Homework', 'Homework reviewed',
      'Your teacher left feedback on your submission.')
    from public.user_profiles up
    where up.linked_student_id = new.student_id;
  end if;
  return null;
exception when others then
  return null;
end;
$$;
create or replace trigger trg_notify_submission
  after insert or update of status on public.homework_submissions
  for each row execute function public.tg_notify_submission();

-- Leave request status changed -> the requester's login. Mirrors leave.ts:153-166:
-- STAFF requester_id IS the user_profiles id; STUDENT/TEACHER requester_id is the
-- domain-row id, resolved through user_profiles.linked_*_id.
create or replace function public.tg_notify_leave_decided()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_body text := 'Your leave request was ' || lower(new.status::text) || '.';
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.requester_type = 'STAFF' then
    v_user := new.requester_id;
  elsif new.requester_type = 'STUDENT' then
    select id into v_user from public.user_profiles where linked_student_id = new.requester_id;
  elsif new.requester_type = 'TEACHER' then
    select id into v_user from public.user_profiles where linked_teacher_id = new.requester_id;
  end if;

  if v_user is not null then
    perform public.notify_user(v_user, 'Leave', 'Leave request updated', v_body);
  end if;
  return null;
exception when others then
  return null;
end;
$$;
create or replace trigger trg_notify_leave_decided
  after update of status on public.leave_requests
  for each row execute function public.tg_notify_leave_decided();
