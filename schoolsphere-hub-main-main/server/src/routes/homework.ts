import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import {
  assertParentOwnsStudent,
  classScopeForUser,
  inClause,
  logAudit,
  notify,
  teacherAssignedSubjects,
} from "./helpers.js";

export const homeworkRouter = Router();
homeworkRouter.use(authenticate);

const dateOk = (v: unknown) =>
  v == null ||
  v === "" ||
  (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));

homeworkRouter.get("/", authorize("homework.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { classIds } = await classScopeForUser(req.user!);

  if (req.user!.role === "STUDENT") {
    const { sql, params } = inClause(classIds ?? []);
    const rows = await db
      .prepare(
        `SELECT h.*, s.id AS submission_id, s.status AS submission_status, s.file_name AS submission_file_name,
                s.note AS submission_note, s.feedback AS submission_feedback, s.grade AS submission_grade,
                s.submitted_at AS submission_submitted_at
         FROM homework h
         LEFT JOIN homework_submissions s ON s.homework_id = h.id AND s.student_id = ?
         WHERE h.school_id = ? AND h.class_id ${sql} ORDER BY h.due_date`,
      )
      .all(req.user!.linkedStudentId, schoolId, ...params);
    return res.json(rows);
  }

  // A parent viewing one specific (owned) child gets the same submission-status join a student sees.
  if (
    req.user!.role === "PARENT" &&
    typeof req.query.studentId === "string" &&
    (await assertParentOwnsStudent(req.user!, req.query.studentId))
  ) {
    const { sql, params } = inClause(classIds ?? []);
    const rows = await db
      .prepare(
        `SELECT h.*, s.id AS submission_id, s.status AS submission_status, s.file_name AS submission_file_name,
                s.note AS submission_note, s.feedback AS submission_feedback, s.grade AS submission_grade,
                s.submitted_at AS submission_submitted_at
         FROM homework h
         LEFT JOIN homework_submissions s ON s.homework_id = h.id AND s.student_id = ?
         WHERE h.school_id = ? AND h.class_id ${sql} ORDER BY h.due_date`,
      )
      .all(req.query.studentId, schoolId, ...params);
    return res.json(rows);
  }

  if (classIds === null) {
    return res.json(
      await db
        .prepare("SELECT * FROM homework WHERE school_id = ? ORDER BY due_date")
        .all(schoolId),
    );
  }
  const { sql, params } = inClause(classIds);
  res.json(
    await db
      .prepare(`SELECT * FROM homework WHERE school_id = ? AND class_id ${sql} ORDER BY due_date`)
      .all(schoolId, ...params),
  );
});

homeworkRouter.post("/", authorize("homework.create"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { classId, subject, title, dueDate, description, assignedDate } = req.body ?? {};
  if (!classId || !title) return res.status(400).json({ error: "classId and title are required" });
  if (!dateOk(dueDate)) return res.status(400).json({ error: "Invalid due date" });
  if (!dateOk(assignedDate)) return res.status(400).json({ error: "Invalid assigned date" });

  const klass = (await db
    .prepare("SELECT id FROM classes WHERE id = ? AND school_id = ?")
    .get(classId, schoolId)) as { id: string } | undefined;
  if (!klass) return res.status(400).json({ error: "Class not found in this school" });

  if (req.user!.role === "TEACHER") {
    const { classIds } = await classScopeForUser(req.user!);
    if (!classIds?.includes(classId))
      return res.status(403).json({ error: "Not your assigned class" });
  }

  let subjectId: string | null = null;
  if (typeof subject === "string" && subject.trim()) {
    const subjectRow = (await db
      .prepare("SELECT id FROM subjects WHERE school_id = ? AND lower(name) = lower(?)")
      .get(schoolId, subject.trim())) as { id: string } | undefined;
    if (!subjectRow) return res.status(400).json({ error: "Unknown subject" });
    subjectId = subjectRow.id;
    if (req.user!.role === "TEACHER") {
      const mySubjects = await teacherAssignedSubjects(req.user!.linkedTeacherId);
      if (!mySubjects.includes(subjectId))
        return res.status(403).json({ error: "Not authorized to teach this subject" });
    }
  }

  const resolvedAssignedDate: string =
    typeof assignedDate === "string" && assignedDate
      ? assignedDate
      : new Date().toISOString().slice(0, 10);
  if (typeof dueDate === "string" && dueDate && dueDate < resolvedAssignedDate) {
    return res.status(400).json({ error: "Due date cannot be before the assigned date" });
  }

  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO homework (id, school_id, class_id, subject, subject_id, title, due_date, teacher_id, description, assigned_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      schoolId,
      classId,
      subject ?? null,
      subjectId,
      title,
      dueDate ?? null,
      req.user!.linkedTeacherId ?? null,
      description ?? null,
      resolvedAssignedDate,
    );

  const classStudents = (await db
    .prepare("SELECT id FROM students WHERE class_id = ? AND school_id = ?")
    .all(classId, schoolId)) as { id: string }[];
  for (const s of classStudents) {
    const studentUser = (await db
      .prepare("SELECT id FROM users WHERE linked_student_id = ? AND school_id = ?")
      .get(s.id, schoolId)) as { id: string } | undefined;
    if (studentUser) notify(schoolId, studentUser.id, "Homework", "New homework assigned", title);
  }

  await logAudit(
    req,
    "homework.created",
    id,
    JSON.stringify({ classId, subject: subject ?? null }),
  );
  res.status(201).json({ id });
});

