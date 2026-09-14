import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { hasEffectivePermission } from "../rolePermissions.js";
import {
  assertParentOwnsStudent,
  classTeacherClassIds,
  inClause,
  notify,
  parentChildIds,
  studentClassId,
} from "./helpers.js";

export const leaveRouter = Router();
leaveRouter.use(authenticate);

const REQUESTER_TYPES = ["STUDENT", "TEACHER", "STAFF"];
const DECISION_STATUSES = ["Approved", "Rejected"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

leaveRouter.get("/", authorize("leave.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const user = req.user!;
  const { type } = req.query;

  if (user.role === "TEACHER") {
    // A Class Teacher can separately pull their class's student leave requests — never merged
    // into their own leave list above.
    if (req.query.scope === "class-students") {
      const classIds = await classTeacherClassIds(user.linkedTeacherId);
      if (classIds.length === 0) return res.json([]);
      const { sql: classSql, params: classParams } = inClause(classIds);
      const studentIds = (
        (await db
          .prepare(`SELECT id FROM students WHERE school_id = ? AND class_id ${classSql}`)
          .all(schoolId, ...classParams)) as {
          id: string;
        }[]
      ).map((s) => s.id);
      if (studentIds.length === 0) return res.json([]);
      const { sql, params } = inClause(studentIds);
      return res.json(
        await db
          .prepare(
            `SELECT * FROM leave_requests WHERE school_id = ? AND requester_type = 'STUDENT' AND requester_id ${sql} ORDER BY from_date DESC`,
          )
          .all(schoolId, ...params),
      );
    }
    return res.json(
      await db
        .prepare(
          "SELECT * FROM leave_requests WHERE school_id = ? AND requester_type = 'TEACHER' AND requester_id = ? ORDER BY from_date DESC",
        )
        .all(schoolId, user.linkedTeacherId),
    );
  }
  if (user.role === "STAFF") {
    return res.json(
      await db
        .prepare(
          "SELECT * FROM leave_requests WHERE school_id = ? AND requester_type = 'STAFF' AND requester_id = ? ORDER BY from_date DESC",
        )
        .all(schoolId, user.id),
    );
  }
  if (user.role === "STUDENT") {
    return res.json(
      await db
        .prepare(
          "SELECT * FROM leave_requests WHERE school_id = ? AND requester_type = 'STUDENT' AND requester_id = ? ORDER BY from_date DESC",
        )
        .all(schoolId, user.linkedStudentId),
    );
  }
  if (user.role === "PARENT") {
    const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
    const ids =
      studentId && (await assertParentOwnsStudent(user, studentId))
        ? [studentId]
        : await parentChildIds(user.linkedParentId);
    if (ids.length === 0) return res.json([]);
    const { sql, params } = inClause(ids);
    return res.json(
      await db
        .prepare(
          `SELECT * FROM leave_requests WHERE school_id = ? AND requester_type = 'STUDENT' AND requester_id ${sql} ORDER BY from_date DESC`,
        )
        .all(schoolId, ...params),
    );
  }

  if (typeof type === "string" && REQUESTER_TYPES.includes(type)) {
    return res.json(
      await db
        .prepare(
          "SELECT * FROM leave_requests WHERE school_id = ? AND requester_type = ? ORDER BY from_date DESC",
        )
        .all(schoolId, type),
    );
  }
  res.json(
    await db
      .prepare("SELECT * FROM leave_requests WHERE school_id = ? ORDER BY from_date DESC")
      .all(schoolId),
  );
});

leaveRouter.post("/", authorize("leave.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const user = req.user!;
  const { fromDate, toDate, reason, requesterType, studentId } = req.body ?? {};

  let type: string;
  let requesterId: string;

  if (user.role === "TEACHER") {
    type = "TEACHER";
    requesterId = user.linkedTeacherId ?? "";
  } else if (user.role === "STAFF") {
    type = "STAFF";
    requesterId = user.id;
  } else if (user.role === "SCHOOL_ADMIN") {
    // School Admin raises student leave requests on the school's behalf.
    if (requesterType !== "STUDENT" || typeof studentId !== "string" || !studentId.trim()) {
      return res.status(400).json({ error: "requesterType 'STUDENT' and studentId are required" });
    }
    type = "STUDENT";
    requesterId = studentId;
  } else if (user.role === "PARENT") {
    // A parent raises a leave request on behalf of one of their own linked children only.
    if (
      requesterType !== "STUDENT" ||
      typeof studentId !== "string" ||
      !(await assertParentOwnsStudent(user, studentId))
    ) {
      return res.status(400).json({
        error: "requesterType 'STUDENT' and a valid studentId (your own child) are required",
      });
    }
    type = "STUDENT";
    requesterId = studentId;
  } else if (user.role === "STUDENT") {
    type = "STUDENT";
    requesterId = user.linkedStudentId ?? "";
  } else {
    return res.status(403).json({ error: "Not permitted to request leave" });
  }

  if (!requesterId)
    return res.status(409).json({ error: "User account is not linked to a requester profile" });
  if (
    typeof fromDate !== "string" ||
    typeof toDate !== "string" ||
    !ISO_DATE.test(fromDate) ||
    !ISO_DATE.test(toDate) ||
    Number.isNaN(Date.parse(`${fromDate}T00:00:00Z`)) ||
    Number.isNaN(Date.parse(`${toDate}T00:00:00Z`)) ||
    fromDate > toDate
  )
    return res.status(400).json({ error: "A valid date range is required" });
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000)
    return res
      .status(400)
      .json({ error: "reason is required and must be at most 1000 characters" });
  if (type === "STUDENT") {
    const student = await db
      .prepare("SELECT id FROM students WHERE id = ? AND school_id = ?")
      .get(requesterId, schoolId);
    if (!student) return res.status(404).json({ error: "Student not found" });
  }

  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO leave_requests (id, school_id, requester_type, requester_id, from_date, to_date, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, schoolId, type, requesterId, fromDate, toDate, reason.trim());
  res.status(201).json({ id });
});

