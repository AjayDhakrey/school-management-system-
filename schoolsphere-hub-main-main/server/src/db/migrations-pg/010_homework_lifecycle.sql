-- Step 12: authoritative subject linkage + assignment date + audit timestamps for
-- homework, mirroring the subject_id/created_at/updated_at treatment exams got in 008.
-- homework.subject stays as-is (display text, matches the already-shipped Teacher/Admin
-- UI contract) — subject_id is resolved and backfilled alongside it, additive only.

ALTER TABLE homework ADD COLUMN IF NOT EXISTS subject_id text REFERENCES subjects(id);
ALTER TABLE homework ADD COLUMN IF NOT EXISTS assigned_date text;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE homework ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();

UPDATE homework h SET subject_id = s.id FROM subjects s
  WHERE h.school_id = s.school_id AND lower(h.subject) = lower(s.name) AND h.subject_id IS NULL;

-- Historical rows never recorded an assignment date; due_date is the closest honest
-- stand-in (also guarantees assigned_date <= due_date for existing data).
UPDATE homework SET assigned_date = COALESCE(due_date, to_char(current_date, 'YYYY-MM-DD'))
  WHERE assigned_date IS NULL;

ALTER TABLE homework ALTER COLUMN assigned_date SET NOT NULL;
ALTER TABLE homework ALTER COLUMN assigned_date SET DEFAULT to_char(current_date, 'YYYY-MM-DD');

ALTER TABLE homework_submissions ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();

ALTER TABLE homework_submissions ADD CONSTRAINT homework_submissions_status_check
  CHECK (status IN ('Submitted','Late','Reviewed'));

CREATE INDEX IF NOT EXISTS idx_homework_school_class ON homework(school_id, class_id, due_date);
CREATE INDEX IF NOT EXISTS idx_homework_teacher       ON homework(teacher_id);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_homework ON homework_submissions(school_id, homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_student  ON homework_submissions(school_id, student_id);
