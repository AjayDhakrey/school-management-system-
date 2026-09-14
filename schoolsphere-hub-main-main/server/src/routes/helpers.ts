import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import type { Request } from "express";
import type { AuthUser } from "../middleware/auth.js";

export const FEATURE_KEYS = [
  "Attendance",
  "Fees",
  "Exams",
  "Homework",
  "Library",
  "Transport",
  "Timetable",
  "Admissions",
] as const;

/**
 * Maps a teacher/staff employment_status to the users.status their linked login should carry.
 * ACTIVE and ON_LEAVE keep portal access (an employee on leave is still an employee); every other
 * state (INACTIVE, SUSPENDED, ARCHIVED) suspends the login so authenticate() rejects its tokens.
 */
export function loginStatusFor(employmentStatus: string): "ACTIVE" | "SUSPENDED" {
  return ["ACTIVE", "ON_LEAVE"].includes(String(employmentStatus).toUpperCase())
    ? "ACTIVE"
    : "SUSPENDED";
}

/** Records one row in audit_log for a Super Admin action. Never throws — logging must not break the request. */
export async function logAudit(
  req: Request,
  action: string,
  target?: string | null,
  details?: string | null,
) {
  try {
    const actor = req.user;
    const actorName = actor
      ? ((
          (await db.prepare("SELECT name FROM users WHERE id = ?").get(actor.id)) as
            { name: string } | undefined
        )?.name ?? null)
      : null;
    await db
      .prepare(
        `INSERT INTO audit_log (id, actor_id, actor_name, action, target, details) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), actor?.id ?? null, actorName, action, target ?? null, details ?? null);
  } catch {
    // best-effort only
  }
}

/** Records a notification for a user. Never throws — must not break the calling request. */
export async function notify(
  schoolId: string,
  userId: string,
  category: string,
  title: string,
  body?: string | null,
) {
  try {
    await db
      .prepare(
        `INSERT INTO notifications (id, school_id, user_id, category, title, body) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), schoolId, userId, category, title, body ?? null);
  } catch {
    // best-effort only
  }
}

export async function studentClassId(studentId: string | null) {
  if (!studentId) return null;
  const row = (await db.prepare("SELECT class_id FROM students WHERE id = ?").get(studentId)) as
    { class_id: string | null } | undefined;
  return row?.class_id ?? null;
}

export async function parentChildIds(parentId: string | null) {
  if (!parentId) return [];
  const rows = (await db
    .prepare("SELECT student_id FROM student_guardians WHERE parent_id = ?")
    .all(parentId)) as { student_id: string }[];
  return rows.map((row) => row.student_id);
}

/**
 * Resolves via await parentChildIds() (the single source of truth for parent->children,
 * see parents.ts /link and /unlink) rather than querying students.parent_id directly —
 * a student can have more than one linked guardian, and only linked_student_ids
 * reliably reflects all of them.
 */
export async function parentChildClassIds(parentId: string | null) {
  const ids = await parentChildIds(parentId);
  if (ids.length === 0) return [];
  const { sql, params } = inClause(ids);
  const rows = (await db
    .prepare(`SELECT class_id FROM students WHERE id ${sql}`)
    .all(...params)) as {
    class_id: string | null;
  }[];
  return rows.map((r) => r.class_id).filter((c): c is string => Boolean(c));
}

/**
 * Keeps parents.linked_student_ids in sync when a student's primary parent_id is changed
 * directly (e.g. School Admin editing a student record) — removes the student from the old
 * parent's linked list and adds it to the new one, so await parentChildIds()-based views never
 * drift from the students.parent_id column.
 */
