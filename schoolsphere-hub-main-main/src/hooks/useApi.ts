import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Server row shapes (snake_case, mirrors server/src/db/schema.ts) -----------

export interface ApiStudent {
  id: string;
  school_id: string;
  name: string;
  admission_no: string | null;
  class_id: string | null;
  academic_year_id: string | null;
  class_name: string | null;
  section: string | null;
  roll: number | null;
  parent_id: string | null;
  status: string | null;
  attendance: number | null;
  fee_status: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  address: string | null;
  photo_url: string | null;
  blood_group: string | null;
  admitted_on: string | null;
  vehicle_id: string | null;
  pickup_point: string | null;
  drop_point: string | null;
  gender: string | null;
  previous_school: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiTeacher {
  id: string;
  school_id: string;
  name: string;
  department: string | null;
  email: string | null;
  phone: string | null;
  assigned_classes: string;
  assigned_subjects: string;
  employment_status: string;
  photo_url: string | null;
  designation: string | null;
  joining_date: string | null;
  employee_id: string | null;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiParent {
  id: string;
  school_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  linked_student_ids: string;
}

export interface ApiStaff {
  id: string;
  school_id: string;
  name: string;
  department: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  employment_status: string;
  employee_id: string | null;
  joining_date: string | null;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiClass {
  id: string;
  school_id: string;
  name: string;
  section: string;
  class_teacher_id: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  room_id: string | null;
  room_name: string | null;
  status: "ACTIVE" | "ARCHIVED";
}

export interface ApiSubject {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  type: string | null;
  credits: number | null;
  description: string | null;
}

export interface ApiClassSubjectMapping {
  id: string;
  school_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  created_at: string;
  class_name: string;
  section: string;
  subject_name: string;
  subject_code: string | null;
  subject_type: string | null;
  subject_credits: number | null;
  subject_description: string | null;
  teacher_name: string | null;
  teacher_email: string | null;
  teacher_phone: string | null;
}

export interface ApiTeacherTeachingSubject {
  id: string;
  class_id: string;
  subject_id: string;
  class_name: string;
  section: string;
  subject_name: string;
  subject_code: string | null;
  subject_type: string | null;
  subject_credits: number | null;
  subject_description: string | null;
}

export interface ApiStudentClassSubject {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  class_name: string;
  section: string;
  subject_name: string;
  subject_code: string | null;
  subject_type: string | null;
  subject_credits: number | null;
  subject_description: string | null;
  teacher_name: string | null;
  teacher_email: string | null;
  teacher_phone: string | null;
  teacher_photo_url: string | null;
}

export interface ApiRoom {
  id: string;
  school_id: string;
  name: string;
  number: string | null;
  type: string;
  capacity: number | null;
  status: string;
}

export interface ApiAcademicYear {
  id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
  created_at: string;
}

export interface ApiAttendance {
  id: string;
  school_id: string;
  student_id: string;
  class_id: string | null;
  academic_year_id: string | null;
  date: string;
  status: string;
  remarks: string | null;
  marked_by: string | null;
  // present on GET /attendance (joined), absent on some legacy rows
  student_name?: string;
  admission_no?: string | null;
  student_roll?: number | null;
  class_name?: string | null;
  section?: string | null;
}

export interface ApiAttendanceRosterStudent {
  id: string;
  name: string;
  roll: number | null;
  admission_no: string | null;
  attendance_id: string | null;
  status: string | null;
  remarks: string | null;
}

export interface ApiAttendanceRoster {
  classId: string;
  date: string;
  academicYearId: string | null;
  holiday: { name: string; type: string | null } | null;
  students: ApiAttendanceRosterStudent[];
}

export interface ApiAttendanceSummary {
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  eligible: number;
  percentage: number;
}

export interface ApiEmployeeAttendanceRosterPerson {
  id: string;
  name: string;
  employee_id: string | null;
  department: string | null;
  employment_status: string;
  attendance_id: string | null;
  status: string | null;
  remarks: string | null;
}

export interface ApiEmployeeAttendanceRoster {
  date: string;
  people: ApiEmployeeAttendanceRosterPerson[];
}

export interface ApiFee {
  id: string;
  school_id: string;
  student_id: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_on: string | null;
  fee_type: string;
  discount: number;
  fine: number;
  receipt_no: string | null;
  paid_amount: number;
  fee_structure_id?: string | null;
  academic_year_id?: string | null;
  class_id?: string | null;
  total_fee?: number;
  outstanding_amount?: number;
  overdue_amount?: number;
  calculated_status?: string;
}

export interface ApiFeeStructure {
  id: string;
  school_id: string;
  class_id: string | null;
  fee_type: string;
  amount: number;
  session: string | null;
  academic_year_id?: string | null;
  category?: string;
  frequency?: string;
  due_date?: string | null;
  status?: string;
  description?: string | null;
}

export interface ApiExam {
  id: string;
  school_id: string;
  subject: string | null;
  class_id: string | null;
  date: string | null;
  status: string;
  term: string;
  academic_year_id?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
  name?: string | null;
  exam_type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  maximum_marks?: number | null;
  passing_marks?: number | null;
  room_id?: string | null;
  instructions?: string | null;
}

export interface ApiResult {
  id: string;
  school_id: string;
  student_id: string;
  exam_id: string | null;
  marks: number | null;
  max_marks: number;
  grade: string | null;
  published_at: string;
  attendance_status?: "PRESENT" | "ABSENT" | "NOT_APPLICABLE";
  remarks?: string | null;
  passing_marks?: number;
  exam_status?: string;
}

export interface ApiHomework {
  id: string;
  school_id: string;
  class_id: string | null;
  subject: string | null;
  subject_id?: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  assigned_date?: string | null;
  teacher_id: string | null;
  submission_id?: string | null;
  submission_status?: string | null;
  submission_file_name?: string | null;
  submission_note?: string | null;
  submission_feedback?: string | null;
  submission_grade?: string | null;
  submission_submitted_at?: string | null;
}

export interface ApiHomeworkSubmission {
  id: string;
  school_id: string;
  homework_id: string;
  student_id: string;
  student_name?: string;
  file_name: string | null;
  note: string | null;
  status: string;
  submitted_at: string;
  feedback: string | null;
  grade: string | null;
}

export interface ApiNotice {
  id: string;
  school_id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string | null;
  audience: string | null;
  date: string | null;
  author: string | null;
  read?: boolean;
}

export interface ApiLibraryBook {
  id: string;
  school_id: string;
  title: string;
  author: string | null;
  status: string;
}

export interface ApiLibraryRecord {
  id: string;
  school_id: string;
  book_id: string;
  student_id: string;
  issued_on: string | null;
  returned_on: string | null;
}

export interface ApiVehicle {
  id: string;
  school_id: string;
  number: string | null;
  route: string | null;
  driver: string | null;
  driver_phone?: string | null;
  pickup_time?: string | null;
  drop_time?: string | null;
  pickup_point?: string | null;
  drop_point?: string | null;
  capacity: number;
  status: "On Route" | "Idle" | "Maintenance";
  stops: { name: string; time: string }[];
  occupied: number;
}

export interface ApiHoliday {
  id: string;
  school_id: string;
  name: string;
  date: string;
  day: string | null;
  type: string | null;
  session: string | null;
}

export interface ApiSchoolEvent {
  id: string;
  school_id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  category: string;
  description: string;
}

export interface ApiNotification {
  id: string;
  school_id: string;
  user_id: string;
  category: string;
  title: string;
  body: string | null;
  read: boolean | number;
  created_at: string;
}

export type AdmissionStage =
  | "ENQUIRY"
  | "APPLICATION"
  | "DOCUMENT_VERIFICATION"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "WAITLISTED"
  | "CONVERTED";

export interface ApiAdmission {
  id: string;
  school_id: string;
  application_no: string | null;
  applicant: string;
  dob: string | null;
  gender: string | null;
  address: string | null;
  class_applied: string | null;
  section_applied: string | null;
  class_id_applied: string | null;
  academic_year: string | null;
  academic_year_id: string | null;
  parent_name: string | null;
  parent_relation: string | null;
  previous_school: string | null;
  previous_class: string | null;
  previous_board: string | null;
  previous_percentage: string | null;
  applied_on: string | null;
  status: string;
  stage: AdmissionStage;
  contact_email: string | null;
  contact_phone: string | null;
  documents: string;
  notes: string | null;
  admission_no: string | null;
  converted_student_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiAdmissionDocument {
  id: string;
  school_id: string;
  admission_id: string;
  name: string;
  doc_type: string | null;
  file_data: string | null;
  file_mime: string | null;
  status: "Pending" | "Verified" | "Rejected";
  remarks: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
  verified_by_name: string | null;
  verified_at: string | null;
}

export interface ApiAdmissionNote {
  id: string;
  school_id: string;
  admission_id: string;
  author_id: string | null;
  author_name: string | null;
  note: string;
  created_at: string;
}

export interface ApiAdmissionStatusHistory {
  id: string;
  school_id: string;
  admission_id: string;
  from_stage: string | null;
  to_stage: string;
  remarks: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

export interface ApiAdmissionDetail extends ApiAdmission {
  documentsList: ApiAdmissionDocument[];
  notesList: ApiAdmissionNote[];
  history: ApiAdmissionStatusHistory[];
}

export interface ApiAdmissionDuplicateMatch {
  type: "admission" | "student" | "parent";
  id: string;
  label: string;
}

export interface ApiCertificate {
  id: string;
  school_id: string;
  student_id: string;
  type: string;
  issued_on: string;
  issued_by: string | null;
}

export interface ApiTeacherAttendance {
  id: string;
  school_id: string;
  teacher_id: string;
  date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  remarks: string | null;
  person_name?: string;
  employee_id?: string | null;
  department?: string | null;
  employment_status?: string;
}

export interface ApiStaffAttendance {
  id: string;
  school_id: string;
  staff_id: string;
  date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  remarks: string | null;
  person_name?: string;
  employee_id?: string | null;
  department?: string | null;
  employment_status?: string;
}

export interface ApiTimetableSlot {
  id: string;
  school_id: string;
  class_id: string | null;
  day: string;
  period: number;
  subject: string | null;
  subject_id?: string | null;
  teacher_id: string | null;
  room: string | null;
  room_id?: string | null;
}

export interface ApiLeaveRequest {
  id: string;
  school_id: string;
  requester_type: string;
  requester_id: string;
  from_date: string | null;
  to_date: string | null;
  reason: string | null;
  status: string;
}

export interface ApiSchool {
  id: string;
  name: string;
  short_name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  session: string | null;
  status: string;
  plan: string;
  billing_cycle: string | null;
  payment_status: string | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  logo_url: string | null;
  code: string | null;
  website: string | null;
  principal: string | null;
  board: string | null;
  affiliation: string | null;
  created_at: string;
  admin: { id: string; name: string; email: string } | null;
}

export interface ApiPlan {
  id: string;
  name: string;
  price: number;
  billing_cycle: string;
  status: string;
}

export interface ApiLead {
  id: string;
  school_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface ApiSupportTicket {
  id: string;
  school_id: string | null;
  school_name: string | null;
  subject: string;
  message: string | null;
  priority: string;
  status: string;
  created_at: string;
}

export interface ApiAnnouncement {
  id: string;
  title: string;
  body: string | null;
  audience: string;
  created_at: string;
}

export interface ApiPayment {
  id: string;
  school_id: string;
  school_name: string | null;
  amount: number;
  method: string | null;
  plan: string | null;
  paid_on: string;
  created_at: string;
}

export interface ApiSchoolAdmin {
  id: string;
  name: string;
  email: string;
  status: string;
  school_id: string;
  school_name: string;
  created_at: string;
}

export interface ApiPlanFeature {
  feature_key: string;
  enabled: boolean;
}

export interface ApiAuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target: string | null;
  details: string | null;
  created_at: string;
}

// Hooks -----------------------------------------------------------------

function useApiQuery<T>(key: string, path: string, enabled = true) {
  return useQuery<T>({
    queryKey: [key, path],
    queryFn: () => api.get<T>(path),
    enabled,
  });
}

export const useStudents = (
  enabled = true,
  filters?: {
    q?: string;
    academicYearId?: string;
    classId?: string;
    className?: string;
    section?: string;
    status?: string;
  },
) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) if (value) params.set(key, value);
  const suffix = params.toString();
  return useApiQuery<ApiStudent[]>("students", `/students${suffix ? `?${suffix}` : ""}`, enabled);
};
export const useStudent = (id: string | undefined) =>
  useApiQuery<ApiStudent>(`student-${id}`, `/students/${id}`, Boolean(id));
export const useMyStudentProfile = (enabled = true) =>
  useApiQuery<ApiStudent>("student-me", "/students/me", enabled);
export const useMyTeacherProfile = (enabled = true) =>
  useApiQuery<ApiTeacher>("teacher-me", "/teachers/me", enabled);
export const useHomeworkSubmissions = (homeworkId: string | undefined) =>
  useApiQuery<ApiHomeworkSubmission[]>(
    `homework-submissions-all-${homeworkId}`,
    `/homework-submissions?homeworkId=${homeworkId}`,
    Boolean(homeworkId),
  );
export const useClassLeave = (enabled = true) =>
  useApiQuery<ApiLeaveRequest[]>("leave-class-students", "/leave?scope=class-students", enabled);
export const useMyHomeworkSubmissions = (homeworkId: string | undefined) =>
  useApiQuery<ApiHomeworkSubmission[]>(
    `homework-submissions-${homeworkId}`,
    `/homework-submissions?homeworkId=${homeworkId}`,
    Boolean(homeworkId),
  );
export const useHolidays = (enabled = true) =>
  useApiQuery<ApiHoliday[]>("holidays", "/holidays", enabled);
export const useEvents = (enabled = true) =>
  useApiQuery<ApiSchoolEvent[]>("events", "/events", enabled);
export const useNotifications = (enabled = true) =>
  useApiQuery<ApiNotification[]>("notifications", "/notifications", enabled);
export const useMyTransport = (enabled = true) =>
  useApiQuery<ApiVehicle | null>("transport-mine", "/transport/mine", enabled);
export const useTeachers = (
  enabled = true,
  filters?: { q?: string; department?: string; status?: string },
) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters ?? {})) if (v) p.set(k, v);
  const q = p.toString();
  return useApiQuery<ApiTeacher[]>("teachers", `/teachers${q ? `?${q}` : ""}`, enabled);
};
export const useParents = (enabled = true) =>
  useApiQuery<ApiParent[]>("parents", "/parents", enabled);
