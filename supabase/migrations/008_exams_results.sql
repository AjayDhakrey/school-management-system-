ALTER TABLE exams ADD COLUMN IF NOT EXISTS academic_year_id text REFERENCES academic_years(id);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_id text REFERENCES subjects(id);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_type text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS end_time text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS maximum_marks double precision;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS passing_marks double precision;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS room_id text REFERENCES rooms(id);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS created_by text REFERENCES users(id);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE exams ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();

UPDATE exams e SET academic_year_id=c.academic_year_id FROM classes c WHERE e.class_id=c.id AND e.academic_year_id IS NULL;
UPDATE exams e SET subject_id=s.id FROM subjects s WHERE e.school_id=s.school_id AND lower(e.subject)=lower(s.name) AND e.subject_id IS NULL;
UPDATE exams SET name=COALESCE(NULLIF(term,''),'Examination'), exam_type=CASE WHEN lower(term) LIKE '%final%' THEN 'Final' WHEN lower(term) LIKE '%mid%' THEN 'Mid-Term' ELSE 'Other' END, maximum_marks=100, passing_marks=35 WHERE name IS NULL;
UPDATE exams SET status=CASE status WHEN 'Scheduled' THEN 'DRAFT' WHEN 'Ongoing' THEN 'MARKS_ENTRY' WHEN 'Completed' THEN CASE WHEN EXISTS(SELECT 1 FROM results r WHERE r.exam_id=exams.id AND r.published_at<>'2000-01-01 00:00:00') THEN 'PUBLISHED' ELSE 'REVIEW' END ELSE status END;

ALTER TABLE results ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'PRESENT';
ALTER TABLE results ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE results ADD COLUMN IF NOT EXISTS entered_by text REFERENCES users(id);
ALTER TABLE results ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT app_now();
ALTER TABLE results ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT app_now();

UPDATE results r SET max_marks=e.maximum_marks FROM exams e WHERE r.exam_id=e.id AND e.maximum_marks IS NOT NULL;
UPDATE results SET attendance_status='ABSENT' WHERE marks IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_schedule ON exams(school_id,academic_year_id,class_id,subject_id,date) WHERE status<>'CANCELLED';
CREATE UNIQUE INDEX IF NOT EXISTS uq_result_exam_student ON results(exam_id,student_id) WHERE exam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exams_context ON exams(school_id,academic_year_id,class_id,status,date);
CREATE INDEX IF NOT EXISTS idx_results_exam ON results(school_id,exam_id,student_id);
CREATE INDEX IF NOT EXISTS idx_results_student ON results(school_id,student_id,exam_id);

ALTER TABLE exams ADD CONSTRAINT exams_type_check CHECK (exam_type IN ('Unit Test','Monthly Test','Mid-Term','Half-Yearly','Final','Other'));
ALTER TABLE exams ADD CONSTRAINT exams_status_check CHECK (status IN ('DRAFT','MARKS_ENTRY','REVIEW','PUBLISHED','CANCELLED'));
ALTER TABLE exams ADD CONSTRAINT exams_marks_check CHECK (maximum_marks>0 AND passing_marks>=0 AND passing_marks<=maximum_marks);
ALTER TABLE results ADD CONSTRAINT results_attendance_check CHECK (attendance_status IN ('PRESENT','ABSENT','NOT_APPLICABLE'));
ALTER TABLE results ADD CONSTRAINT results_marks_check CHECK ((attendance_status='PRESENT' AND marks>=0 AND marks<=max_marks) OR (attendance_status IN ('ABSENT','NOT_APPLICABLE') AND marks IS NULL));
