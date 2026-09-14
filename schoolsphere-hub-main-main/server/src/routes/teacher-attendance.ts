import { makeEmployeeAttendanceRouter } from "./employee-attendance.js";

export const teacherAttendanceRouter = makeEmployeeAttendanceRouter({
  table: "teacher_attendance",
  fkCol: "teacher_id",
  entityTable: "teachers",
  role: "TEACHER",
  linkedIdKey: "linkedTeacherId",
  bodyIdKey: "teacherId",
  perms: {
    view: "teacher_attendance.view",
    manage: "teacher_attendance.manage",
    self: "teacher_attendance.self",
  },
  auditKind: "teacher_attendance",
  label: "Teacher",
});
