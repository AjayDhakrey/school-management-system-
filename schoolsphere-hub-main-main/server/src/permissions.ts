export type Role =
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN"
  | "TEACHER"
  | "STAFF"
  | "PARENT"
  | "STUDENT";

export type StaffDepartment = "ADMIN" | "ACCOUNTS" | "LIBRARY" | "TRANSPORT";

export const PERMISSIONS = [
  "schools.view",
  "schools.manage",
  "students.view",
  "students.create",
  "students.update",
  "students.delete",
  "teachers.view",
  "teachers.create",
  "teachers.update",
  "teachers.delete",
  "staff.view",
  "staff.create",
  "staff.update",
  "staff.delete",
  "parents.view",
  "parents.create",
  "parents.update",
  "classes.view",
  "classes.manage",
  "academic_years.view",
  "academic_years.manage",
  "subjects.view",
  "subjects.manage",
  "attendance.view",
  "attendance.create",
  "attendance.update",
  "fees.view",
  "fees.create",
  "fees.update",
  "admissions.view",
  "admissions.manage",
  "exams.view",
  "exams.manage",
  "results.view",
  "results.manage",
  "homework.view",
  "homework.create",
  "homework.update",
  "notices.view",
  "notices.manage",
  "library.view",
  "library.manage",
  "transport.view",
  "transport.manage",
  "timetable.view",
  "timetable.manage",
  "rooms.view",
  "rooms.manage",
  "leave.view",
  "leave.manage",
  "settings.manage",
  "certificates.view",
  "certificates.manage",
  "fee_structures.view",
  "fee_structures.manage",
  "teacher_attendance.view",
  "teacher_attendance.manage",
  "staff_attendance.view",
  "staff_attendance.manage",
  "fees.pay",
  "homework.submit",
  "holidays.view",
  "holidays.manage",
  "notifications.view",
  "homework.delete",
  "teacher_attendance.self",
  "staff_attendance.self",
  "users.view",
  "users.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_SCHOOL_PERMISSIONS = PERMISSIONS.filter((p) => !p.startsWith("schools."));

// Base permission set granted to every role, keyed by role.
// STAFF departments narrow this further (see STAFF_DEPARTMENT_PERMISSIONS).
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: ["schools.view", "schools.manage"],
  SCHOOL_ADMIN: ALL_SCHOOL_PERMISSIONS,
  TEACHER: [
    "academic_years.view",
    "students.view",
    "teachers.view",
    "classes.view",
    "subjects.view",
    "attendance.view",
    "attendance.create",
    "attendance.update",
    "homework.view",
    "homework.create",
    "homework.update",
    "homework.delete",
    "exams.view",
    "results.view",
    "results.manage",
    "notices.view",
    "timetable.view",
    "library.view",
    "leave.view",
    "teacher_attendance.view",
    "teacher_attendance.self",
    "holidays.view",
    "notifications.view",
  ],
  STAFF: [], // resolved per-department at request time
  PARENT: [
    "academic_years.view",
    "students.view",
    "parents.view",
    "attendance.view",
    "results.view",
    "exams.view",
    "homework.view",
    "timetable.view",
    "fees.view",
    "fees.pay",
    "notices.view",
    "library.view",
    "transport.view",
    "certificates.view",
    "holidays.view",
    "notifications.view",
    "leave.view",
  ],
  STUDENT: [
    "academic_years.view",
    "attendance.view",
    "results.view",
    "exams.view",
    "homework.view",
    "homework.submit",
    "timetable.view",
    "fees.view",
    "fees.pay",
    "notices.view",
    "library.view",
    "certificates.view",
    "parents.view",
    "transport.view",
    "leave.view",
    "holidays.view",
    "notifications.view",
    "teachers.view",
    "subjects.view",
  ],
};

export const STAFF_DEPARTMENT_PERMISSIONS: Record<StaffDepartment, readonly Permission[]> = {
  ADMIN: [
    "students.view",
    "students.create",
    "students.update",
    "admissions.view",
    "admissions.manage",
    "leave.view",
    "staff_attendance.view",
    "staff_attendance.self",
    "holidays.view",
    "notifications.view",
  ],
  ACCOUNTS: [
    "fees.view",
    "fees.create",
    "fees.update",
    "fees.pay",
    "fee_structures.view",
    "fee_structures.manage",
    "leave.view",
    "staff_attendance.view",
    "staff_attendance.self",
    "holidays.view",
    "notifications.view",
  ],
  LIBRARY: [
    "library.view",
    "library.manage",
    "leave.view",
    "staff_attendance.view",
    "staff_attendance.self",
    "holidays.view",
    "notifications.view",
  ],
  TRANSPORT: [
    "transport.view",
    "transport.manage",
    "leave.view",
    "staff_attendance.view",
    "staff_attendance.self",
    "holidays.view",
    "notifications.view",
  ],
};

export function permissionsFor(role: Role, department?: StaffDepartment | null): readonly Permission[] {
  if (role === "STAFF") {
    return department ? STAFF_DEPARTMENT_PERMISSIONS[department] : [];
  }
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  role: Role,
  department: StaffDepartment | null | undefined,
  permission: Permission,
): boolean {
  return permissionsFor(role, department).includes(permission);
}
