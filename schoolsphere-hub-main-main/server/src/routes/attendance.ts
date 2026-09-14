import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import {
  assertParentOwnsStudent,
  classScopeForUser,
  classTeacherClassIds,
  inClause,
  logAudit,
  parentChildIds,
} from "./helpers.js";
import {
  holidayOn,
  normalizeStatus,
  recomputeStudentAttendance,
  summarize,
  validateAttendanceDate,
} from "./attendance-helpers.js";

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

const MAX_REMARKS = 300;

/** Row-level scope for reads, layered on top of the school_id filter. null = no extra filter (admin). */
async function scopeForView(user: NonNullable<Express.Request["user"]>, studentId?: string) {
  if (user.role === "STUDENT") {
    return { where: "a.student_id = ?", params: [user.linkedStudentId] };
  }
  if (user.role === "PARENT") {
    const ids =
      studentId && (await assertParentOwnsStudent(user, studentId))
        ? [studentId]
        : await parentChildIds(user.linkedParentId);
    const { sql, params } = inClause(ids);
    return { where: `a.student_id ${sql}`, params };
  }
  if (user.role === "TEACHER") {
    const { classIds } = await classScopeForUser(user);
    const { sql, params } = inClause(classIds ?? []);
    return { where: `a.class_id ${sql}`, params };
  }
  return null; // SCHOOL_ADMIN
}

/** Confirms a class belongs to the school; for a TEACHER also that they are its Class Teacher. */
async function assertClassWritable(
  user: NonNullable<Express.Request["user"]>,
  schoolId: string,
  classId: string,
) {
  const row = (await db
    .prepare("SELECT id, academic_year_id FROM classes WHERE id = ? AND school_id = ?")
    .get(classId, schoolId)) as { id: string; academic_year_id: string | null } | undefined;
  if (!row) return { error: "Class not found", status: 404 };
  if (
    user.role === "TEACHER" &&
    !(await classTeacherClassIds(user.linkedTeacherId)).includes(classId)
  ) {
    return { error: "Only the Class Teacher can mark attendance for this class", status: 403 };
  }
  return { academicYearId: row.academic_year_id };
}

const SELECT_LIST = `
  SELECT a.*, s.name AS student_name, s.admission_no, s.roll AS student_roll,
         c.name AS class_name, c.section AS section
  FROM attendance a
  JOIN students s ON s.id = a.student_id
  LEFT JOIN classes c ON c.id = a.class_id`;

attendanceRouter.get("/", authorize("attendance.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const q = req.query;
  const scope = await scopeForView(
    req.user!,
    typeof q.studentId === "string" ? q.studentId : undefined,
  );

  const where = ["a.school_id = ?"];
  const params: unknown[] = [schoolId];
  if (scope) {
    where.push(scope.where);
    params.push(...scope.params);
  }
  if (typeof q.studentId === "string" && q.studentId) {
    where.push("a.student_id = ?");
    params.push(q.studentId);
  }
  if (typeof q.classId === "string" && q.classId) {
    where.push("a.class_id = ?");
    params.push(q.classId);
  }
  if (typeof q.academicYearId === "string" && q.academicYearId) {
    where.push("a.academic_year_id = ?");
    params.push(q.academicYearId);
  }
  if (typeof q.section === "string" && q.section) {
    where.push("lower(c.section) = lower(?)");
    params.push(q.section);
  }
  if (typeof q.status === "string" && normalizeStatus(q.status)) {
    where.push("a.status = ?");
    params.push(normalizeStatus(q.status));
  }
  if (typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
    where.push("a.date = ?");
    params.push(q.date);
  }
  if (typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month)) {
    where.push("a.date LIKE ?");
    params.push(`${q.month}-%`);
  }
  if (typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) {
    where.push("a.date >= ?");
    params.push(q.from);
  }
  if (typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) {
    where.push("a.date <= ?");
    params.push(q.to);
  }
  if (typeof q.q === "string" && q.q.trim()) {
    where.push(
      "(lower(s.name) LIKE lower(?) OR lower(coalesce(s.admission_no, '')) LIKE lower(?))",
    );
    params.push(`%${q.q.trim()}%`, `%${q.q.trim()}%`);
  }
  res.json(
    await db
      .prepare(`${SELECT_LIST} WHERE ${where.join(" AND ")} ORDER BY a.date DESC, s.roll, s.name`)
      .all(...params),
  );
});

/** The class register for one day: every currently-enrolled student + their saved status for that date. */
attendanceRouter.get("/roster", authorize("attendance.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { classId, date } = req.query;
  if (typeof classId !== "string" || !classId)
    return res.status(400).json({ error: "classId is required" });
  const dateCheck = validateAttendanceDate(date);
  if ("error" in dateCheck) return res.status(400).json({ error: dateCheck.error });

  const cls = await assertClassWritable(req.user!, schoolId, classId);
  if ("error" in cls) return res.status(cls.status ?? 400).json({ error: cls.error });

  const students = await db
    .prepare(
      `SELECT s.id, s.name, s.roll, s.admission_no,
              at.id AS attendance_id, at.status, at.remarks
       FROM students s
       LEFT JOIN attendance at ON at.student_id = s.id AND at.date = ? AND at.school_id = ?
       WHERE s.class_id = ? AND s.school_id = ? AND s.status = 'Active'
       ORDER BY s.roll, s.name`,
    )
    .all(dateCheck.date, schoolId, classId, schoolId);

  res.json({
    classId,
    date: dateCheck.date,
    academicYearId: cls.academicYearId,
    holiday: await holidayOn(schoolId, dateCheck.date),
    students,
  });
});