export const useStaff = (
  enabled = true,
  filters?: { q?: string; department?: string; status?: string },
) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters ?? {})) if (v) p.set(k, v);
  const q = p.toString();
  return useApiQuery<ApiStaff[]>("staff", `/staff${q ? `?${q}` : ""}`, enabled);
};
export const useClasses = (enabled = true) =>
  useApiQuery<ApiClass[]>("classes", "/classes", enabled);
export const useSubjects = (enabled = true) =>
  useApiQuery<ApiSubject[]>("subjects", "/subjects", enabled);
export const useSubjectMappings = (
  filters?: { classId?: string; teacherId?: string; subjectId?: string },
  enabled = true,
) => {
  const params = new URLSearchParams();
  if (filters?.classId) params.set("classId", filters.classId);
  if (filters?.teacherId) params.set("teacherId", filters.teacherId);
  if (filters?.subjectId) params.set("subjectId", filters.subjectId);
  const queryStr = params.toString() ? `?${params.toString()}` : "";
  return useApiQuery<ApiClassSubjectMapping[]>(
    `subject-mappings-${filters?.classId ?? "all"}-${filters?.teacherId ?? "all"}-${filters?.subjectId ?? "all"}`,
    `/subjects/mappings${queryStr}`,
    enabled,
  );
};
export const useMyTeacherTeachingSubjects = (enabled = true) =>
  useApiQuery<ApiTeacherTeachingSubject[]>(
    "my-teaching-subjects",
    "/subjects/my-teaching",
    enabled,
  );
