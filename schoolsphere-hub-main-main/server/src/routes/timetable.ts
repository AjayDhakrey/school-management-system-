import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import {
  assertParentOwnsStudent,
  classScopeForUser,
  inClause,
  logAudit,
  studentClassId,
} from "./helpers.js";

export const timetableRouter = Router();
timetableRouter.use(authenticate);

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function conflictError(message: unknown): string | null {
  const msg = message instanceof Error ? message.message : "";
  if (msg.includes("uq_timetable_class_slot"))
    return "This class already has a period scheduled at that day and time";
  if (msg.includes("uq_timetable_teacher_slot"))
    return "This teacher is already scheduled at that day and time";
  if (msg.includes("uq_timetable_room_slot"))
    return "This room is already booked at that day and time";
  return null;
}

/** Resolves the subject/room text the existing UI sends into their authoritative row ids.
 * subject is picked from a fixed dropdown (or the literal "Break") so an unmatched name is
 * rejected outright; room additionally supports free typing for a pre-existing, unregistered
 * name (see AssignSlotDialog's own comment), so it's resolved best-effort and never rejected. */
async function resolveSubject(
  schoolId: string,
  subject: unknown,
): Promise<{ error: string } | { subjectId: string | null }> {
  if (typeof subject !== "string" || !subject.trim() || subject === "Break")
    return { subjectId: null };
  const row = (await db
    .prepare("SELECT id FROM subjects WHERE school_id = ? AND lower(name) = lower(?)")
    .get(schoolId, subject.trim())) as { id: string } | undefined;
  if (!row) return { error: "Unknown subject" };
  return { subjectId: row.id };
}
async function resolveRoom(schoolId: string, room: unknown): Promise<string | null> {
  if (typeof room !== "string" || !room.trim()) return null;
  const row = (await db
    .prepare("SELECT id FROM rooms WHERE school_id = ? AND lower(name) = lower(?)")
    .get(schoolId, room.trim())) as { id: string } | undefined;
  return row?.id ?? null;
}

timetableRouter.get("/", authorize("timetable.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  let { classIds } = await classScopeForUser(req.user!);
  // A parent selecting one specific (owned) child sees only that child's class, not every
  // linked child's classes merged together.
  if (
    req.user!.role === "PARENT" &&
    typeof req.query.studentId === "string" &&
    (await assertParentOwnsStudent(req.user!, req.query.studentId))
  ) {
    const cid = await studentClassId(req.query.studentId);
    classIds = cid ? [cid] : [];
  }
  if (classIds === null) {
    return res.json(
      await db
        .prepare("SELECT * FROM timetable_slots WHERE school_id = ? ORDER BY day, period")
        .all(schoolId),
    );
  }
  const { sql, params } = inClause(classIds);
  res.json(
    await db
      .prepare(
        `SELECT * FROM timetable_slots WHERE school_id = ? AND class_id ${sql} ORDER BY day, period`,
      )
      .all(schoolId, ...params),
  );
});

timetableRouter.post("/", authorize("timetable.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { classId, day, period, subject, teacherId, room } = req.body ?? {};
  if (!classId || !day || typeof period !== "number" || !Number.isInteger(period) || period < 1) {
    return res.status(400).json({ error: "classId, day and a valid period are required" });
  }
  if (!DAYS.includes(day)) return res.status(400).json({ error: "Invalid day" });

  const klass = (await db
    .prepare("SELECT id FROM classes WHERE id = ? AND school_id = ?")
    .get(classId, schoolId)) as { id: string } | undefined;
  if (!klass) return res.status(400).json({ error: "Class not found in this school" });

  if (teacherId) {
    const teacher = (await db
      .prepare("SELECT id FROM teachers WHERE id = ? AND school_id = ?")
      .get(teacherId, schoolId)) as { id: string } | undefined;
    if (!teacher) return res.status(400).json({ error: "Teacher not found in this school" });
  }

  const subjectResult = await resolveSubject(schoolId, subject);
  if ("error" in subjectResult) return res.status(400).json({ error: subjectResult.error });
  const roomId = await resolveRoom(schoolId, room);

  const id = randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO timetable_slots (id, school_id, class_id, day, period, subject, subject_id, teacher_id, room, room_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        schoolId,
        classId,
        day,
        period,
        subject ?? null,
        subjectResult.subjectId,
        teacherId ?? null,
        room ?? null,
        roomId,
      );
  } catch (e) {
    const conflict = conflictError(e);
    if (conflict) return res.status(409).json({ error: conflict });
    throw e;
  }
  await logAudit(
    req,
    "timetable.created",
    id,
    JSON.stringify({ classId, day, period, subject: subject ?? null }),
  );
  res.status(201).json({ id });
});

