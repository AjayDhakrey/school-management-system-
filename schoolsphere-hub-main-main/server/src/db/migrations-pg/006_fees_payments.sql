-- Step 7: production-oriented school fee structures, assignments, payments and receipts.
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS academic_year_id text REFERENCES academic_years(id);
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Tuition';
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'Annual';
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS due_date text;
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS created_by text REFERENCES users(id);
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();
UPDATE fee_structures SET category=CASE
  WHEN lower(fee_type) LIKE '%tuition%' THEN 'Tuition'
  WHEN lower(fee_type) LIKE '%admission%' THEN 'Admission'
  WHEN lower(fee_type) LIKE '%transport%' THEN 'Transport'
  WHEN lower(fee_type) LIKE '%library%' THEN 'Library'
  WHEN lower(fee_type) LIKE '%exam%' THEN 'Examination'
  WHEN lower(fee_type) LIKE '%activity%' OR lower(fee_type) LIKE '%sport%' THEN 'Activity'
  WHEN lower(fee_type) LIKE '%hostel%' THEN 'Hostel'
  ELSE 'Other' END
 WHERE fee_type IS NOT NULL;
UPDATE fee_structures fs SET academic_year_id=c.academic_year_id FROM classes c
 WHERE fs.class_id=c.id AND fs.academic_year_id IS NULL;

ALTER TABLE fees ADD COLUMN IF NOT EXISTS fee_structure_id text REFERENCES fee_structures(id);
ALTER TABLE fees ADD COLUMN IF NOT EXISTS academic_year_id text REFERENCES academic_years(id);
ALTER TABLE fees ADD COLUMN IF NOT EXISTS class_id text REFERENCES classes(id);
ALTER TABLE fees ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE fees ADD COLUMN IF NOT EXISTS created_by text REFERENCES users(id);
ALTER TABLE fees ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE fees ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();
UPDATE fees f SET academic_year_id=s.academic_year_id, class_id=s.class_id FROM students s
 WHERE f.student_id=s.id AND (f.academic_year_id IS NULL OR f.class_id IS NULL);

CREATE TABLE IF NOT EXISTS fee_payments (
  id text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id),
  fee_id text NOT NULL REFERENCES fees(id),
  student_id text NOT NULL REFERENCES students(id),
  amount double precision NOT NULL,
  method text NOT NULL,
  transaction_reference text,
  idempotency_key text,
  payment_date text NOT NULL,
  collected_by text REFERENCES users(id),
  remarks text,
  created_at text NOT NULL DEFAULT app_now(),
  CONSTRAINT fee_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT fee_payments_method_check CHECK (method IN ('Cash','UPI','Card','Bank Transfer','Cheque','Other')),
  CONSTRAINT fee_payments_reference_unique UNIQUE (school_id, transaction_reference),
  CONSTRAINT fee_payments_idempotency_unique UNIQUE (school_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS fee_receipts (
  id text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id),
  payment_id text NOT NULL UNIQUE REFERENCES fee_payments(id),
  fee_id text NOT NULL REFERENCES fees(id),
  student_id text NOT NULL REFERENCES students(id),
  receipt_no text NOT NULL,
  amount double precision NOT NULL,
  method text NOT NULL,
  payment_date text NOT NULL,
  transaction_reference text,
  school_name text NOT NULL,
  student_name text NOT NULL,
  admission_no text,
  fee_type text NOT NULL,
  academic_year_name text,
  class_name text,
  section text,
  collector_name text,
  remarks text,
  created_at text NOT NULL DEFAULT app_now(),
  CONSTRAINT fee_receipts_amount_positive CHECK (amount > 0),
  CONSTRAINT fee_receipts_school_no_unique UNIQUE (school_id, receipt_no)
);

CREATE INDEX IF NOT EXISTS idx_fee_structures_school_year ON fee_structures(school_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON fee_structures(school_id, class_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_structures_equivalent
 ON fee_structures(school_id, academic_year_id, COALESCE(class_id,''), lower(category), frequency, COALESCE(due_date,''))
 WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_fees_student_due ON fees(school_id, student_id, due_date);
CREATE INDEX IF NOT EXISTS idx_fees_structure ON fees(fee_structure_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_assignment_structure_student_due
 ON fees(school_id, student_id, fee_structure_id, COALESCE(due_date,'')) WHERE fee_structure_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fee_payments_fee ON fee_payments(school_id, fee_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(school_id, student_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_fee_receipts_student ON fee_receipts(school_id, student_id, payment_date);

DO $$ BEGIN
  ALTER TABLE fee_structures ADD CONSTRAINT fee_structures_amount_positive CHECK (amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE fee_structures ADD CONSTRAINT fee_structures_category_check CHECK (category IN ('Tuition','Admission','Transport','Library','Examination','Activity','Hostel','Other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE fee_structures ADD CONSTRAINT fee_structures_frequency_check CHECK (frequency IN ('Monthly','Quarterly','Term','Annual','One-Time'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE fee_structures ADD CONSTRAINT fee_structures_status_check CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE fees ADD CONSTRAINT fees_amount_positive CHECK (amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE fees ADD CONSTRAINT fees_adjustments_nonnegative CHECK (discount >= 0 AND fine >= 0 AND paid_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE fees ADD CONSTRAINT fees_status_check CHECK (status IN ('Paid','Partial','Pending','Overdue'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
