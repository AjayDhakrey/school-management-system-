import { makeEmployeeAttendanceRouter } from "./employee-attendance.js";

export const staffAttendanceRouter = makeEmployeeAttendanceRouter({
  table: "staff_attendance",
  fkCol: "staff_id",
  entityTable: "staff",
  role: "STAFF",
  linkedIdKey: "linkedStaffId",
  bodyIdKey: "staffId",
  perms: {
    view: "staff_attendance.view",
    manage: "staff_attendance.manage",
    self: "staff_attendance.self",
  },
  auditKind: "staff_attendance",
  label: "Staff",
});