attendanceRouter.get("/summary", authorize("attendance.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const q = req.query;
  const scope = await scopeForView(
    req.user!,
    typeof q.studentId === "string" ? q.studentId : undefined,
  );

  const where = ["a.school_id = ?"];
  const params: unknown[] = [schoolId];
  if (scope) {
    where.push(scope.where);
    params.push(...scope.params);
  }
  for (const [key, col] of [
    ["studentId", "a.student_id"],
    ["classId", "a.class_id"],
    ["academicYearId", "a.academic_year_id"],
  ] as const) {
    if (typeof q[key] === "string" && q[key]) {
      where.push(`${col} = ?`);
      params.push(q[key]);
    }
  }
  if (typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) {
    where.push("a.date >= ?");
    params.push(q.from);
  }
  if (typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) {
    where.push("a.date <= ?");
    params.push(q.to);
  }
  const rows = (await db
    .prepare(`SELECT a.status FROM attendance a WHERE ${where.join(" AND ")}`)
    .all(...params)) as {
    status: string;
  }[];
  res.json(summarize(rows));
});

/** Mark/correct one student's attendance for one date — upsert, never a duplicate. */
attendanceRouter.post("/", authorize("attendance.create"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { studentId, date, status, remarks } = req.body ?? {};
  if (!studentId || typeof studentId !== "string")
    return res.status(400).json({ error: "studentId is required" });
  const dateCheck = validateAttendanceDate(date);
  if ("error" in dateCheck) return res.status(400).json({ error: dateCheck.error });
  const canonicalStatus = normalizeStatus(status);
  if (!canonicalStatus)
    return res.status(400).json({ error: "status must be one of Present, Absent, Late, Leave" });
  if (
    remarks !== undefined &&
    remarks !== null &&
    (typeof remarks !== "string" || remarks.length > MAX_REMARKS)
  ) {
    return res
      .status(400)
      .json({ error: `remarks must be a string of at most ${MAX_REMARKS} characters` });
  }

  const student = (await db
    .prepare("SELECT id, class_id, academic_year_id FROM students WHERE id = ? AND school_id = ?")
    .get(studentId, schoolId)) as
    { id: string; class_id: string | null; academic_year_id: string | null } | undefined;
  if (!student) return res.status(404).json({ error: "Student not found" });

  if (req.user!.role === "TEACHER") {
    const classIds = await classTeacherClassIds(req.user!.linkedTeacherId);
    if (!student.class_id || !classIds.includes(student.class_id)) {
      return res
        .status(403)
        .json({ error: "Only the Class Teacher can mark attendance for this student" });
    }
  }

  const existing = (await db
    .prepare("SELECT id FROM attendance WHERE school_id = ? AND student_id = ? AND date = ?")
    .get(schoolId, studentId, dateCheck.date)) as { id: string } | undefined;

  const id = existing?.id ?? randomUUID();
  await db
    .prepare(
      `INSERT INTO attendance (id, school_id, student_id, class_id, academic_year_id, date, status, remarks, marked_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(school_id, student_id, date) DO UPDATE SET
       status = excluded.status, remarks = excluded.remarks, class_id = excluded.class_id,
       academic_year_id = excluded.academic_year_id, marked_by = excluded.marked_by, updated_at = datetime('now')`,
    )
    .run(
      id,
      schoolId,
      studentId,
      student.class_id,
      student.academic_year_id,
      dateCheck.date,
      canonicalStatus,
      typeof remarks === "string" ? remarks : null,
      req.user!.id,
    );

  await recomputeStudentAttendance(studentId);
  await logAudit(
    req,
    existing ? "attendance.corrected" : "attendance.marked",
    studentId,
    `${dateCheck.date} → ${canonicalStatus}`,
  );

  const holiday = await holidayOn(schoolId, dateCheck.date);
  res.status(existing ? 200 : 201).json({
    id,
    ...(holiday ? { warning: `${dateCheck.date} is a holiday (${holiday.name})` } : {}),
  });
});

