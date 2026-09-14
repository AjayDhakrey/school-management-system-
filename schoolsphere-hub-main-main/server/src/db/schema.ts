import type { DatabaseSync } from "node:sqlite";

export function migrate(db: DatabaseSync) {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      tagline TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      principal TEXT,
      session TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE | SUSPENDED | TRIAL | EXPIRED
      plan TEXT NOT NULL DEFAULT 'TRIAL',
      billing_cycle TEXT DEFAULT 'MONTHLY', -- MONTHLY | YEARLY
      payment_status TEXT DEFAULT 'PENDING', -- PAID | PENDING | OVERDUE
      subscription_started_at TEXT,
      subscription_expires_at TEXT,
      logo_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      price REAL NOT NULL DEFAULT 0,
      billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY', -- MONTHLY | YEARLY
      status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS academic_years (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | ACTIVE | CLOSED | ARCHIVED
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_academic_years_school ON academic_years(school_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_one_active
      ON academic_years(school_id) WHERE status = 'ACTIVE';

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      school_id TEXT REFERENCES schools(id), -- NULL for SUPER_ADMIN
      role TEXT NOT NULL, -- SUPER_ADMIN | SCHOOL_ADMIN | TEACHER | STAFF | PARENT | STUDENT
      department TEXT, -- for STAFF only: ADMIN | ACCOUNTS | LIBRARY | TRANSPORT
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED (currently only meaningful for SCHOOL_ADMIN)
      linked_teacher_id TEXT,
      linked_parent_id TEXT,
      linked_student_id TEXT,
      linked_staff_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      name TEXT NOT NULL,
      section TEXT NOT NULL,
      class_teacher_id TEXT REFERENCES teachers(id),
      academic_year_id TEXT REFERENCES academic_years(id),
      room_id TEXT REFERENCES rooms(id),
      status TEXT NOT NULL DEFAULT 'ACTIVE'
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      name TEXT NOT NULL,
      code TEXT,
      type TEXT DEFAULT 'Core',
      credits REAL DEFAULT 3,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
    );

    CREATE TABLE IF NOT EXISTS class_subjects (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      class_id TEXT NOT NULL REFERENCES classes(id),
      subject_id TEXT NOT NULL REFERENCES subjects(id),
      teacher_id TEXT REFERENCES teachers(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (class_id, subject_id)
    );

    CREATE INDEX IF NOT EXISTS idx_class_subjects_school ON class_subjects(school_id);
    CREATE INDEX IF NOT EXISTS idx_class_subjects_class ON class_subjects(class_id);
    CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON class_subjects(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_class_subjects_subject ON class_subjects(subject_id);

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      name TEXT NOT NULL,
      number TEXT,
      type TEXT NOT NULL DEFAULT 'CLASSROOM',
      capacity INTEGER,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      employee_id TEXT,
      name TEXT NOT NULL,
      department TEXT,
      email TEXT,
      phone TEXT,
      assigned_classes TEXT NOT NULL DEFAULT '[]', -- JSON array of class ids
      assigned_subjects TEXT NOT NULL DEFAULT '[]', -- JSON array of subject ids
      employment_status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | ON_LEAVE | INACTIVE | SUSPENDED | ARCHIVED
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parents (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      linked_student_ids TEXT NOT NULL DEFAULT '[]' -- JSON array of student ids
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      name TEXT NOT NULL,
      admission_no TEXT,
      class_id TEXT REFERENCES classes(id),
      academic_year_id TEXT REFERENCES academic_years(id),
      class_name TEXT,
      section TEXT,
      roll INTEGER,
      parent_id TEXT REFERENCES parents(id),
      status TEXT DEFAULT 'Active',
      attendance REAL DEFAULT 0,
      fee_status TEXT DEFAULT 'Pending',
      email TEXT,
      phone TEXT,
      dob TEXT,
      gender TEXT,
      address TEXT,
      photo_url TEXT,
      blood_group TEXT,
      admitted_on TEXT,
      previous_school TEXT,
      vehicle_id TEXT REFERENCES vehicles(id),
      pickup_point TEXT,
      drop_point TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_guardians (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      parent_id TEXT NOT NULL REFERENCES parents(id),
      relationship TEXT NOT NULL DEFAULT 'Guardian',
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, parent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_student_guardians_parent ON student_guardians(school_id, parent_id);
    CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON student_guardians(school_id, student_id);

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      employee_id TEXT,
      name TEXT NOT NULL,
      department TEXT, -- ADMIN | ACCOUNTS | LIBRARY | TRANSPORT
      designation TEXT,
      email TEXT,
      phone TEXT,
      employment_status TEXT NOT NULL DEFAULT 'ACTIVE',
      joining_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      class_id TEXT REFERENCES classes(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL -- Present | Absent | Leave
    );

    CREATE TABLE IF NOT EXISTS fees (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      due_date TEXT,
      paid_on TEXT,
      fee_type TEXT NOT NULL DEFAULT 'Tuition',
      discount REAL NOT NULL DEFAULT 0,
      fine REAL NOT NULL DEFAULT 0,
      receipt_no TEXT,
      paid_amount REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS fee_structures (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      class_id TEXT REFERENCES classes(id),
      fee_type TEXT NOT NULL,
      amount REAL NOT NULL,
      session TEXT
    );

    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      subject TEXT,
      class_id TEXT REFERENCES classes(id),
      date TEXT,
      status TEXT DEFAULT 'Scheduled'
    );

    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      exam_id TEXT REFERENCES exams(id),
      marks REAL,
      grade TEXT
    );

    CREATE TABLE IF NOT EXISTS homework (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      class_id TEXT REFERENCES classes(id),
      subject TEXT,
      title TEXT,
      due_date TEXT,
      teacher_id TEXT REFERENCES teachers(id)
    );

    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      priority TEXT,
      audience TEXT, -- All | Teachers | Parents | Students
      date TEXT,
      author TEXT
    );

    CREATE TABLE IF NOT EXISTS library_books (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      title TEXT NOT NULL,
      author TEXT,
      status TEXT DEFAULT 'Available'
    );

    CREATE TABLE IF NOT EXISTS library_records (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      book_id TEXT REFERENCES library_books(id),
      student_id TEXT REFERENCES students(id),
      issued_on TEXT,
      returned_on TEXT
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      number TEXT,
      route TEXT,
      driver TEXT,
      driver_phone TEXT,
      pickup_time TEXT,
      drop_time TEXT
    );

    CREATE TABLE IF NOT EXISTS admissions (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      application_no TEXT, -- unique per school, e.g. SCH-0001-APP-1000
      applicant TEXT NOT NULL,
      dob TEXT,
      gender TEXT,
      address TEXT,
      class_applied TEXT,
      section_applied TEXT,
      class_id_applied TEXT REFERENCES classes(id),
      academic_year_id TEXT REFERENCES academic_years(id),
      academic_year TEXT,
      parent_name TEXT,
      parent_relation TEXT, -- Father | Mother | Guardian
      previous_school TEXT,
      previous_class TEXT,
      previous_board TEXT,
      previous_percentage TEXT,
      applied_on TEXT,
      status TEXT DEFAULT 'Pending', -- New | Pending | Waitlisted | Approved | Rejected (derived from stage, kept for StatusBadge/back-compat)
      stage TEXT NOT NULL DEFAULT 'ENQUIRY', -- ENQUIRY | APPLICATION | DOCUMENT_VERIFICATION | UNDER_REVIEW | APPROVED | REJECTED | WAITLISTED | CONVERTED
      contact_email TEXT,
      contact_phone TEXT,
      documents TEXT NOT NULL DEFAULT '[]', -- legacy JSON array of document names, superseded by admission_documents
      notes TEXT, -- legacy free-text note, superseded by admission_notes
      admission_no TEXT, -- assigned only at conversion, e.g. SCH-0001-ADM-1024
      converted_student_id TEXT REFERENCES students(id),
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admission_documents (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      admission_id TEXT NOT NULL REFERENCES admissions(id),
      name TEXT NOT NULL,
      doc_type TEXT,
      file_data TEXT, -- data: URL of the uploaded file
      file_mime TEXT,
      status TEXT NOT NULL DEFAULT 'Pending', -- Pending | Verified | Rejected
      remarks TEXT,
      uploaded_by TEXT,
      uploaded_by_name TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      verified_by_name TEXT,
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS admission_notes (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      admission_id TEXT NOT NULL REFERENCES admissions(id),
      author_id TEXT,
      author_name TEXT,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admission_status_history (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      admission_id TEXT NOT NULL REFERENCES admissions(id),
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      remarks TEXT,
      changed_by TEXT,
      changed_by_name TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_admissions_school ON admissions(school_id);
    CREATE INDEX IF NOT EXISTS idx_admission_documents_admission ON admission_documents(admission_id);
    CREATE INDEX IF NOT EXISTS idx_admission_notes_admission ON admission_notes(admission_id);
    CREATE INDEX IF NOT EXISTS idx_admission_status_history_admission ON admission_status_history(admission_id);

    CREATE TABLE IF NOT EXISTS timetable_slots (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      class_id TEXT REFERENCES classes(id),
      day TEXT NOT NULL,
      period INTEGER NOT NULL,
      subject TEXT,
      teacher_id TEXT REFERENCES teachers(id)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      requester_type TEXT NOT NULL, -- TEACHER | STAFF
      requester_id TEXT NOT NULL,
      from_date TEXT,
      to_date TEXT,
      reason TEXT,
      status TEXT DEFAULT 'Pending'
    );

    -- Platform/SaaS-only tables — Super Admin business data, never joined against school-internal tables.
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      school_name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'NEW', -- NEW | CONTACTED | DEMO_SCHEDULED | CONVERTED | LOST
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      school_id TEXT REFERENCES schools(id),
      subject TEXT NOT NULL,
      message TEXT,
      priority TEXT NOT NULL DEFAULT 'NORMAL', -- LOW | NORMAL | HIGH | URGENT
      status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | IN_PROGRESS | RESOLVED | CLOSED
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT,
      audience TEXT NOT NULL DEFAULT 'ALL', -- ALL | TRIAL | ACTIVE
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      amount REAL NOT NULL,
      method TEXT,
      plan TEXT,
      paid_on TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plan_features (
      plan_id TEXT NOT NULL REFERENCES plans(id),
      feature_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (plan_id, feature_key)
    );

    CREATE TABLE IF NOT EXISTS teacher_attendance (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      teacher_id TEXT NOT NULL REFERENCES teachers(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL -- Present | Absent | Leave
    );

    CREATE TABLE IF NOT EXISTS staff_attendance (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      staff_id TEXT NOT NULL REFERENCES staff(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL -- Present | Absent | Leave
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      type TEXT NOT NULL, -- BONAFIDE | TRANSFER | CHARACTER
      issued_on TEXT NOT NULL DEFAULT (date('now')),
      issued_by TEXT
    );

    CREATE TABLE IF NOT EXISTS homework_submissions (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      homework_id TEXT NOT NULL REFERENCES homework(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      file_name TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'Submitted', -- Submitted | Late | Reviewed
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      feedback TEXT,
      grade TEXT,
      UNIQUE (homework_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      day TEXT,
      type TEXT DEFAULT 'Holiday',
      session TEXT
    );

    CREATE TABLE IF NOT EXISTS notice_reads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      notice_id TEXT NOT NULL REFERENCES notices(id),
      read_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, notice_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
    CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
    CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_school ON attendance(school_id);
    CREATE INDEX IF NOT EXISTS idx_fees_school ON fees(school_id);

    -- Per-school overrides of the hard-coded default permission sets in permissions.ts.
    -- Presence of ANY row for a (school_id, role, department) combo means that combo has
    -- been customized — its enabled=1 rows are the complete effective permission set,
    -- replacing (not merging with) the code default. Absence of any row means "use the
    -- code default" — see effectivePermissions() in server/src/rolePermissions.ts.
    CREATE TABLE IF NOT EXISTS school_role_permissions (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      role TEXT NOT NULL,
      department TEXT, -- only meaningful when role = 'STAFF'
      permission TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, role, department, permission)
    );
    CREATE INDEX IF NOT EXISTS idx_school_role_permissions_lookup
      ON school_role_permissions(school_id, role, department);
  `);

  // Columns added to tables that may already exist in a previously-created database —
  // CREATE TABLE IF NOT EXISTS above won't retrofit them, so add each if missing.
  addColumnIfMissing(db, "users", "status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfMissing(db, "users", "linked_staff_id", "TEXT");
  addColumnIfMissing(db, "schools", "logo_url", "TEXT");
  addColumnIfMissing(db, "schools", "code", "TEXT");
  addColumnIfMissing(db, "schools", "website", "TEXT");
  addColumnIfMissing(db, "schools", "board", "TEXT");
  addColumnIfMissing(db, "schools", "affiliation", "TEXT");
  addColumnIfMissing(db, "classes", "academic_year_id", "TEXT");
  addColumnIfMissing(db, "classes", "room_id", "TEXT");
  addColumnIfMissing(db, "classes", "status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfMissing(db, "subjects", "status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfMissing(db, "rooms", "number", "TEXT");
  addColumnIfMissing(db, "rooms", "type", "TEXT NOT NULL DEFAULT 'CLASSROOM'");
  addColumnIfMissing(db, "rooms", "capacity", "INTEGER");
  addColumnIfMissing(db, "rooms", "status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfMissing(db, "teachers", "employment_status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfMissing(db, "teachers", "employee_id", "TEXT");
  addColumnIfMissing(db, "teachers", "created_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "teachers", "updated_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "staff", "designation", "TEXT");
  addColumnIfMissing(db, "staff", "employment_status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumnIfMissing(db, "staff", "employee_id", "TEXT");
  addColumnIfMissing(db, "staff", "joining_date", "TEXT");
  addColumnIfMissing(db, "staff", "created_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "staff", "updated_at", "TEXT NOT NULL DEFAULT ''");
  db.exec(`UPDATE teachers SET created_at=datetime('now') WHERE created_at=''`);
  db.exec(`UPDATE teachers SET updated_at=datetime('now') WHERE updated_at=''`);
  db.exec(`UPDATE staff SET created_at=datetime('now') WHERE created_at=''`);
  db.exec(`UPDATE staff SET updated_at=datetime('now') WHERE updated_at=''`);
  addColumnIfMissing(db, "fees", "fee_type", "TEXT NOT NULL DEFAULT 'Tuition'");
  addColumnIfMissing(db, "fees", "discount", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "fees", "fine", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "fees", "receipt_no", "TEXT");
  addColumnIfMissing(db, "fees", "paid_amount", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "admissions", "stage", "TEXT NOT NULL DEFAULT 'ENQUIRY'");
  addColumnIfMissing(db, "admissions", "contact_email", "TEXT");
  addColumnIfMissing(db, "admissions", "contact_phone", "TEXT");
  addColumnIfMissing(db, "admissions", "documents", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "admissions", "notes", "TEXT");
  addColumnIfMissing(db, "admissions", "application_no", "TEXT");
  addColumnIfMissing(db, "admissions", "dob", "TEXT");
  addColumnIfMissing(db, "admissions", "gender", "TEXT");
  addColumnIfMissing(db, "admissions", "address", "TEXT");
  addColumnIfMissing(db, "admissions", "section_applied", "TEXT");
  addColumnIfMissing(db, "admissions", "class_id_applied", "TEXT");
  addColumnIfMissing(db, "admissions", "academic_year", "TEXT");
  addColumnIfMissing(db, "admissions", "academic_year_id", "TEXT");
  addColumnIfMissing(db, "admissions", "parent_name", "TEXT");
  addColumnIfMissing(db, "admissions", "parent_relation", "TEXT");
  addColumnIfMissing(db, "admissions", "previous_school", "TEXT");
  addColumnIfMissing(db, "admissions", "previous_class", "TEXT");
  addColumnIfMissing(db, "admissions", "previous_board", "TEXT");
  addColumnIfMissing(db, "admissions", "previous_percentage", "TEXT");
  addColumnIfMissing(db, "admissions", "admission_no", "TEXT");
  addColumnIfMissing(db, "admissions", "converted_student_id", "TEXT");
  addColumnIfMissing(db, "admissions", "created_by", "TEXT");
  addColumnIfMissing(db, "admissions", "created_by_name", "TEXT");
  addColumnIfMissing(db, "admissions", "created_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "admissions", "updated_at", "TEXT NOT NULL DEFAULT ''");
  db.exec(`UPDATE admissions SET created_at = datetime('now') WHERE created_at = ''`);
  db.exec(`UPDATE admissions SET updated_at = datetime('now') WHERE updated_at = ''`);
  addColumnIfMissing(db, "students", "email", "TEXT");
  addColumnIfMissing(db, "students", "academic_year_id", "TEXT");
  addColumnIfMissing(db, "students", "phone", "TEXT");
  addColumnIfMissing(db, "students", "dob", "TEXT");
  addColumnIfMissing(db, "students", "gender", "TEXT");
  addColumnIfMissing(db, "students", "address", "TEXT");
  addColumnIfMissing(db, "students", "photo_url", "TEXT");
  addColumnIfMissing(db, "students", "blood_group", "TEXT");
  addColumnIfMissing(db, "students", "admitted_on", "TEXT");
  addColumnIfMissing(db, "students", "previous_school", "TEXT");
  addColumnIfMissing(db, "students", "vehicle_id", "TEXT");
  addColumnIfMissing(db, "students", "pickup_point", "TEXT");
  addColumnIfMissing(db, "students", "drop_point", "TEXT");
  addColumnIfMissing(db, "students", "created_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "students", "updated_at", "TEXT NOT NULL DEFAULT ''");
  db.exec(`UPDATE students SET created_at = datetime('now') WHERE created_at = ''`);
  db.exec(`UPDATE students SET updated_at = datetime('now') WHERE updated_at = ''`);
  addColumnIfMissing(db, "exams", "term", "TEXT NOT NULL DEFAULT 'Term 1'");
  addColumnIfMissing(db, "results", "max_marks", "REAL NOT NULL DEFAULT 100");
  addColumnIfMissing(db, "results", "published_at", "TEXT NOT NULL DEFAULT '2000-01-01 00:00:00'");
  db.exec(`UPDATE results SET published_at = datetime('now') WHERE published_at = '2000-01-01 00:00:00'`);
  addColumnIfMissing(db, "vehicles", "driver_phone", "TEXT");
  addColumnIfMissing(db, "vehicles", "pickup_time", "TEXT");
  addColumnIfMissing(db, "vehicles", "drop_time", "TEXT");
  addColumnIfMissing(db, "vehicles", "capacity", "INTEGER NOT NULL DEFAULT 40");
  addColumnIfMissing(db, "vehicles", "status", "TEXT NOT NULL DEFAULT 'Idle'");
  addColumnIfMissing(db, "vehicles", "stops", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "teachers", "photo_url", "TEXT");
  addColumnIfMissing(db, "teachers", "designation", "TEXT");
  addColumnIfMissing(db, "teachers", "joining_date", "TEXT");
  addColumnIfMissing(db, "teacher_attendance", "check_in", "TEXT");
  addColumnIfMissing(db, "teacher_attendance", "check_out", "TEXT");
  addColumnIfMissing(db, "staff_attendance", "check_in", "TEXT");
  addColumnIfMissing(db, "staff_attendance", "check_out", "TEXT");
  addColumnIfMissing(db, "homework", "description", "TEXT");
  addColumnIfMissing(db, "timetable_slots", "room", "TEXT");
  addColumnIfMissing(db, "subjects", "type", "TEXT DEFAULT 'Core'");
  addColumnIfMissing(db, "subjects", "credits", "REAL DEFAULT 3");
  addColumnIfMissing(db, "subjects", "description", "TEXT");

  // --- Migration v5: attendance integrity + academic/class context ---
  // Student attendance gains the academic-year it belongs to (frozen at mark time so a later
  // class change never rewrites history), a free-text remark, and who/when it was last written.
  addColumnIfMissing(db, "attendance", "academic_year_id", "TEXT");
  addColumnIfMissing(db, "attendance", "remarks", "TEXT");
  addColumnIfMissing(db, "attendance", "marked_by", "TEXT");
  addColumnIfMissing(db, "attendance", "created_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "attendance", "updated_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "teacher_attendance", "remarks", "TEXT");
  addColumnIfMissing(db, "teacher_attendance", "marked_by", "TEXT");
  addColumnIfMissing(db, "teacher_attendance", "updated_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "staff_attendance", "remarks", "TEXT");
  addColumnIfMissing(db, "staff_attendance", "marked_by", "TEXT");
  addColumnIfMissing(db, "staff_attendance", "updated_at", "TEXT NOT NULL DEFAULT ''");
  db.exec(`
    UPDATE attendance SET created_at = datetime('now') WHERE created_at = '';
    UPDATE attendance SET updated_at = datetime('now') WHERE updated_at = '';
    UPDATE teacher_attendance SET updated_at = datetime('now') WHERE updated_at = '';
    UPDATE staff_attendance SET updated_at = datetime('now') WHERE updated_at = '';

    -- Backfill the academic year from the row's class, then the student's current placement.
    UPDATE attendance
    SET academic_year_id = (SELECT c.academic_year_id FROM classes c WHERE c.id = attendance.class_id AND c.school_id = attendance.school_id)
    WHERE academic_year_id IS NULL AND class_id IS NOT NULL;
    UPDATE attendance
    SET academic_year_id = (SELECT s.academic_year_id FROM students s WHERE s.id = attendance.student_id AND s.school_id = attendance.school_id),
        class_id = COALESCE(class_id, (SELECT s.class_id FROM students s WHERE s.id = attendance.student_id AND s.school_id = attendance.school_id))
    WHERE academic_year_id IS NULL;

    -- Collapse any pre-v5 duplicate (student/date), (teacher/date), (staff/date) rows, keeping the newest.
    DELETE FROM attendance WHERE rowid NOT IN (SELECT max(rowid) FROM attendance GROUP BY school_id, student_id, date);
    DELETE FROM teacher_attendance WHERE rowid NOT IN (SELECT max(rowid) FROM teacher_attendance GROUP BY school_id, teacher_id, date);
    DELETE FROM staff_attendance WHERE rowid NOT IN (SELECT max(rowid) FROM staff_attendance GROUP BY school_id, staff_id, date);
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_student_date ON attendance(school_id, student_id, date);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_attendance_date ON teacher_attendance(school_id, teacher_id, date);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_attendance_date ON staff_attendance(school_id, staff_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(school_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(school_id, class_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_year ON attendance(school_id, academic_year_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_attendance_date ON teacher_attendance(school_id, date);
    CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(school_id, date);
  `);

  db.exec(`
    INSERT OR IGNORE INTO academic_years (id, school_id, name, start_date, end_date, status)
    SELECT 'legacy-' || id, id, session,
           substr(session, 1, 4) || '-04-01',
           substr(session, 6, 4) || '-03-31',
           'ACTIVE'
    FROM schools
    WHERE session IS NOT NULL
      AND session GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]';

    UPDATE classes
    SET academic_year_id = (
      SELECT ay.id FROM academic_years ay
      WHERE ay.school_id = classes.school_id AND ay.status = 'ACTIVE'
      LIMIT 1
    )
    WHERE academic_year_id IS NULL;

    UPDATE students
    SET academic_year_id = (
      SELECT c.academic_year_id FROM classes c
      WHERE c.id = students.class_id AND c.school_id = students.school_id
    )
    WHERE academic_year_id IS NULL AND class_id IS NOT NULL;

    UPDATE admissions
    SET academic_year_id = (
      SELECT c.academic_year_id FROM classes c
      WHERE c.id = admissions.class_id_applied AND c.school_id = admissions.school_id
    )
    WHERE academic_year_id IS NULL AND class_id_applied IS NOT NULL;

    INSERT OR IGNORE INTO student_guardians (id, school_id, student_id, parent_id, relationship, is_primary)
    SELECT 'legacy-primary-' || s.id, s.school_id, s.id, s.parent_id, 'Guardian', 1
    FROM students s JOIN parents p ON p.id = s.parent_id AND p.school_id = s.school_id
    WHERE s.parent_id IS NOT NULL;

    INSERT OR IGNORE INTO student_guardians (id, school_id, student_id, parent_id, relationship, is_primary)
    SELECT 'legacy-json-' || p.id || '-' || j.value, p.school_id, j.value, p.id, 'Guardian',
           CASE WHEN s.parent_id = p.id THEN 1 ELSE 0 END
    FROM parents p, json_each(p.linked_student_ids) j
    JOIN students s ON s.id = j.value AND s.school_id = p.school_id;
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_employee_id ON teachers(school_id, lower(employee_id)) WHERE employee_id IS NOT NULL AND trim(employee_id)<>'';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_employee_id ON staff(school_id, lower(employee_id)) WHERE employee_id IS NOT NULL AND trim(employee_id)<>'';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_linked_teacher ON users(linked_teacher_id) WHERE linked_teacher_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_linked_staff ON users(linked_staff_id) WHERE linked_staff_id IS NOT NULL;
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_students_school_admission_no
      ON students(school_id, lower(admission_no))
      WHERE admission_no IS NOT NULL AND trim(admission_no) <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_students_roll_placement
      ON students(school_id, academic_year_id, class_id, roll)
      WHERE academic_year_id IS NOT NULL AND class_id IS NOT NULL AND roll IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_admissions_application_no
      ON admissions(school_id, lower(application_no))
      WHERE application_no IS NOT NULL AND trim(application_no) <> '';
  `);

  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)",
  ).run(1, "baseline_schema_and_legacy_compatibility");
  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)",
  ).run(2, "academic_structure_foundation");
  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)",
  ).run(3, "student_admission_guardian_integrity");
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)").run(4, "teacher_staff_management");
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)").run(5, "attendance_integrity_and_context");
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