export const useMyStudentClassSubjects = (enabled = true) =>
  useApiQuery<ApiStudentClassSubject[]>("my-class-subjects", "/subjects/my-class", enabled);
export const useRooms = (enabled = true) => useApiQuery<ApiRoom[]>("rooms", "/rooms", enabled);
export const useAcademicYears = (enabled = true) =>
  useApiQuery<ApiAcademicYear[]>("academic-years", "/academic-years", enabled);
type AttendanceFilters = {
  date?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  month?: string | undefined;
  classId?: string | undefined;
  section?: string | undefined;
  studentId?: string | undefined;
  status?: string | undefined;
  academicYearId?: string | undefined;
  q?: string | undefined;
};
const qs = (filters?: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters ?? {})) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};
export const useAttendance = (enabled = true, filters?: AttendanceFilters) =>
  useApiQuery<ApiAttendance[]>("attendance", `/attendance${qs(filters)}`, enabled);
export const useAttendanceRoster = (classId: string | undefined, date: string, enabled = true) =>
  useApiQuery<ApiAttendanceRoster>(
    `attendance-roster-${classId ?? "none"}-${date}`,
    `/attendance/roster?classId=${classId}&date=${date}`,
    Boolean(classId) && enabled,
  );
export const useAttendanceSummary = (filters: AttendanceFilters, enabled = true) =>
  useApiQuery<ApiAttendanceSummary>(
    "attendance-summary",
    `/attendance/summary${qs(filters)}`,
    enabled,
  );
