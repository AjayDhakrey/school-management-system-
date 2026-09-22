-- ============================================================================
-- Admissions stage state-machine + status-history triggers.
--
-- Express did this in application code (server/src/routes/admissions.ts):
--   - NEXT_STAGES guarded which transitions are legal
--   - recordHistory() wrote an admission_status_history row on create + every move
-- Under RLS-only writes the client just does admissions.insert() / .update({stage}),
-- and these triggers enforce the machine and append history.
-- ============================================================================

-- Legal transitions, verbatim from admissions.ts NEXT_STAGES. CONVERTED is only
-- reachable via convert_admission() (27_rpc_functions.sql), which itself checks
-- the source stage is APPROVED — so it's allowed here from any stage and the RPC
-- is the gate.
create or replace function public.tg_admissions_validate_stage()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_allowed text[];
begin
  if new.stage = old.stage then
    return new;
  end if;
  if old.stage = 'CONVERTED' then
    raise exception 'Converted applications can no longer change stage';
  end if;
  if new.stage = 'CONVERTED' then
    return new;  -- convert_admission() is the gate
  end if;

  v_allowed := case old.stage::text
    when 'ENQUIRY'               then array['APPLICATION','REJECTED']
    when 'APPLICATION'           then array['DOCUMENT_VERIFICATION','REJECTED']
    when 'DOCUMENT_VERIFICATION' then array['UNDER_REVIEW','APPLICATION','REJECTED']
    when 'UNDER_REVIEW'          then array['APPROVED','REJECTED','WAITLISTED','DOCUMENT_VERIFICATION']
    when 'WAITLISTED'            then array['UNDER_REVIEW','APPROVED','REJECTED']
    when 'APPROVED'              then array['REJECTED']
    when 'REJECTED'              then array['UNDER_REVIEW']
    else array[]::text[]
  end;

  if not (new.stage::text = any(v_allowed)) then
    raise exception 'Cannot move admission from % to %', old.stage, new.stage;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create or replace trigger trg_admissions_validate_stage
  before update of stage on public.admissions
  for each row execute function public.tg_admissions_validate_stage();

-- History: one row on create, one on every stage move. actor name denormalised
-- at write time, like recordHistory().
create or replace function public.tg_admissions_history()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text;
begin
  select name into v_name from public.user_profiles where id = (select auth.uid());
  if tg_op = 'INSERT' then
    insert into public.admission_status_history
      (school_id, admission_id, from_stage, to_stage, changed_by, changed_by_name)
    values (new.school_id, new.id, null, new.stage::text, (select auth.uid()), v_name);
  elsif tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    insert into public.admission_status_history
      (school_id, admission_id, from_stage, to_stage, changed_by, changed_by_name)
    values (new.school_id, new.id, old.stage::text, new.stage::text, (select auth.uid()), v_name);
  end if;
  return null;
exception when others then
  return null;
end;
$$;
create or replace trigger trg_admissions_history
  after insert or update of stage on public.admissions
  for each row execute function public.tg_admissions_history();
