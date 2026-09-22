-- Converts every `text` column that was constrained by an inline `check (col in (...))` into
-- a real Postgres ENUM. Supabase Studio's Table Editor renders an enum column as a dropdown;
-- a text+check column still renders as a free-text input, which is exactly what let 'Active'
-- slip past the schools.status check instead of 'ACTIVE' (case-sensitive) earlier. Columns
-- without an existing check (fees.status, holidays.type, notices.priority, leave_requests.status,
-- school_role_permissions.role/department, ...) are intentionally left alone — no fixed value
-- set was ever defined for them at the DB level, so there's nothing to build a dropdown from.
--
-- Must run after 22-27 (the tables/functions being altered) but the function bodies in
-- 23_rls_helpers.sql / 27_rpc_functions.sql that cast to these types (has_permission(),
-- get_effective_permissions(), set_user_status(), bulk_upsert_attendance(), convert_admission())
-- are plpgsql, so the forward reference to types created here is resolved lazily and is safe.

-- ============================================================================
-- 1) Types, grouped by shared value set/semantics (grouped types get reused across tables
-- instead of a separate identical enum per column).
-- ============================================================================

create type public.billing_cycle as enum ('MONTHLY', 'YEARLY');                 -- plans, schools
create type public.plan_status as enum ('ACTIVE', 'INACTIVE');                  -- plans
create type public.school_status as enum ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRIAL', 'EXPIRED');
create type public.payment_status as enum ('PAID', 'PENDING', 'OVERDUE');       -- schools
create type public.plan_feature_key as enum (
  'Attendance', 'Fees', 'Exams', 'Homework', 'Library', 'Transport', 'Timetable', 'Admissions'
);
create type public.lead_status as enum ('NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'CONVERTED', 'LOST');
create type public.ticket_priority as enum ('LOW', 'NORMAL', 'HIGH', 'URGENT');
create type public.ticket_status as enum ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
create type public.announcement_audience as enum ('ALL', 'TRIAL', 'ACTIVE');
create type public.staff_department as enum ('ADMIN', 'ACCOUNTS', 'LIBRARY', 'TRANSPORT');
create type public.employment_status as enum ('ACTIVE', 'ON_LEAVE', 'INACTIVE'); -- teachers, staff
create type public.user_role as enum
  ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'PARENT', 'STUDENT');
create type public.user_profile_status as enum ('ACTIVE', 'SUSPENDED');
create type public.attendance_status as enum ('Present', 'Absent', 'Leave'); -- attendance, teacher_/staff_attendance
create type public.homework_submission_status as enum ('Submitted', 'Late', 'Reviewed');
create type public.assignable_role as enum ('TEACHER', 'STAFF', 'PARENT', 'STUDENT');
create type public.parent_relation as enum ('Father', 'Mother', 'Guardian');
create type public.admission_stage as enum (
  'ENQUIRY', 'APPLICATION', 'DOCUMENT_VERIFICATION', 'UNDER_REVIEW', 'APPROVED', 'REJECTED',
  'WAITLISTED', 'CONVERTED'
);
create type public.document_status as enum ('Pending', 'Verified', 'Rejected');
create type public.notice_audience as enum ('All', 'Teachers', 'Parents', 'Students');
create type public.leave_requester_type as enum ('TEACHER', 'STAFF', 'STUDENT');
create type public.certificate_type as enum ('BONAFIDE', 'TRANSFER', 'CHARACTER');

-- ============================================================================
-- 2) plans / schools
-- ============================================================================

alter table public.plans drop constraint if exists plans_billing_cycle_check;
alter table public.plans alter column billing_cycle drop default;
alter table public.plans
  alter column billing_cycle type public.billing_cycle using billing_cycle::public.billing_cycle;
alter table public.plans alter column billing_cycle set default 'MONTHLY'::public.billing_cycle;

alter table public.plans drop constraint if exists plans_status_check;
alter table public.plans alter column status drop default;
alter table public.plans alter column status type public.plan_status using status::public.plan_status;
alter table public.plans alter column status set default 'ACTIVE'::public.plan_status;

alter table public.schools drop constraint if exists schools_status_check;
alter table public.schools alter column status drop default;
alter table public.schools alter column status type public.school_status using status::public.school_status;
alter table public.schools alter column status set default 'ACTIVE'::public.school_status;

alter table public.schools drop constraint if exists schools_billing_cycle_check;
alter table public.schools alter column billing_cycle drop default;
alter table public.schools
  alter column billing_cycle type public.billing_cycle using billing_cycle::public.billing_cycle;
alter table public.schools alter column billing_cycle set default 'MONTHLY'::public.billing_cycle;

alter table public.schools drop constraint if exists schools_payment_status_check;
alter table public.schools alter column payment_status drop default;
alter table public.schools
  alter column payment_status type public.payment_status using payment_status::public.payment_status;
alter table public.schools alter column payment_status set default 'PENDING'::public.payment_status;

alter table public.plan_features drop constraint if exists plan_features_feature_key_check;
alter table public.plan_features
  alter column feature_key type public.plan_feature_key using feature_key::public.plan_feature_key;