timetableRouter.patch("/:id", authorize("timetable.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare("SELECT * FROM timetable_slots WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as
    | {
        class_id: string | null;
        day: string;
        period: number;
        subject: string | null;
        teacher_id: string | null;
        room: string | null;
      }
    | undefined;
  if (!existing) return res.status(404).json({ error: "Timetable slot not found" });

  const body = req.body ?? {};
  const classId = body.classId !== undefined ? body.classId : existing.class_id;
  const day = body.day !== undefined ? body.day : existing.day;
  const period = body.period !== undefined ? body.period : existing.period;
  const teacherId = body.teacherId !== undefined ? body.teacherId : existing.teacher_id;
  const subject = body.subject !== undefined ? body.subject : existing.subject;
  const room = body.room !== undefined ? body.room : existing.room;

  if (body.day !== undefined && !DAYS.includes(day))
    return res.status(400).json({ error: "Invalid day" });
  if (
    body.period !== undefined &&
    (typeof period !== "number" || !Number.isInteger(period) || period < 1)
  ) {
    return res.status(400).json({ error: "Invalid period" });
  }
  if (body.classId !== undefined) {
    if (!classId) return res.status(400).json({ error: "classId cannot be cleared" });
    const klass = await db
      .prepare("SELECT id FROM classes WHERE id = ? AND school_id = ?")
      .get(classId, schoolId);
    if (!klass) return res.status(400).json({ error: "Class not found in this school" });
  }
  if (body.teacherId !== undefined && teacherId) {
    const teacher = await db
      .prepare("SELECT id FROM teachers WHERE id = ? AND school_id = ?")
      .get(teacherId, schoolId);
    if (!teacher) return res.status(400).json({ error: "Teacher not found in this school" });
  }
  let subjectId: string | null | undefined;
  if (body.subject !== undefined) {
    const subjectResult = await resolveSubject(schoolId, subject);
    if ("error" in subjectResult) return res.status(400).json({ error: subjectResult.error });
    subjectId = subjectResult.subjectId;
  }
  let roomId: string | null | undefined;
  if (body.room !== undefined) {
    roomId = await resolveRoom(schoolId, room);
  }

  const sets = [
    "class_id = ?",
    "day = ?",
    "period = ?",
    "teacher_id = ?",
    "subject = ?",
    "room = ?",
    "updated_at = app_now()",
  ];
  const params: unknown[] = [
    classId,
    day,
    period,
    teacherId ?? null,
    subject ?? null,
    room ?? null,
  ];
  if (subjectId !== undefined) {
    sets.push("subject_id = ?");
    params.push(subjectId);
  }
  if (roomId !== undefined) {
    sets.push("room_id = ?");
    params.push(roomId);
  }
  params.push(req.params.id, schoolId);

  try {
    await db
      .prepare(`UPDATE timetable_slots SET ${sets.join(", ")} WHERE id = ? AND school_id = ?`)
      .run(...params);
  } catch (e) {
    const conflict = conflictError(e);
    if (conflict) return res.status(409).json({ error: conflict });
    throw e;
  }
  await logAudit(req, "timetable.updated", req.params.id);
  res.json({ ok: true });
});

timetableRouter.delete("/:id", authorize("timetable.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const result = await db
    .prepare("DELETE FROM timetable_slots WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  if (result.changes === 0) return res.status(404).json({ error: "Timetable slot not found" });
  await logAudit(req, "timetable.deleted", req.params.id);
  res.json({ ok: true });
});
