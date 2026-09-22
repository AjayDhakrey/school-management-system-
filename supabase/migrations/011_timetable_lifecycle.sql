-- Step 13: authoritative subject/room linkage + audit timestamps + conflict-prevention
-- for timetable_slots, mirroring the subject_id treatment homework got in 010.
-- subject/room stay as-is (display text, matches the already-shipped Admin/Teacher UI
-- contract) — subject_id/room_id are resolved and backfilled alongside them, additive only.

ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS subject_id text REFERENCES subjects(id);
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS room_id text REFERENCES rooms(id);
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();

UPDATE timetable_slots t SET subject_id = s.id FROM subjects s
  WHERE t.school_id = s.school_id AND lower(t.subject) = lower(s.name) AND t.subject_id IS NULL;

UPDATE timetable_slots t SET room_id = r.id FROM rooms r
  WHERE t.school_id = r.school_id AND lower(t.room) = lower(r.name) AND t.room_id IS NULL;

-- Conflict prevention: the model is period-slot based (not clock-time), so a conflict is an
-- exact (school, day, period) match — atomic partial-unique indexes close the SELECT-then-
-- INSERT race a plain application-level pre-check would leave open. NULL teacher/room/class
-- values (e.g. a school-wide "Break" period) never participate — a period genuinely can be
-- unassigned or shared without being a real double-booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_timetable_class_slot
  ON timetable_slots (school_id, class_id, day, period) WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_timetable_teacher_slot
  ON timetable_slots (school_id, teacher_id, day, period) WHERE teacher_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_timetable_room_slot
  ON timetable_slots (school_id, room_id, day, period) WHERE room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_timetable_school_class ON timetable_slots(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher       ON timetable_slots(teacher_id);
