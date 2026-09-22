import type { AuthUser, BackendRole, StaffDepartment } from "./auth-context";

/**
 * Frontend mirror of server/src/permissions.ts (module-level view permissions only).
 * Used to decide which dashboard widgets to fetch/render — the server is still the
 * enforcement point; this just avoids firing requests the user will get a 403 for.
 */
const ROLE_VIEW_PERMISSIONS: Record<BackendRole, string[]> = {
  SUPER_ADMIN: ["schools"],
  SCHOOL_ADMIN: ["students", "teachers", "staff", "parents", "classes", "admissions", "homework", "fees", "results", "notices"],
  TEACHER: ["students", "classes", "subjects", "homework", "results", "notices", "timetable"],
  STAFF: [],
  PARENT: ["students", "results", "homework", "fees", "notices", "timetable"],
  STUDENT: ["results", "homework", "fees", "notices", "timetable"],
};

const STAFF_DEPARTMENT_VIEW_PERMISSIONS: Record<Exclude<StaffDepartment, null>, string[]> = {
  ADMIN: ["students", "admissions", "notices"],
  ACCOUNTS: ["fees", "notices"],
  LIBRARY: ["library", "notices"],
  TRANSPORT: ["transport", "notices"],
};

export function canView(user: AuthUser | null, module: string): boolean {
  if (!user) return false;
  if (user.role === "STAFF") {
    return user.department ? STAFF_DEPARTMENT_VIEW_PERMISSIONS[user.department].includes(module) : false;
  }
  return ROLE_VIEW_PERMISSIONS[user.role].includes(module);
}
