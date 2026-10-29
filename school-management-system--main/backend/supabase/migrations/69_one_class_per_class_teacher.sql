-- ============================================================================
-- A teacher can be Class Teacher of one class section only.
-- Archived sections don't count, so an old class never blocks a new assignment.
-- (Existing duplicates must be cleared before this runs.)
-- ============================================================================
create unique index if not exists uq_classes_one_class_teacher
  on public.classes (class_teacher_id)
  where class_teacher_id is not null and status <> 'ARCHIVED';