/** Mark a whole class for one date in a single transaction — all valid, or nothing written. */
attendanceRouter.post("/bulk", authorize("attendance.create"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { classId, date, entries } = req.body ?? {};
  if (typeof classId !== "string" || !classId || !Array.isArray(entries)) {
    return res.status(400).json({ error: "classId, date and entries[] are required" });
  }
  if (entries.length > 500)
    return res.status(400).json({ error: "Too many entries in one request" });
  const dateCheck = validateAttendanceDate(date);
  if ("error" in dateCheck) return res.status(400).json({ error: dateCheck.error });

  const cls = await assertClassWritable(req.user!, schoolId, classId);
  if ("error" in cls) return res.status(cls.status ?? 400).json({ error: cls.error });

  const enrolled = new Set(
    (
      (await db
        .prepare(
          "SELECT id FROM students WHERE class_id = ? AND school_id = ? AND status = 'Active'",
        )
        .all(classId, schoolId)) as {
        id: string;
      }[]
    ).map((s) => s.id),
  );

  // Validate the whole batch before any write (req: no partial saves on a bad batch).
  const clean: { studentId: string; status: string; remarks: string | null }[] = [];
  let skipped = 0;
  for (const entry of entries as { studentId?: unknown; status?: unknown; remarks?: unknown }[]) {
    const sid = entry?.studentId;
    if (typeof sid !== "string" || !enrolled.has(sid)) {
      skipped++; // stale/unknown roster id — filtered, not a batch failure
      continue;
    }
    const canonical = normalizeStatus(entry?.status);
    if (!canonical) return res.status(400).json({ error: `Invalid status for student ${sid}` });
    if (
      entry.remarks !== undefined &&
      entry.remarks !== null &&
      (typeof entry.remarks !== "string" || entry.remarks.length > MAX_REMARKS)
    ) {
      return res.status(400).json({ error: `remarks too long for student ${sid}` });
    }
    clean.push({
      studentId: sid,
      status: canonical,
      remarks: typeof entry.remarks === "string" ? entry.remarks : null,
    });
  }

  const upsert = await db.prepare(
    `INSERT INTO attendance (id, school_id, student_id, class_id, academic_year_id, date, status, remarks, marked_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(school_id, student_id, date) DO UPDATE SET
       status = excluded.status, remarks = excluded.remarks, class_id = excluded.class_id,
       academic_year_id = excluded.academic_year_id, marked_by = excluded.marked_by, updated_at = datetime('now')`,
  );
  try {
    await db.transaction(async () => {
      for (const e of clean) {
        const existingId = (
          (await db
            .prepare(
              "SELECT id FROM attendance WHERE school_id = ? AND student_id = ? AND date = ?",
            )
            .get(schoolId, e.studentId, dateCheck.date)) as { id: string } | undefined
        )?.id;
        upsert.run(
          existingId ?? randomUUID(),
          schoolId,
          e.studentId,
          classId,
          cls.academicYearId,
          dateCheck.date,
          e.status,
          e.remarks,
          req.user!.id,
        );
      }
    });
  } catch (err) {
    try {
      await db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    return res
      .status(409)
      .json({ error: err instanceof Error ? err.message : "Attendance could not be saved" });
  }

  for (const e of clean) await recomputeStudentAttendance(e.studentId);
  await logAudit(
    req,
    "attendance.bulk_marked",
    classId,
    `${dateCheck.date}: ${clean.length} saved, ${skipped} skipped`,
  );

  const holiday = await holidayOn(schoolId, dateCheck.date);
  res.json({
    ok: true,
    saved: clean.length,
    skipped,
    ...(holiday ? { warning: `${dateCheck.date} is a holiday (${holiday.name})` } : {}),
  });
});

attendanceRouter.patch("/:id", authorize("attendance.update"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare(
      "SELECT id, student_id, class_id, date, status FROM attendance WHERE id = ? AND school_id = ?",
    )
    .get(req.params.id, schoolId)) as
    | { id: string; student_id: string; class_id: string | null; date: string; status: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: "Attendance record not found" });

  if (req.user!.role === "TEACHER") {
    const classIds = await classTeacherClassIds(req.user!.linkedTeacherId);
    if (!classIds.includes(existing.class_id ?? "")) {
      return res
        .status(403)
        .json({ error: "Only the Class Teacher can edit attendance for this class" });
    }
  }

  const { status, remarks } = req.body ?? {};
  const canonicalStatus = status === undefined ? existing.status : normalizeStatus(status);
  if (!canonicalStatus)
    return res.status(400).json({ error: "status must be one of Present, Absent, Late, Leave" });
  if (
    remarks !== undefined &&
    remarks !== null &&
    (typeof remarks !== "string" || remarks.length > MAX_REMARKS)
  ) {
    return res
      .status(400)
      .json({ error: `remarks must be a string of at most ${MAX_REMARKS} characters` });
  }
  if (status === undefined && remarks === undefined) {
    return res.status(400).json({ error: "Nothing to update — pass status and/or remarks" });
  }

  const sets = ["status = ?", "updated_at = datetime('now')", "marked_by = ?"];
  const args: unknown[] = [canonicalStatus, req.user!.id];
  if (remarks !== undefined) {
    sets.splice(1, 0, "remarks = ?");
    args.splice(1, 0, typeof remarks === "string" ? remarks : null);
  }
  await db
    .prepare(`UPDATE attendance SET ${sets.join(", ")} WHERE id = ? AND school_id = ?`)
    .run(...args, req.params.id, schoolId);

  await recomputeStudentAttendance(existing.student_id);
  await logAudit(
    req,
    "attendance.corrected",
    existing.student_id,
    `${existing.date}: ${existing.status} → ${canonicalStatus}`,
  );
  res.json({ ok: true });
});