-- ============================================================================
-- 3) leads / support_tickets / announcements
-- ============================================================================

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads alter column status drop default;
alter table public.leads alter column status type public.lead_status using status::public.lead_status;
alter table public.leads alter column status set default 'NEW'::public.lead_status;

alter table public.support_tickets drop constraint if exists support_tickets_priority_check;
alter table public.support_tickets alter column priority drop default;
alter table public.support_tickets
  alter column priority type public.ticket_priority using priority::public.ticket_priority;
alter table public.support_tickets alter column priority set default 'NORMAL'::public.ticket_priority;

alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets alter column status drop default;
alter table public.support_tickets
  alter column status type public.ticket_status using status::public.ticket_status;
alter table public.support_tickets alter column status set default 'OPEN'::public.ticket_status;

alter table public.announcements drop constraint if exists announcements_audience_check;
alter table public.announcements alter column audience drop default;
alter table public.announcements
  alter column audience type public.announcement_audience using audience::public.announcement_audience;
alter table public.announcements alter column audience set default 'ALL'::public.announcement_audience;

-- ============================================================================
-- 4) teachers / staff / user_profiles
-- ============================================================================

alter table public.teachers drop constraint if exists teachers_employment_status_check;
alter table public.teachers alter column employment_status drop default;
alter table public.teachers
  alter column employment_status type public.employment_status using employment_status::public.employment_status;
alter table public.teachers alter column employment_status set default 'ACTIVE'::public.employment_status;

alter table public.staff drop constraint if exists staff_department_check;
alter table public.staff
  alter column department type public.staff_department using department::public.staff_department;

alter table public.staff drop constraint if exists staff_employment_status_check;
alter table public.staff alter column employment_status drop default;
alter table public.staff
  alter column employment_status type public.employment_status using employment_status::public.employment_status;
alter table public.staff alter column employment_status set default 'ACTIVE'::public.employment_status;

alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles alter column role type public.user_role using role::public.user_role;

alter table public.user_profiles drop constraint if exists user_profiles_department_check;
alter table public.user_profiles
  alter column department type public.staff_department using department::public.staff_department;

alter table public.user_profiles drop constraint if exists user_profiles_status_check;
alter table public.user_profiles alter column status drop default;
alter table public.user_profiles
  alter column status type public.user_profile_status using status::public.user_profile_status;
alter table public.user_profiles alter column status set default 'ACTIVE'::public.user_profile_status;

-- ============================================================================
-- 5) attendance / teacher_attendance / staff_attendance
-- ============================================================================

alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance
  alter column status type public.attendance_status using status::public.attendance_status;

alter table public.teacher_attendance drop constraint if exists teacher_attendance_status_check;
alter table public.teacher_attendance
  alter column status type public.attendance_status using status::public.attendance_status;

alter table public.staff_attendance drop constraint if exists staff_attendance_status_check;
alter table public.staff_attendance
  alter column status type public.attendance_status using status::public.attendance_status;

-- ============================================================================
-- 6) homework_submissions / notices / leave_requests / certificates
-- ============================================================================

alter table public.homework_submissions drop constraint if exists homework_submissions_status_check;
alter table public.homework_submissions alter column status drop default;
alter table public.homework_submissions
  alter column status type public.homework_submission_status using status::public.homework_submission_status;
alter table public.homework_submissions
  alter column status set default 'Submitted'::public.homework_submission_status;

alter table public.notices drop constraint if exists notices_audience_check;
alter table public.notices
  alter column audience type public.notice_audience using audience::public.notice_audience;

alter table public.leave_requests drop constraint if exists leave_requests_requester_type_check;
alter table public.leave_requests
  alter column requester_type type public.leave_requester_type using requester_type::public.leave_requester_type;

alter table public.certificates drop constraint if exists certificates_type_check;
alter table public.certificates
  alter column "type" type public.certificate_type using "type"::public.certificate_type;

-- ============================================================================
-- 7) role_permission_defaults
-- ============================================================================

alter table public.role_permission_defaults drop constraint if exists role_permission_defaults_role_check;
alter table public.role_permission_defaults
  alter column role type public.assignable_role using role::public.assignable_role;

alter table public.role_permission_defaults drop constraint if exists role_permission_defaults_department_check;
alter table public.role_permission_defaults
  alter column department type public.staff_department using department::public.staff_department;

-- ============================================================================
-- 8) admissions / admission_documents
-- ============================================================================

alter table public.admissions drop constraint if exists admissions_parent_relation_check;
alter table public.admissions
  alter column parent_relation type public.parent_relation using parent_relation::public.parent_relation;

alter table public.admissions drop constraint if exists admissions_stage_check;
alter table public.admissions alter column stage drop default;
alter table public.admissions
  alter column stage type public.admission_stage using stage::public.admission_stage;
alter table public.admissions alter column stage set default 'ENQUIRY'::public.admission_stage;

alter table public.admission_documents drop constraint if exists admission_documents_status_check;
alter table public.admission_documents alter column status drop default;
alter table public.admission_documents
  alter column status type public.document_status using status::public.document_status;
alter table public.admission_documents alter column status set default 'Pending'::public.document_status;
