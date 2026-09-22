-- ============================================================================
-- PostgreSQL baseline schema — the exact end-state of SQLite migrations v1..v5.
--
--   v1 baseline_schema_and_legacy_compatibility
--   v2 academic_structure_foundation
--   v3 student_admission_guardian_integrity
--   v4 teacher_staff_management
--   v5 attendance_integrity_and_context
--
-- The SQLite schema evolved by CREATE TABLE IF NOT EXISTS + incremental
-- ALTER TABLE ADD COLUMN. Postgres gets the collapsed final shape here as one
-- baseline; migrate-pg.ts then seeds schema_migrations with versions 1..5 so the
-- logical history is preserved and nothing re-runs. Future changes are new
-- numbered files (006_*.sql, ...).
--
-- Type mapping decisions (kept deliberately close to the raw-SQL backend):
--   * ids stay `text` — app-generated ('SCH-0001', UUIDs), never serial.
--   * timestamps stay `text` in 'YYYY-MM-DD HH24:MI:SS' UTC — the code compares
--     them as strings (localeCompare, substr, >=). app_now()/app_today() emit
--     the same format SQLite's datetime('now')/date('now') did.
--   * "boolean" columns (is_primary, enabled, read) stay `integer` 0/1 — the
--     code does `=== 1`, `= 0`, `CASE WHEN .. THEN 1 ELSE 0`.
--   * REAL -> double precision.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_now() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') $$;
CREATE OR REPLACE FUNCTION app_today() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') $$;
-- dev-seed only: date('now', '<n> days')
CREATE OR REPLACE FUNCTION app_date_offset(delta text) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT to_char((now() AT TIME ZONE 'UTC')::date + delta::interval, 'YYYY-MM-DD') $$;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    integer PRIMARY KEY,
  name       text NOT NULL,
  applied_at text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS schools (
  id                      text PRIMARY KEY,
  name                    text NOT NULL,
  short_name              text NOT NULL,
  tagline                 text,
  address                 text,
  phone                   text,
  email                   text,
  principal               text,
  session                 text,
  status                  text NOT NULL DEFAULT 'ACTIVE',
  plan                    text NOT NULL DEFAULT 'TRIAL',
  billing_cycle           text DEFAULT 'MONTHLY',
  payment_status          text DEFAULT 'PENDING',
  subscription_started_at text,
  subscription_expires_at text,
  logo_url                text,
  code                    text,
  website                 text,
  board                   text,
  affiliation             text,
  created_at              text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS plans (
  id            text PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  price         double precision NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'MONTHLY',
  status        text NOT NULL DEFAULT 'ACTIVE',
  created_at    text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS academic_years (
  id         text PRIMARY KEY,
  school_id  text NOT NULL REFERENCES schools(id),
  name       text NOT NULL,
  start_date text NOT NULL,
  end_date   text NOT NULL,
  status     text NOT NULL DEFAULT 'DRAFT',
  created_at text NOT NULL DEFAULT app_now(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS rooms (
  id        text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id),
  name      text NOT NULL,
  number    text,
  type      text NOT NULL DEFAULT 'CLASSROOM',
  capacity  integer,
  status    text NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS subjects (
  id          text PRIMARY KEY,
  school_id   text NOT NULL REFERENCES schools(id),
  name        text NOT NULL,
  code        text,
  type        text DEFAULT 'Core',
  credits     double precision DEFAULT 3,
  description text,
  status      text NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS teachers (
  id                text PRIMARY KEY,
  school_id         text NOT NULL REFERENCES schools(id),
  employee_id       text,
  name              text NOT NULL,
  department        text,
  designation       text,
  email             text,
  phone             text,
  photo_url         text,
  joining_date      text,
  assigned_classes  text NOT NULL DEFAULT '[]',
  assigned_subjects text NOT NULL DEFAULT '[]',
  employment_status text NOT NULL DEFAULT 'ACTIVE',
  created_at        text NOT NULL DEFAULT app_now(),
  updated_at        text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS parents (
  id                 text PRIMARY KEY,
  school_id          text NOT NULL REFERENCES schools(id),
  name               text NOT NULL,
  email              text,
  phone              text,
  linked_student_ids text NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS vehicles (
  id           text PRIMARY KEY,
  school_id    text NOT NULL REFERENCES schools(id),
  number       text,
  route        text,
  driver       text,
  driver_phone text,
  pickup_time  text,
  drop_time    text,
  capacity     integer NOT NULL DEFAULT 40,
  status       text NOT NULL DEFAULT 'Idle',
  stops        text NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS classes (
  id               text PRIMARY KEY,
  school_id        text NOT NULL REFERENCES schools(id),
  name             text NOT NULL,
  section          text NOT NULL,
  class_teacher_id text REFERENCES teachers(id),
  academic_year_id text REFERENCES academic_years(id),
  room_id          text REFERENCES rooms(id),
  status           text NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS users (
  id                text PRIMARY KEY,
  school_id         text REFERENCES schools(id),        -- NULL for SUPER_ADMIN
  role              text NOT NULL,
  department        text,
  name              text NOT NULL,
  email             text NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  status            text NOT NULL DEFAULT 'ACTIVE',
  linked_teacher_id text,
  linked_parent_id  text,
  linked_student_id text,
  linked_staff_id   text,
  created_at        text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS staff (
  id                text PRIMARY KEY,
  school_id         text NOT NULL REFERENCES schools(id),
  employee_id       text,
  name              text NOT NULL,
  department        text,
  designation       text,
  email             text,
  phone             text,
  employment_status text NOT NULL DEFAULT 'ACTIVE',
  joining_date      text,
  created_at        text NOT NULL DEFAULT app_now(),
  updated_at        text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id         text PRIMARY KEY,
  school_id  text NOT NULL REFERENCES schools(id),
  class_id   text NOT NULL REFERENCES classes(id),
  subject_id text NOT NULL REFERENCES subjects(id),
  teacher_id text REFERENCES teachers(id),
  created_at text NOT NULL DEFAULT app_now(),
  UNIQUE (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS students (
  id               text PRIMARY KEY,
  school_id        text NOT NULL REFERENCES schools(id),
  name             text NOT NULL,
  admission_no     text,
  class_id         text REFERENCES classes(id),
  academic_year_id text REFERENCES academic_years(id),
  class_name       text,
  section          text,
  roll             integer,
  parent_id        text REFERENCES parents(id),
  status           text DEFAULT 'Active',
  attendance       double precision DEFAULT 0,
  fee_status       text DEFAULT 'Pending',
  email            text,
  phone            text,
  dob              text,
  gender           text,
  address          text,
  photo_url        text,
  blood_group      text,
  admitted_on      text,
  previous_school  text,
  vehicle_id       text REFERENCES vehicles(id),
  pickup_point     text,
  drop_point       text,
  created_at       text NOT NULL DEFAULT app_now(),
  updated_at       text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS student_guardians (
  id           text PRIMARY KEY,
  school_id    text NOT NULL REFERENCES schools(id),
  student_id   text NOT NULL REFERENCES students(id),
  parent_id    text NOT NULL REFERENCES parents(id),
  relationship text NOT NULL DEFAULT 'Guardian',
  is_primary   integer NOT NULL DEFAULT 0,
  created_at   text NOT NULL DEFAULT app_now(),
  UNIQUE (student_id, parent_id)
);

CREATE TABLE IF NOT EXISTS admissions (
  id                  text PRIMARY KEY,
  school_id           text NOT NULL REFERENCES schools(id),
  application_no      text,
  applicant           text NOT NULL,
  dob                 text,
  gender              text,
  address             text,
  class_applied       text,
  section_applied     text,
  class_id_applied    text REFERENCES classes(id),
  academic_year_id    text REFERENCES academic_years(id),
  academic_year       text,
  parent_name         text,
  parent_relation     text,
  previous_school     text,
  previous_class      text,
  previous_board      text,
  previous_percentage text,
  applied_on          text,
  status              text DEFAULT 'Pending',
  stage               text NOT NULL DEFAULT 'ENQUIRY',
  contact_email       text,
  contact_phone       text,
  documents           text NOT NULL DEFAULT '[]',
  notes               text,
  admission_no        text,
  converted_student_id text REFERENCES students(id),
  created_by          text,
  created_by_name     text,
  created_at          text NOT NULL DEFAULT app_now(),
  updated_at          text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS admission_documents (
  id              text PRIMARY KEY,
  school_id       text NOT NULL REFERENCES schools(id),
  admission_id    text NOT NULL REFERENCES admissions(id),
  name            text NOT NULL,
  doc_type        text,
  file_data       text,
  file_mime       text,
  status          text NOT NULL DEFAULT 'Pending',
  remarks         text,
  uploaded_by     text,
  uploaded_by_name text,
  uploaded_at     text NOT NULL DEFAULT app_now(),
  verified_by_name text,
  verified_at     text
);

CREATE TABLE IF NOT EXISTS admission_notes (
  id           text PRIMARY KEY,
  school_id    text NOT NULL REFERENCES schools(id),
  admission_id text NOT NULL REFERENCES admissions(id),
  author_id    text,
  author_name  text,
  note         text NOT NULL,
  created_at   text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS admission_status_history (
  id             text PRIMARY KEY,
  school_id      text NOT NULL REFERENCES schools(id),
  admission_id   text NOT NULL REFERENCES admissions(id),
  from_stage     text,
  to_stage       text NOT NULL,
  remarks        text,
  changed_by     text,
  changed_by_name text,
  changed_at     text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id               text PRIMARY KEY,
  school_id        text NOT NULL REFERENCES schools(id),
  student_id       text NOT NULL REFERENCES students(id),
  class_id         text REFERENCES classes(id),
  academic_year_id text,
  date             text NOT NULL,
  status           text NOT NULL,
  remarks          text,
  marked_by        text,
  created_at       text NOT NULL DEFAULT app_now(),
  updated_at       text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS teacher_attendance (
  id         text PRIMARY KEY,
  school_id  text NOT NULL REFERENCES schools(id),
  teacher_id text NOT NULL REFERENCES teachers(id),
  date       text NOT NULL,
  status     text NOT NULL,
  check_in   text,
  check_out  text,
  remarks    text,
  marked_by  text,
  updated_at text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id         text PRIMARY KEY,
  school_id  text NOT NULL REFERENCES schools(id),
  staff_id   text NOT NULL REFERENCES staff(id),
  date       text NOT NULL,
  status     text NOT NULL,
  check_in   text,
  check_out  text,
  remarks    text,
  marked_by  text,
  updated_at text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS fees (
  id          text PRIMARY KEY,
  school_id   text NOT NULL REFERENCES schools(id),
  student_id  text NOT NULL REFERENCES students(id),
  amount      double precision NOT NULL,
  status      text NOT NULL DEFAULT 'Pending',
  due_date    text,
  paid_on     text,
  fee_type    text NOT NULL DEFAULT 'Tuition',
  discount    double precision NOT NULL DEFAULT 0,
  fine        double precision NOT NULL DEFAULT 0,
  receipt_no  text,
  paid_amount double precision NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id        text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id),
  class_id  text REFERENCES classes(id),
  fee_type  text NOT NULL,
  amount    double precision NOT NULL,
  session   text
);

CREATE TABLE IF NOT EXISTS exams (
  id        text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id),
  subject   text,
  class_id  text REFERENCES classes(id),
  date      text,
  status    text DEFAULT 'Scheduled',
  term      text NOT NULL DEFAULT 'Term 1'
);

CREATE TABLE IF NOT EXISTS results (
  id           text PRIMARY KEY,
  school_id    text NOT NULL REFERENCES schools(id),
  student_id   text NOT NULL REFERENCES students(id),
  exam_id      text REFERENCES exams(id),
  marks        double precision,
  grade        text,
  max_marks    double precision NOT NULL DEFAULT 100,
  published_at text NOT NULL DEFAULT '2000-01-01 00:00:00'
);

CREATE TABLE IF NOT EXISTS homework (
  id          text PRIMARY KEY,
  school_id   text NOT NULL REFERENCES schools(id),
  class_id    text REFERENCES classes(id),
  subject     text,
  title       text,
  description text,
  due_date    text,
  teacher_id  text REFERENCES teachers(id)
);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id           text PRIMARY KEY,
  school_id    text NOT NULL REFERENCES schools(id),
  homework_id  text NOT NULL REFERENCES homework(id),
  student_id   text NOT NULL REFERENCES students(id),
  file_name    text,
  note         text,
  status       text NOT NULL DEFAULT 'Submitted',
  submitted_at text NOT NULL DEFAULT app_now(),
  feedback     text,
  grade        text,
  UNIQUE (homework_id, student_id)
);

CREATE TABLE IF NOT EXISTS notices (
  id          text PRIMARY KEY,
  school_id   text NOT NULL REFERENCES schools(id),
  title       text NOT NULL,
  description text,
  category    text,
  priority    text,
  audience    text,
  date        text,
  author      text
);

CREATE TABLE IF NOT EXISTS notice_reads (
  id        text PRIMARY KEY,
  user_id   text NOT NULL REFERENCES users(id),
  notice_id text NOT NULL REFERENCES notices(id),
  read_at   text NOT NULL DEFAULT app_now(),
  UNIQUE (user_id, notice_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         text PRIMARY KEY,
  school_id  text NOT NULL REFERENCES schools(id),
  user_id    text NOT NULL REFERENCES users(id),
  category   text NOT NULL,
  title      text NOT NULL,
  body       text,
  read       integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS library_books (
  id        text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id),
  title     text NOT NULL,
  author    text,
  status    text DEFAULT 'Available'
);

CREATE TABLE IF NOT EXISTS library_records (
  id          text PRIMARY KEY,
  school_id   text NOT NULL REFERENCES schools(id),
  book_id     text REFERENCES library_books(id),
  student_id  text REFERENCES students(id),
  issued_on   text,
  returned_on text
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id         text PRIMARY KEY,
  school_id  text NOT NULL REFERENCES schools(id),
  class_id   text REFERENCES classes(id),
  day        text NOT NULL,
  period     integer NOT NULL,
  subject    text,
  teacher_id text REFERENCES teachers(id),
  room       text
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id             text PRIMARY KEY,
  school_id      text NOT NULL REFERENCES schools(id),
  requester_type text NOT NULL,
  requester_id   text NOT NULL,
  from_date      text,
  to_date        text,
  reason         text,
  status         text DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS certificates (
  id         text PRIMARY KEY,
  school_id  text NOT NULL REFERENCES schools(id),
  student_id text NOT NULL REFERENCES students(id),
  type       text NOT NULL,
  issued_on  text NOT NULL DEFAULT app_today(),
  issued_by  text
);

CREATE TABLE IF NOT EXISTS holidays (
  id        text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id),
  name      text NOT NULL,
  date      text NOT NULL,
  day       text,
  type      text DEFAULT 'Holiday',
  session   text
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         text PRIMARY KEY,
  actor_id   text,
  actor_name text,
  action     text NOT NULL,
  target     text,
  details    text,
  created_at text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS school_role_permissions (
  id         text PRIMARY KEY,
  school_id  text NOT NULL REFERENCES schools(id),
  role       text NOT NULL,
  department text,
  permission text NOT NULL,
  enabled    integer NOT NULL DEFAULT 1,
  updated_at text NOT NULL DEFAULT app_now(),
  UNIQUE (school_id, role, department, permission)
);

-- Platform / SaaS-only (Super Admin business data)
CREATE TABLE IF NOT EXISTS leads (
  id           text PRIMARY KEY,
  school_name  text NOT NULL,
  contact_name text,
  email        text,
  phone        text,
  source       text,
  status       text NOT NULL DEFAULT 'NEW',
  notes        text,
  created_at   text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id         text PRIMARY KEY,
  school_id  text REFERENCES schools(id),
  subject    text NOT NULL,
  message    text,
  priority   text NOT NULL DEFAULT 'NORMAL',
  status     text NOT NULL DEFAULT 'OPEN',
  created_at text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id         text PRIMARY KEY,
  title      text NOT NULL,
  body       text,
  audience   text NOT NULL DEFAULT 'ALL',
  created_at text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS payments (
  id         text PRIMARY KEY,
  school_id  text NOT NULL REFERENCES schools(id),
  amount     double precision NOT NULL,
  method     text,
  plan       text,
  paid_on    text NOT NULL DEFAULT app_today(),
  created_at text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS plan_features (
  plan_id     text NOT NULL REFERENCES plans(id),
  feature_key text NOT NULL,
  enabled     integer NOT NULL DEFAULT 1,
  PRIMARY KEY (plan_id, feature_key)
);

-- ---------------------------------------------------------------------------
-- Indexes  (identical intent to the SQLite schema, incl. partial + expression)
-- ---------------------------------------------------------------------------
-- Compatibility for a project where an earlier draft of the baseline created
-- these tables before the v4/v5 columns were finalized. CREATE TABLE IF NOT
-- EXISTS does not retrofit columns on PostgreSQL.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS employee_id text;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS joining_date text;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();
ALTER TABLE staff ADD COLUMN IF NOT EXISTS employee_id text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS joining_date text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE staff ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();
ALTER TABLE classes ADD COLUMN IF NOT EXISTS academic_year_id text REFERENCES academic_years(id);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS room_id text REFERENCES rooms(id);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE students ADD COLUMN IF NOT EXISTS academic_year_id text REFERENCES academic_years(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS academic_year_id text REFERENCES academic_years(id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS academic_year_id text REFERENCES academic_years(id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS marked_by text;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();
ALTER TABLE teacher_attendance ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE teacher_attendance ADD COLUMN IF NOT EXISTS marked_by text;
ALTER TABLE teacher_attendance ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS marked_by text;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();

CREATE INDEX IF NOT EXISTS idx_academic_years_school ON academic_years(school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_one_active ON academic_years(school_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_class_subjects_school   ON class_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class    ON class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher  ON class_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject  ON class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_student_guardians_parent  ON student_guardians(school_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON student_guardians(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_admissions_school               ON admissions(school_id);
CREATE INDEX IF NOT EXISTS idx_admission_documents_admission   ON admission_documents(admission_id);
CREATE INDEX IF NOT EXISTS idx_admission_notes_admission       ON admission_notes(admission_id);
CREATE INDEX IF NOT EXISTS idx_admission_status_history_admission ON admission_status_history(admission_id);
CREATE INDEX IF NOT EXISTS idx_users_school     ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_students_school  ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school  ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school ON attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_fees_school      ON fees(school_id);
CREATE INDEX IF NOT EXISTS idx_school_role_permissions_lookup ON school_role_permissions(school_id, role, department);

-- v4 employee / linkage uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_employee_id ON teachers(school_id, lower(employee_id)) WHERE employee_id IS NOT NULL AND btrim(employee_id) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_employee_id    ON staff(school_id, lower(employee_id))    WHERE employee_id IS NOT NULL AND btrim(employee_id) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_linked_teacher ON users(linked_teacher_id) WHERE linked_teacher_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_linked_staff   ON users(linked_staff_id)   WHERE linked_staff_id IS NOT NULL;

-- v3 student / admission uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_school_admission_no ON students(school_id, lower(admission_no)) WHERE admission_no IS NOT NULL AND btrim(admission_no) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_roll_placement      ON students(school_id, academic_year_id, class_id, roll) WHERE academic_year_id IS NOT NULL AND class_id IS NOT NULL AND roll IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_admissions_application_no    ON admissions(school_id, lower(application_no)) WHERE application_no IS NOT NULL AND btrim(application_no) <> '';

-- v5 attendance integrity
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_student_date  ON attendance(school_id, student_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_attendance_date  ON teacher_attendance(school_id, teacher_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_attendance_date    ON staff_attendance(school_id, staff_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date       ON attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(school_id, class_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_year       ON attendance(school_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_date ON teacher_attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date   ON staff_attendance(school_id, date);