export const useTeacherAttendanceRoster = (date: string, department?: string, enabled = true) =>
  useApiQuery<ApiEmployeeAttendanceRoster>(
    `teacher-attendance-roster-${date}-${department ?? "all"}`,
    `/teacher-attendance/roster${qs({ date, department })}`,
    enabled,
  );
export const useStaffAttendanceRoster = (date: string, department?: string, enabled = true) =>
  useApiQuery<ApiEmployeeAttendanceRoster>(
    `staff-attendance-roster-${date}-${department ?? "all"}`,
    `/staff-attendance/roster${qs({ date, department })}`,
    enabled,
  );
export const useFees = (enabled = true) => useApiQuery<ApiFee[]>("fees", "/fees", enabled);
export const useExams = (enabled = true) => useApiQuery<ApiExam[]>("exams", "/exams", enabled);
export const useResults = (enabled = true) =>
  useApiQuery<ApiResult[]>("results", "/results", enabled);
export const useHomework = (enabled = true) =>
  useApiQuery<ApiHomework[]>("homework", "/homework", enabled);
export const useNotices = (enabled = true) =>
  useApiQuery<ApiNotice[]>("notices", "/notices", enabled);
export const useLibraryBooks = (enabled = true) =>
  useApiQuery<ApiLibraryBook[]>("library-books", "/library/books", enabled);
