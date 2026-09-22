-- Integrity and lookup protection for the backend-completion modules.
-- Historical migrations 001-011 remain unchanged.

CREATE UNIQUE INDEX IF NOT EXISTS ux_library_one_active_issue_per_book
  ON library_records (book_id)
  WHERE returned_on IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicles_school_number
  ON vehicles (school_id, lower(number))
  WHERE number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_holidays_school_date_name
  ON holidays (school_id, date, lower(name));

CREATE INDEX IF NOT EXISTS ix_library_books_school_status
  ON library_books (school_id, status);
CREATE INDEX IF NOT EXISTS ix_library_records_school_student
  ON library_records (school_id, student_id, issued_on DESC);
CREATE INDEX IF NOT EXISTS ix_leave_requests_school_requester
  ON leave_requests (school_id, requester_type, requester_id, from_date DESC);
CREATE INDEX IF NOT EXISTS ix_notices_school_date
  ON notices (school_id, date DESC);
CREATE INDEX IF NOT EXISTS ix_notifications_user_created
  ON notifications (school_id, user_id, created_at DESC);

DO $$ BEGIN
  ALTER TABLE vehicles ADD CONSTRAINT vehicles_capacity_valid CHECK (capacity BETWEEN 1 AND 500) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE vehicles ADD CONSTRAINT vehicles_status_valid CHECK (status IN ('On Route', 'Idle', 'Maintenance')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leave_requests ADD CONSTRAINT leave_request_dates_valid CHECK (from_date IS NOT NULL AND to_date IS NOT NULL AND from_date <= to_date) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leave_requests ADD CONSTRAINT leave_request_status_valid CHECK (status IN ('Pending', 'Approved', 'Rejected')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