export async function syncParentLink(
  oldParentId: string | null,
  newParentId: string | null,
  studentId: string,
) {
  if (oldParentId && oldParentId !== newParentId) {
    await db
      .prepare("DELETE FROM student_guardians WHERE parent_id = ? AND student_id = ?")
      .run(oldParentId, studentId);
    const oldLinked = await parentChildIds(oldParentId);
    await db
      .prepare("UPDATE parents SET linked_student_ids = ? WHERE id = ?")
      .run(JSON.stringify(oldLinked), oldParentId);
  }
  if (newParentId && newParentId !== oldParentId) {
    const parent = (await db
      .prepare("SELECT school_id FROM parents WHERE id = ?")
      .get(newParentId)) as { school_id: string } | undefined;
    const student = (await db
      .prepare("SELECT school_id FROM students WHERE id = ?")
      .get(studentId)) as { school_id: string } | undefined;
    if (!parent || !student || parent.school_id !== student.school_id)
      throw new Error("Invalid cross-school guardian relationship");
    await db
      .prepare(
        `INSERT OR IGNORE INTO student_guardians
      (id, school_id, student_id, parent_id, relationship, is_primary) VALUES (?, ?, ?, ?, 'Guardian', 1)`,
      )
      .run(randomUUID(), student.school_id, studentId, newParentId);
    await db
      .prepare(
        "UPDATE student_guardians SET is_primary = CASE WHEN parent_id = ? THEN 1 ELSE 0 END WHERE student_id = ?",
      )
      .run(newParentId, studentId);
    const newLinked = await parentChildIds(newParentId);
    await db
      .prepare("UPDATE parents SET linked_student_ids = ? WHERE id = ?")
      .run(JSON.stringify(newLinked), newParentId);
  }
}

export async function teacherAssignedClasses(teacherId: string | null) {
  if (!teacherId) return [];
  const mapped = (await db
    .prepare("SELECT DISTINCT class_id FROM class_subjects WHERE teacher_id = ?")
    .all(teacherId)) as {
    class_id: string;
  }[];
  if (mapped.length > 0) return mapped.map((r) => r.class_id);

  // Fallback to legacy JSON column if no class_subjects records exist yet
  const row = (await db
    .prepare("SELECT assigned_classes FROM teachers WHERE id = ?")
    .get(teacherId)) as { assigned_classes: string } | undefined;
  return row ? (JSON.parse(row.assigned_classes) as string[]) : [];
}

export async function teacherAssignedSubjects(teacherId: string | null) {
  if (!teacherId) return [];
  const mapped = (await db
    .prepare("SELECT DISTINCT subject_id FROM class_subjects WHERE teacher_id = ?")
    .all(teacherId)) as {
    subject_id: string;
  }[];
  if (mapped.length > 0) return mapped.map((r) => r.subject_id);

  // Fallback to legacy JSON column if no class_subjects records exist yet
  const row = (await db
    .prepare("SELECT assigned_subjects FROM teachers WHERE id = ?")
    .get(teacherId)) as { assigned_subjects: string } | undefined;
  return row ? (JSON.parse(row.assigned_subjects) as string[]) : [];
}

/** Classes where this teacher is the assigned Class Teacher (classes.class_teacher_id). */
export async function classTeacherClassIds(teacherId: string | null) {
  if (!teacherId) return [];
  const rows = (await db
    .prepare("SELECT id FROM classes WHERE class_teacher_id = ?")
    .all(teacherId)) as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Returns a SQL IN-clause fragment + params for the class ids a given user
 * may see on class-scoped resources (homework, timetable, exams-by-class).
 * SCHOOL_ADMIN/STAFF get null (meaning: no extra filter, full school scope).
 */
export async function classScopeForUser(user: AuthUser) {
  if (user.role === "TEACHER") {
    const ids = new Set([
      ...(await teacherAssignedClasses(user.linkedTeacherId)),
      ...(await classTeacherClassIds(user.linkedTeacherId)),
    ]);
    return { classIds: [...ids] };
  }
  if (user.role === "PARENT") return { classIds: await parentChildClassIds(user.linkedParentId) };
  if (user.role === "STUDENT") {
    const cid = await studentClassId(user.linkedStudentId);
    return { classIds: cid ? [cid] : [] };
  }
  return { classIds: null };
}

/** True only if studentId is one of this parent's own linked children — never trust a client-supplied studentId without this check. */
export async function assertParentOwnsStudent(
  user: AuthUser,
  studentId: string | undefined | null,
) {
  if (!studentId) return false;
  return (await parentChildIds(user.linkedParentId)).includes(studentId);
}

/**
 * Every call site uses this as `<column> ${sql}` (e.g. "class_id IN (?,?)"), so the empty
 * case must still be a syntactically valid fragment there — "IN (NULL)" always evaluates to
 * false/unknown without producing "<column> 1 = 0" (invalid SQL — bare boolean expressions
 * can't follow a column name).
 */
export function inClause(values: string[]): { sql: string; params: string[] } {
  if (values.length === 0) return { sql: "IN (NULL)", params: [] };
  return { sql: `IN (${values.map(() => "?").join(",")})`, params: values };
}