export const useLibraryRecords = (enabled = true) =>
  useApiQuery<ApiLibraryRecord[]>("library-records", "/library/records", enabled);
export const useTransport = (enabled = true) =>
  useApiQuery<ApiVehicle[]>("transport", "/transport", enabled);
export const useAdmissions = (enabled = true) =>
  useApiQuery<ApiAdmission[]>("admissions", "/admissions", enabled);
export const useAdmissionDetail = (id: string | undefined, enabled = true) =>
  useApiQuery<ApiAdmissionDetail>(
    `admission-${id ?? "none"}`,
    `/admissions/${id}`,
    Boolean(id) && enabled,
  );
export const useTimetable = (enabled = true) =>
  useApiQuery<ApiTimetableSlot[]>("timetable", "/timetable", enabled);
export const useLeaveRequests = (type?: "STUDENT" | "TEACHER" | "STAFF", enabled = true) =>
  useApiQuery<ApiLeaveRequest[]>(
    `leave-${type ?? "all"}`,
    type ? `/leave?type=${type}` : "/leave",
    enabled,
  );
export const useFeeStructures = (enabled = true) =>
  useApiQuery<ApiFeeStructure[]>("fee-structures", "/fee-structures", enabled);
export const useCertificates = (studentId?: string, enabled = true) =>
  useApiQuery<ApiCertificate[]>(
    `certificates-${studentId ?? "all"}`,
    studentId ? `/certificates?studentId=${studentId}` : "/certificates",
    enabled,
  );
type EmployeeAttendanceFilters = {
  date?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  month?: string | undefined;
  department?: string | undefined;
  status?: string | undefined;
  teacherId?: string | undefined;
  staffId?: string | undefined;
};
export const useTeacherAttendance = (enabled = true, filters?: EmployeeAttendanceFilters) =>
  useApiQuery<ApiTeacherAttendance[]>(
    "teacher-attendance",
    `/teacher-attendance${qs(filters)}`,
    enabled,
  );
export const useStaffAttendance = (enabled = true, filters?: EmployeeAttendanceFilters) =>
  useApiQuery<ApiStaffAttendance[]>("staff-attendance", `/staff-attendance${qs(filters)}`, enabled);
export const useSchoolProfile = (enabled = true) =>
  useApiQuery<ApiSchool>("school-profile", "/school-profile", enabled);
export const useSchools = (enabled = true) =>
  useApiQuery<ApiSchool[]>("schools", "/schools", enabled);
export const useSchool = (id: string | undefined) =>
  useApiQuery<ApiSchool>(`school-${id}`, `/schools/${id}`, Boolean(id));
