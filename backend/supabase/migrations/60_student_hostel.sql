-- ============================================================================
-- Student accommodation: day scholar vs hosteller, plus the hostel room/block.
-- Hostel-category fees are billed only to hostellers (see GenerateFeesDialog in
-- src/app/fee-structure.tsx). Both columns default to "day scholar", so existing
-- rows and code paths are unaffected.
-- ============================================================================
alter table public.students
  add column if not exists is_hosteller boolean not null default false,
  add column if not exists hostel_room text;

-- Let PostgREST see the new columns straight away.
notify pgrst, 'reload schema';
