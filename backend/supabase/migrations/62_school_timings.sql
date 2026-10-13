-- ============================================================================
-- School timings: the working days and each period's start / end time, edited
-- from School Settings → School Timings (and the Timetable page). Stored as
--   { "days": ["Monday", …], "periods": [{ "start": "08:15", "end": "09:00" }, …] }
-- with 24-hour times; period N is the Nth entry. Null means the app's defaults.
-- ============================================================================
alter table public.schools
  add column if not exists timings jsonb;

-- Let PostgREST see the new column straight away.
notify pgrst, 'reload schema';
