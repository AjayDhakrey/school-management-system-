import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { classScopeForUser, inClause } from "./helpers.js";

export const classesRouter = Router();
classesRouter.use(authenticate);

interface ClassRow {
  id: string;
  name: string;
  section: string;
  class_teacher_id: string | null;
  academic_year_id: string | null;
  room_id: string | null;
  status: string;
}

const selectClass = `SELECT c.*, ay.name AS academic_year_name, r.name AS room_name, t.name AS class_teacher_name
  FROM classes c LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
  LEFT JOIN rooms r ON r.id = c.room_id LEFT JOIN teachers t ON t.id = c.class_teacher_id`;

async function owned(
  table: "teachers" | "rooms" | "academic_years",
  id: unknown,
  schoolId: string,
) {
  if (id === null || id === undefined || id === "") return true;
  return (
    typeof id === "string" &&
    Boolean(
      await db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND school_id = ?`).get(id, schoolId),
    )
  );
}

async function activeYear(schoolId: string) {
  const row = (await db
    .prepare("SELECT id FROM academic_years WHERE school_id = ? AND status = 'ACTIVE'")
    .get(schoolId)) as { id: string } | undefined;
  return row?.id ?? null;
}

classesRouter.get("/", authorize("classes.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { classIds } = await classScopeForUser(req.user!);
  if (classIds === null)
    return res.json(
      await db
        .prepare(`${selectClass} WHERE c.school_id = ? ORDER BY c.name, c.section`)
        .all(schoolId),
    );
  const { sql, params } = inClause(classIds);
  res.json(
    await db
      .prepare(`${selectClass} WHERE c.school_id = ? AND c.id ${sql} ORDER BY c.name, c.section`)
      .all(schoolId, ...params),
  );
});

classesRouter.get("/:id", authorize("classes.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { classIds } = await classScopeForUser(req.user!);
  if (classIds !== null && !classIds.includes(req.params.id))
    return res.status(404).json({ error: "Class not found" });
  const row = await db
    .prepare(`${selectClass} WHERE c.id = ? AND c.school_id = ?`)
    .get(req.params.id, schoolId);
  if (!row) return res.status(404).json({ error: "Class not found" });
  res.json(row);
});

classesRouter.post("/", authorize("classes.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, section, classTeacherId, roomId } = req.body ?? {};
  const academicYearId = req.body?.academicYearId ?? (await activeYear(schoolId));
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 80 ||
    typeof section !== "string" ||
    !section.trim() ||
    section.length > 30
  )
    return res
      .status(400)
      .json({ error: "name and section are required and must be within allowed lengths" });
  if (
    !academicYearId ||
    !(await owned("academic_years", academicYearId, schoolId)) ||
    !(await owned("teachers", classTeacherId, schoolId)) ||
    !(await owned("rooms", roomId, schoolId))
  )
    return res
      .status(400)
      .json({ error: "Academic year, teacher, or room does not belong to this school" });
  const duplicate = await db
    .prepare(
      "SELECT 1 FROM classes WHERE school_id = ? AND academic_year_id = ? AND lower(name) = lower(?) AND lower(section) = lower(?) AND status = 'ACTIVE'",
    )
    .get(schoolId, academicYearId, name.trim(), section.trim());
  if (duplicate)
    return res
      .status(409)
      .json({ error: "This class and section already exists for the academic year" });
  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO classes (id, school_id, name, section, class_teacher_id, academic_year_id, room_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      schoolId,
      name.trim(),
      section.trim(),
      classTeacherId || null,
      academicYearId,
      roomId || null,
    );
  res.status(201).json({ id });
});

classesRouter.patch("/:id", authorize("classes.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare("SELECT * FROM classes WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as ClassRow | undefined;
  if (!existing) return res.status(404).json({ error: "Class not found" });
  const name = req.body?.name ?? existing.name,
    section = req.body?.section ?? existing.section;
  const classTeacherId =
    req.body?.classTeacherId === undefined ? existing.class_teacher_id : req.body.classTeacherId;
  const academicYearId =
    req.body?.academicYearId === undefined ? existing.academic_year_id : req.body.academicYearId;
  const roomId = req.body?.roomId === undefined ? existing.room_id : req.body.roomId;
  const status = req.body?.status ?? existing.status;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 80 ||
    typeof section !== "string" ||
    !section.trim() ||
    section.length > 30 ||
    !["ACTIVE", "ARCHIVED"].includes(status)
  )
    return res.status(400).json({ error: "Invalid class values" });
  if (
    !academicYearId ||
    !(await owned("academic_years", academicYearId, schoolId)) ||
    !(await owned("teachers", classTeacherId, schoolId)) ||
    !(await owned("rooms", roomId, schoolId))
  )
    return res
      .status(400)
      .json({ error: "Academic year, teacher, or room does not belong to this school" });
  const duplicate = await db
    .prepare(
      "SELECT 1 FROM classes WHERE school_id = ? AND academic_year_id = ? AND lower(name) = lower(?) AND lower(section) = lower(?) AND status = 'ACTIVE' AND id <> ?",
    )
    .get(schoolId, academicYearId, name.trim(), section.trim(), req.params.id);
  if (status === "ACTIVE" && duplicate)
    return res
      .status(409)
      .json({ error: "This class and section already exists for the academic year" });
  await db
    .prepare(
      "UPDATE classes SET name = ?, section = ?, class_teacher_id = ?, academic_year_id = ?, room_id = ?, status = ? WHERE id = ? AND school_id = ?",
    )
    .run(
      name.trim(),
      section.trim(),
      classTeacherId || null,
      academicYearId,
      roomId || null,
      status,
      req.params.id,
      schoolId,
    );
  res.json({ ok: true });
});

classesRouter.delete("/:id", authorize("classes.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (
    !(await db
      .prepare("SELECT 1 FROM classes WHERE id = ? AND school_id = ?")
      .get(req.params.id, schoolId))
  )
    return res.status(404).json({ error: "Class not found" });
  const references = [
    ["students", "class_id"],
    ["class_subjects", "class_id"],
    ["attendance", "class_id"],
    ["fee_structures", "class_id"],
    ["exams", "class_id"],
    ["homework", "class_id"],
    ["timetable_slots", "class_id"],
    ["admissions", "class_id_applied"],
  ] as const;
  for (const [table, column] of references) {
    if (
      await db
        .prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? AND school_id = ? LIMIT 1`)
        .get(req.params.id, schoolId)
    )
      return res
        .status(409)
        .json({ error: "Class/section is in use; archive it instead of deleting it" });
  }
  await db
    .prepare("DELETE FROM classes WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  res.json({ ok: true });
});
