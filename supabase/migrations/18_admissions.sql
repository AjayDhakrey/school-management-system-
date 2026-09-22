-- `status` (a legacy derived mirror of `stage`, kept only for old UI back-compat) and the
-- legacy `documents`/`notes` JSON columns are dropped — admission_documents/admission_notes
-- below are the real, already-normalized tables for those.
create table public.admissions (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  application_no text,
  applicant text not null,
  dob date,
  gender text,
  address text,
  class_applied text,
  section_applied text,
  class_id_applied uuid references public.classes (id) on delete set null,
  academic_year text,
  parent_name text,
  parent_relation text check (parent_relation in ('Father', 'Mother', 'Guardian')),
  previous_school text,
  previous_class text,
  previous_board text,
  previous_percentage numeric(5, 2),
  applied_on date not null default current_date,
  -- Validated state machine (ENQUIRY -> ... -> APPROVED/REJECTED/WAITLISTED, APPROVED -> CONVERTED).
  -- Transition validity is enforced at the RLS/application layer, matching today's behavior
  -- (no DB trigger) — not a regression, the original never enforced it at the DB level either.
  stage text not null default 'ENQUIRY' check (
    stage in (
      'ENQUIRY', 'APPLICATION', 'DOCUMENT_VERIFICATION', 'UNDER_REVIEW', 'APPROVED', 'REJECTED',
      'WAITLISTED', 'CONVERTED'
    )
  ),
  contact_email text,
  contact_phone text,
  -- Set only at conversion (see convert_admission() in 27_rpc_functions.sql).
  admission_no text,
  converted_student_id uuid references public.students (id) on delete set null,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_admissions_school on public.admissions (school_id);

-- file_data (base64-in-column in the original schema) is replaced by a Supabase Storage
-- pointer — see 28_storage_buckets.sql for the `admission-documents` bucket.
create table public.admission_documents (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  admission_id uuid not null references public.admissions (id) on delete cascade,
  name text not null,
  doc_type text,
  storage_path text,
  file_mime text,
  file_size_bytes integer,
  status text not null default 'Pending' check (status in ('Pending', 'Verified', 'Rejected')),
  remarks text,
  uploaded_by uuid,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  verified_by_name text,
  verified_at timestamptz
);
create index idx_admission_documents_admission on public.admission_documents (admission_id);

create table public.admission_notes (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  admission_id uuid not null references public.admissions (id) on delete cascade,
  author_id uuid,
  author_name text,
  note text not null,
  created_at timestamptz not null default now()
);
create index idx_admission_notes_admission on public.admission_notes (admission_id);

create table public.admission_status_history (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  admission_id uuid not null references public.admissions (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  remarks text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now()
);
create index idx_admission_status_history_admission on public.admission_status_history (admission_id);
