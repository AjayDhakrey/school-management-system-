-- Replaces parents.linked_student_ids (a JSON array in the original schema) with a proper
-- many-to-many join table. students.parent_id stays as a denormalized "primary guardian"
-- pointer for the UI, kept in sync by the trigger below (mirrors today's syncParentLink()).
create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (student_id, parent_id)
);
create index idx_student_guardians_school on public.student_guardians (school_id);
create index idx_student_guardians_parent on public.student_guardians (parent_id, student_id);
create index idx_student_guardians_student on public.student_guardians (student_id);

create or replace function public.sync_primary_guardian()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update public.students
      set parent_id = (
        select parent_id from public.student_guardians
        where student_id = old.student_id and id <> old.id
        order by is_primary desc, created_at
        limit 1
      )
      where id = old.student_id;
    return old;
  end if;

  if new.is_primary then
    update public.student_guardians set is_primary = false
      where student_id = new.student_id and id <> new.id;
    update public.students set parent_id = new.parent_id where id = new.student_id;
  elsif not exists (
    select 1 from public.students where id = new.student_id and parent_id is not null
  ) then
    update public.students set parent_id = new.parent_id where id = new.student_id;
  end if;
  return new;
end;
$$;

create trigger trg_sync_primary_guardian
  after insert or update of is_primary or delete on public.student_guardians
  for each row execute function public.sync_primary_guardian();
