-- Read-only diagnostic: verifies every public table + RPC + storage bucket from migrations
-- 01-28 actually exists, has RLS wired up, has the GRANTs the app roles need (RLS alone does
-- nothing without an underlying GRANT), and is genuinely queryable. Safe to re-run any time,
-- including as part of `supabase db reset` — it only reads and uses a session-local temp table.
-- Run in the Supabase SQL editor or `psql` and read each result set; nothing here fails the
-- migration on its own so a broken row doesn't block the rest of the chain.

-- 1) Tables: RLS status, policy count, primary key present
with tbl as (
  select
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count,
    exists (
      select 1 from pg_constraint pk where pk.conrelid = c.oid and pk.contype = 'p'
    ) as has_primary_key,
    case
      when not c.relrowsecurity then 'RLS DISABLED'
      when c.relrowsecurity and (select count(*) from pg_policy p where p.polrelid = c.oid) = 0
        then 'RLS ON, NO POLICIES (locked out)'
      else 'ok'
    end as status
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
)
select * from tbl order by (status <> 'ok') desc, table_name;

-- 2) Commands: does each role actually have the GRANT for the SQL command it needs?
-- (a "working" RLS policy still gets "permission denied for table" without this)
select
  table_name,
  bool_or(grantee = 'anon' and privilege_type = 'SELECT') as anon_select,
  bool_or(grantee = 'authenticated' and privilege_type = 'SELECT') as auth_select,
  bool_or(grantee = 'authenticated' and privilege_type = 'INSERT') as auth_insert,
  bool_or(grantee = 'authenticated' and privilege_type = 'UPDATE') as auth_update,
  bool_or(grantee = 'authenticated' and privilege_type = 'DELETE') as auth_delete
from information_schema.role_table_grants
where table_schema = 'public'
group by table_name
order by table_name;

-- 3) RPCs (27_rpc_functions.sql): security mode + can `authenticated` actually call it
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security,
  exists (
    select 1 from information_schema.routine_privileges rp
    where rp.specific_schema = 'public' and rp.routine_name = p.proname
      and rp.grantee = 'authenticated' and rp.privilege_type = 'EXECUTE'
  ) as authenticated_can_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- 4) Storage buckets (28_storage_buckets.sql)
select id, public, file_size_limit, created_at
from storage.buckets
order by id;

-- 5) Live smoke test: SELECT actually executes against every table (catches broken
-- generated columns, dropped dependencies, etc. that metadata checks above can't see)
do $$
declare
  r record;
  err text;
begin
  create temp table if not exists table_smoke_test (table_name text, status text, detail text);
  truncate table_smoke_test;

  for r in
    select c.relname as table_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    begin
      execute format('select 1 from public.%I limit 1', r.table_name);
      insert into table_smoke_test values (r.table_name, 'PASS', null);
    exception when others then
      get stacked diagnostics err = message_text;
      insert into table_smoke_test values (r.table_name, 'FAIL', err);
    end;
  end loop;
end $$;

select * from table_smoke_test order by (status = 'FAIL') desc, table_name;