leaveRouter.patch("/:id", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const user = req.user!;
  const existing = (await db
    .prepare(
      "SELECT id, requester_type, requester_id, status FROM leave_requests WHERE id = ? AND school_id = ?",
    )
    .get(req.params.id, schoolId)) as
    { id: string; requester_type: string; requester_id: string; status: string } | undefined;
  if (!existing) return res.status(404).json({ error: "Leave request not found" });

  const hasGlobalManage = await hasEffectivePermission(
    user.schoolId,
    user.role,
    user.department,
    "leave.manage",
  );
  const isClassTeacherOfRequester =
    user.role === "TEACHER" &&
    existing.requester_type === "STUDENT" &&
    (await classTeacherClassIds(user.linkedTeacherId)).includes(
      (await studentClassId(existing.requester_id)) ?? "",
    );
  // Approving/rejecting a student's leave is otherwise admin-only (leave.manage) — a Class Teacher
  // gets a narrow carve-out limited to students in the class(es) they are the Class Teacher of.
  if (!hasGlobalManage && !isClassTeacherOfRequester) {
    return res.status(403).json({ error: "Not permitted to update this leave request" });
  }

  const { status } = req.body ?? {};
  if (typeof status !== "string" || !DECISION_STATUSES.includes(status))
    return res.status(400).json({ error: `status must be one of ${DECISION_STATUSES.join(", ")}` });
  if (existing.status !== "Pending")
    return res.status(409).json({ error: "Only pending leave requests can be decided" });
  await db
    .prepare("UPDATE leave_requests SET status = ? WHERE id = ? AND school_id = ?")
    .run(status, req.params.id, schoolId);

  const row = (await db
    .prepare("SELECT requester_type, requester_id FROM leave_requests WHERE id = ?")
    .get(req.params.id)) as { requester_type: string; requester_id: string } | undefined;
  if (row?.requester_type === "STUDENT") {
    const student = (await db
      .prepare("SELECT id FROM users WHERE linked_student_id = ? AND school_id = ?")
      .get(row.requester_id, schoolId)) as { id: string } | undefined;
    if (student)
      notify(
        schoolId,
        student.id,
        "Leave",
        "Leave request updated",
        `Your leave request was ${String(status).toLowerCase()}.`,
      );
  } else if (row?.requester_type === "TEACHER") {
    const teacherUser = (await db
      .prepare("SELECT id FROM users WHERE linked_teacher_id = ? AND school_id = ?")
      .get(row.requester_id, schoolId)) as { id: string } | undefined;
    if (teacherUser)
      notify(
        schoolId,
        teacherUser.id,
        "Leave",
        "Leave request updated",
        `Your leave request was ${String(status).toLowerCase()}.`,
      );
  } else if (row?.requester_type === "STAFF") {
    // requester_id IS the user id for STAFF (see POST above), no lookup needed.
    notify(
      schoolId,
      row.requester_id,
      "Leave",
      "Leave request updated",
      `Your leave request was ${String(status).toLowerCase()}.`,
    );
  }
  res.json({ ok: true });
});
