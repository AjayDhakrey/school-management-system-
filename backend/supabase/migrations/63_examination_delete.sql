-- ============================================================================
-- Delete an examination completely: its papers, their marks, then the exam itself.
--
-- The guards from 54_exam_scheduling.sql refuse to delete an examination that still has papers,
-- and refuse to delete a paper that isn't an unused draft. That keeps records safe from
-- accidental deletes, but left School Admins no way to remove an exam at all.
--
-- delete_examination(p_examination_id) is the one deliberate way to do it. It sets a
-- transaction-local flag that the delete guards below honour; every other delete keeps the
-- original rules.
-- ============================================================================

-- Delete guards, split out of the insert/update guards so the flag can be checked.
create or replace function public.tg_examinations_delete_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.deleting_examination', true), '') = old.id::text then
    return old;
  end if;
  if exists (select 1 from public.exams where examination_id = old.id) then
    raise exception 'This examination still has papers. Delete its draft papers first — examinations with marks or cancelled papers are kept for the record';
  end if;
  return old;
end;
$$;

create or replace function public.tg_exams_delete_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.examination_id is not null
     and coalesce(current_setting('app.deleting_examination', true), '') = old.examination_id::text then
    return old;
  end if;
  if old.status <> 'DRAFT' or exists (select 1 from public.results where exam_id = old.id) then
    raise exception 'Only an unused draft exam can be deleted';
  end if;
  return old;
end;
$$;

-- Re-point the existing guard triggers at insert/update only, and add the delete guards.
do $$
declare
  t record;
begin
  for t in
    select tg.tgname, c.relname
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and not tg.tgisinternal
       and tg.tgfoid in ('public.tg_examinations_guard'::regproc, 'public.tg_exams_guard'::regproc)
  loop
    execute format('drop trigger %I on public.%I', t.tgname, t.relname);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.%I()',
      t.tgname,
      t.relname,
      case when t.relname = 'examinations' then 'tg_examinations_guard' else 'tg_exams_guard' end
    );
  end loop;
end;
$$;

drop trigger if exists trg_examinations_delete_guard on public.examinations;
create trigger trg_examinations_delete_guard
  before delete on public.examinations
  for each row execute function public.tg_examinations_delete_guard();

drop trigger if exists trg_exams_delete_guard on public.exams;
create trigger trg_exams_delete_guard
  before delete on public.exams
  for each row execute function public.tg_exams_delete_guard();

-- The deliberate, complete delete.
create or replace function public.delete_examination(p_examination_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_school text := public.jwt_school_id();
begin
  if v_school is null or not (select public.has_permission('exams.manage')) then
    raise exception 'You do not have permission to delete examinations' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.examinations where id = p_examination_id and school_id = v_school
  ) then
    raise exception 'Examination not found';
  end if;

  perform set_config('app.deleting_examination', p_examination_id::text, true);

  -- Repeat exams (Re-Test / Compartment) that point at this one just lose the link.
  update public.examinations set based_on_examination_id = null
   where based_on_examination_id = p_examination_id;
  -- Marks go with their papers (results.exam_id cascades), then the exam itself.
  delete from public.exams where examination_id = p_examination_id;
  delete from public.examinations where id = p_examination_id;

  perform set_config('app.deleting_examination', '', true);
end;
$$;

revoke all on function public.delete_examination(uuid) from public;
grant execute on function public.delete_examination(uuid) to authenticated;

notify pgrst, 'reload schema';