homeworkRouter.patch("/:id", authorize("homework.update"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare(
      "SELECT id, teacher_id, due_date, assigned_date FROM homework WHERE id = ? AND school_id = ?",
    )
    .get(req.params.id, schoolId)) as
    | { id: string; teacher_id: string | null; due_date: string | null; assigned_date: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: "Homework not found" });
  if (req.user!.role === "TEACHER" && existing.teacher_id !== req.user!.linkedTeacherId) {
    return res.status(403).json({ error: "Not your homework" });
  }

  const { title, dueDate, subject, description, assignedDate } = req.body ?? {};
  if (!dateOk(dueDate)) return res.status(400).json({ error: "Invalid due date" });
  if (!dateOk(assignedDate)) return res.status(400).json({ error: "Invalid assigned date" });

  const effectiveDue = dueDate ?? existing.due_date;
  const effectiveAssigned = assignedDate ?? existing.assigned_date;
  if (effectiveDue && effectiveAssigned && effectiveDue < effectiveAssigned) {
    return res.status(400).json({ error: "Due date cannot be before the assigned date" });
  }

  // Matches the pre-existing COALESCE convention for every other field on this endpoint:
  // an omitted or empty value leaves the stored field untouched (no "clear" support here).
  let subjectId: string | null = null;
  if (typeof subject === "string" && subject.trim()) {
    const subjectRow = (await db
      .prepare("SELECT id FROM subjects WHERE school_id = ? AND lower(name) = lower(?)")
      .get(schoolId, subject.trim())) as { id: string } | undefined;
    if (!subjectRow) return res.status(400).json({ error: "Unknown subject" });
    subjectId = subjectRow.id;
    if (req.user!.role === "TEACHER") {
      const mySubjects = await teacherAssignedSubjects(req.user!.linkedTeacherId);
      if (!mySubjects.includes(subjectId))
        return res.status(403).json({ error: "Not authorized to teach this subject" });
    }
  }

  await db
    .prepare(
      `UPDATE homework SET
         title = COALESCE(?, title),
         due_date = COALESCE(?, due_date),
         subject = COALESCE(?, subject),
         subject_id = COALESCE(?, subject_id),
         description = COALESCE(?, description),
         assigned_date = COALESCE(?, assigned_date),
         updated_at = app_now()
       WHERE id = ? AND school_id = ?`,
    )
    .run(
      title ?? null,
      dueDate ?? null,
      subject ?? null,
      subjectId,
      description ?? null,
      assignedDate ?? null,
      req.params.id,
      schoolId,
    );
  await logAudit(req, "homework.updated", req.params.id);
  res.json({ ok: true });
});

homeworkRouter.delete("/:id", authorize("homework.delete"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare("SELECT id, teacher_id FROM homework WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as { id: string; teacher_id: string | null } | undefined;
  if (!existing) return res.status(404).json({ error: "Homework not found" });
  if (req.user!.role === "TEACHER" && existing.teacher_id !== req.user!.linkedTeacherId) {
    return res.status(403).json({ error: "Not your homework" });
  }
  await db.transaction(async () => {
    await db
      .prepare("DELETE FROM homework_submissions WHERE homework_id = ? AND school_id = ?")
      .run(req.params.id, schoolId);
    await db
      .prepare("DELETE FROM homework WHERE id = ? AND school_id = ?")
      .run(req.params.id, schoolId);
  });
  await logAudit(req, "homework.deleted", req.params.id);
  res.json({ ok: true });
});