export const usePlans = (enabled = true) => useApiQuery<ApiPlan[]>("plans", "/plans", enabled);
export const useLeads = (enabled = true) => useApiQuery<ApiLead[]>("leads", "/leads", enabled);
export const useSupportTickets = (enabled = true) =>
  useApiQuery<ApiSupportTicket[]>("support-tickets", "/support", enabled);
export const useAnnouncements = (enabled = true) =>
  useApiQuery<ApiAnnouncement[]>("announcements", "/announcements", enabled);
export const usePayments = (enabled = true) =>
  useApiQuery<ApiPayment[]>("payments", "/payments", enabled);
export const useSchoolAdmins = (enabled = true) =>
  useApiQuery<ApiSchoolAdmin[]>("school-admins", "/school-admins", enabled);
export const usePlanFeatures = (planId: string | undefined) =>
  useApiQuery<ApiPlanFeature[]>(
    `plan-features-${planId}`,
    `/plans/${planId}/features`,
    Boolean(planId),
  );
export const useAuditLog = (enabled = true) =>
  useApiQuery<ApiAuditLogEntry[]>("audit-log", "/audit", enabled);

export interface ApiUser {
  id: string;
  role: "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "STAFF" | "PARENT" | "STUDENT";
  department: string | null;
  name: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED";
  linked_teacher_id: string | null;
  linked_parent_id: string | null;
  linked_student_id: string | null;
  created_at: string;
}

export type Role = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "STAFF" | "PARENT" | "STUDENT";
export type StaffDepartment = "ADMIN" | "ACCOUNTS" | "LIBRARY" | "TRANSPORT";

export interface ApiRolePermissionSet {
  role: Role;
  department: StaffDepartment | null;
  permissions: string[];
  customized: boolean;
  defaultPermissions: string[];
}

export interface ApiRolesResponse {
  permissions: string[];
  editableRoles: Role[];
  roles: ApiRolePermissionSet[];
  schoolAdminPermissions: string[];
}

export const useUsers = (enabled = true) => useApiQuery<ApiUser[]>("users", "/users", enabled);
export const useRoles = (enabled = true) =>
  useApiQuery<ApiRolesResponse>("roles", "/roles", enabled);

// Parent Portal — per-child scoped variants. Additive only; existing hooks above are
// untouched so Teacher/Student/Admin pages that use them are unaffected. -----------

export const useAttendanceFor = (studentId?: string) =>
  useApiQuery<ApiAttendance[]>(
    `attendance-${studentId ?? "none"}`,
    `/attendance${studentId ? `?studentId=${studentId}` : ""}`,
    Boolean(studentId),
  );
export const useTimetableFor = (studentId?: string) =>
  useApiQuery<ApiTimetableSlot[]>(
    `timetable-${studentId ?? "none"}`,
    `/timetable${studentId ? `?studentId=${studentId}` : ""}`,
    Boolean(studentId),
  );
export const useHomeworkFor = (studentId?: string) =>
  useApiQuery<ApiHomework[]>(
    `homework-${studentId ?? "none"}`,
    `/homework${studentId ? `?studentId=${studentId}` : ""}`,
    Boolean(studentId),
  );
export const useExamsFor = (studentId?: string) =>
  useApiQuery<ApiExam[]>(
    `exams-${studentId ?? "none"}`,
    `/exams${studentId ? `?studentId=${studentId}` : ""}`,
    Boolean(studentId),
  );
export const useResultsFor = (studentId?: string) =>
  useApiQuery<ApiResult[]>(
    `results-${studentId ?? "none"}`,
    `/results${studentId ? `?studentId=${studentId}` : ""}`,
    Boolean(studentId),
  );
export const useFeesFor = (studentId?: string) =>
  useApiQuery<ApiFee[]>(
    `fees-${studentId ?? "none"}`,
    `/fees${studentId ? `?studentId=${studentId}` : ""}`,
    Boolean(studentId),
  );
export const useLeaveRequestsForChild = (studentId?: string) =>
  useApiQuery<ApiLeaveRequest[]>(
    `leave-child-${studentId ?? "none"}`,
    `/leave${studentId ? `?studentId=${studentId}` : ""}`,
    Boolean(studentId),
  );
export const useTransportFor = (studentId?: string) =>
  useApiQuery<ApiVehicle | null>(
    `transport-${studentId ?? "none"}`,
    `/transport/mine${studentId ? `?studentId=${studentId}` : ""}`,
    Boolean(studentId),
  );
