import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { studentClassId } from "./helpers.js";

export const subjectsRouter = Router();
subjectsRouter.use(authenticate);

async function mappingIdsBelongToSchool(
  schoolId: string,
  classId: unknown,
  subjectId: unknown,
  teacherId: unknown,
) {
  if (typeof classId !== "string" || typeof subjectId !== "string") return false;
  const classFound = await db
    .prepare("SELECT 1 FROM classes WHERE id = ? AND school_id = ? AND status = 'ACTIVE'")
    .get(classId, schoolId);
  const subjectFound = await db
    .prepare("SELECT 1 FROM subjects WHERE id = ? AND school_id = ? AND status = 'ACTIVE'")
    .get(subjectId, schoolId);
  const teacherFound =
    teacherId === null ||
    teacherId === undefined ||
    teacherId === "" ||
    (typeof teacherId === "string" &&
      (await db
        .prepare(
          "SELECT 1 FROM teachers WHERE id = ? AND school_id = ? AND employment_status = 'ACTIVE'",
        )
        .get(teacherId, schoolId)));
  return Boolean(classFound && subjectFound && teacherFound);
}

// ==========================================
// 1. Master Subject CRUD
// ==========================================

subjectsRouter.get("/", authorize("subjects.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  res.json(
    await db.prepare("SELECT * FROM subjects WHERE school_id = ? ORDER BY name").all(schoolId),
  );
});

subjectsRouter.post("/", authorize("subjects.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, code, type, credits, description, status } = req.body ?? {};
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 100 ||
    (code !== undefined && (typeof code !== "string" || code.length > 30)) ||
    (type !== undefined && (typeof type !== "string" || type.length > 30)) ||
    (credits !== undefined && (typeof credits !== "number" || credits < 0 || credits > 100)) ||
    (description !== undefined && (typeof description !== "string" || description.length > 1000))
  )
    return res.status(400).json({ error: "Invalid subject values" });
  const duplicate = await db
    .prepare(
      "SELECT 1 FROM subjects WHERE school_id = ? AND status = 'ACTIVE' AND (lower(name) = lower(?) OR (? IS NOT NULL AND lower(code) = lower(?)))",
    )
    .get(schoolId, name.trim(), code?.trim() || null, code?.trim() || null);
  if (duplicate) return res.status(409).json({ error: "Subject name or code already exists" });

  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO subjects (id, school_id, name, code, type, credits, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      schoolId,
      name.trim(),
      code?.trim() || null,
      type?.trim() || "Core",
      typeof credits === "number" ? credits : 3,
      description?.trim() || null,
    );
  res.status(201).json({ id });
});

subjectsRouter.patch("/:id", authorize("subjects.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const existing = await db
    .prepare("SELECT id FROM subjects WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!existing) return res.status(404).json({ error: "Subject not found" });

  const { name, code, type, credits, description, status } = req.body ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (typeof name === "string" && name.trim()) {
    updates.push("name = ?");
    params.push(name.trim());
  }
  if (code !== undefined) {
    updates.push("code = ?");
    params.push(code ? String(code).trim() : null);
  }
  if (type !== undefined) {
    updates.push("type = ?");
    params.push(type ? String(type).trim() : "Core");
  }
  if (credits !== undefined) {
    updates.push("credits = ?");
    params.push(typeof credits === "number" ? credits : Number(credits) || 3);
  }
  if (description !== undefined) {
    updates.push("description = ?");
    params.push(description ? String(description).trim() : null);
  }
  if (status !== undefined) {
    if (!["ACTIVE", "ARCHIVED"].includes(status))
      return res.status(400).json({ error: "status must be ACTIVE or ARCHIVED" });
    updates.push("status = ?");
    params.push(status);
  }

  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });

  params.push(req.params.id, schoolId);
  await db
    .prepare(`UPDATE subjects SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`)
    .run(...params);
  res.json({ ok: true });
});

subjectsRouter.delete("/:id", authorize("subjects.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  if (
    await db
      .prepare("SELECT 1 FROM class_subjects WHERE subject_id = ? AND school_id = ? LIMIT 1")
      .get(req.params.id, schoolId)
  )
    return res
      .status(409)
      .json({ error: "Subject is assigned to classes; remove assignments or archive it first" });
  const result = await db
    .prepare("DELETE FROM subjects WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  if (result.changes === 0) return res.status(404).json({ error: "Subject not found" });
  res.json({ ok: true });
});

// ==========================================
// 2. Class/Section + Subject + Teacher Mappings
// ==========================================

subjectsRouter.get("/mappings", authorize("subjects.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { classId, teacherId, subjectId } = req.query;
  const whereClauses = ["cs.school_id = ?"];
  const params: unknown[] = [schoolId];

  if (typeof classId === "string" && classId) {
    whereClauses.push("cs.class_id = ?");
    params.push(classId);
  }
  if (typeof teacherId === "string" && teacherId) {
    whereClauses.push("cs.teacher_id = ?");
    params.push(teacherId);
  }
  if (typeof subjectId === "string" && subjectId) {
    whereClauses.push("cs.subject_id = ?");
    params.push(subjectId);
  }

  const query = `
    SELECT 
      cs.id,
      cs.school_id,
      cs.class_id,
      cs.subject_id,
      cs.teacher_id,
      cs.created_at,
      c.name AS class_name,
      c.section AS section,
      s.name AS subject_name,
      s.code AS subject_code,
      s.type AS subject_type,
      s.credits AS subject_credits,
      s.description AS subject_description,
      t.name AS teacher_name,
      t.email AS teacher_email,
      t.phone AS teacher_phone
    FROM class_subjects cs
    JOIN classes c ON c.id = cs.class_id
    JOIN subjects s ON s.id = cs.subject_id
    LEFT JOIN teachers t ON t.id = cs.teacher_id
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY c.name, c.section, s.name
  `;

  res.json(await db.prepare(query).all(...params));
});

subjectsRouter.post("/mappings", authorize("subjects.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { classId, subjectId, teacherId } = req.body ?? {};
  if (!classId || !subjectId) {
    return res.status(400).json({ error: "classId and subjectId are required" });
  }
  if (!(await mappingIdsBelongToSchool(schoolId, classId, subjectId, teacherId)))
    return res
      .status(400)
      .json({ error: "Class, subject, or teacher does not belong to this school" });

  // Check if mapping already exists for this class and subject
  const existing = (await db
    .prepare(
      "SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ? AND school_id = ?",
    )
    .get(classId, subjectId, schoolId)) as { id: string } | undefined;

  if (existing) {
    // Update the teacher for existing mapping
    await db
      .prepare("UPDATE class_subjects SET teacher_id = ? WHERE id = ? AND school_id = ?")
      .run(teacherId ?? null, existing.id, schoolId);
    return res.json({ id: existing.id, updated: true });
  }

  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO class_subjects (id, school_id, class_id, subject_id, teacher_id)
     VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, schoolId, classId, subjectId, teacherId ?? null);

  res.status(201).json({ id });
});

subjectsRouter.patch("/mappings/:id", authorize("subjects.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const existing = await db
    .prepare("SELECT id FROM class_subjects WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!existing) return res.status(404).json({ error: "Mapping not found" });

  const { classId, subjectId, teacherId } = req.body ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  const current = (await db
    .prepare(
      "SELECT class_id, subject_id, teacher_id FROM class_subjects WHERE id = ? AND school_id = ?",
    )
    .get(req.params.id, schoolId)) as {
    class_id: string;
    subject_id: string;
    teacher_id: string | null;
  };
  const nextClassId = classId ?? current.class_id;
  const nextSubjectId = subjectId ?? current.subject_id;
  if (
    !(await mappingIdsBelongToSchool(
      schoolId,
      nextClassId,
      nextSubjectId,
      teacherId === undefined ? current.teacher_id : teacherId,
    ))
  )
    return res
      .status(400)
      .json({ error: "Class, subject, or teacher does not belong to this school" });
  if (
    await db
      .prepare(
        "SELECT 1 FROM class_subjects WHERE class_id = ? AND subject_id = ? AND school_id = ? AND id <> ?",
      )
      .get(nextClassId, nextSubjectId, schoolId, req.params.id)
  )
    return res.status(409).json({ error: "Subject is already assigned to this class/section" });

  if (classId !== undefined) {
    updates.push("class_id = ?");
    params.push(classId);
  }
  if (subjectId !== undefined) {
    updates.push("subject_id = ?");
    params.push(subjectId);
  }
  if (teacherId !== undefined) {
    updates.push("teacher_id = ?");
    params.push(teacherId || null);
  }

  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });

  params.push(req.params.id, schoolId);
  await db
    .prepare(`UPDATE class_subjects SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`)
    .run(...params);
  res.json({ ok: true });
});

subjectsRouter.delete("/mappings/:id", authorize("subjects.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const result = await db
    .prepare("DELETE FROM class_subjects WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  if (result.changes === 0) return res.status(404).json({ error: "Mapping not found" });
  res.json({ ok: true });
});

// ==========================================
// 3. Teacher & Student Portal Specific Routes
// ==========================================

/** Teacher: Get subjects and classes assigned to the logged-in teacher */
subjectsRouter.get("/my-teaching", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role !== "TEACHER" || !req.user!.linkedTeacherId) {
    return res.status(403).json({ error: "Teachers only" });
  }

  const query = `
    SELECT 
      cs.id,
      cs.class_id,
      cs.subject_id,
      c.name AS class_name,
      c.section AS section,
      s.name AS subject_name,
      s.code AS subject_code,
      s.type AS subject_type,
      s.credits AS subject_credits,
      s.description AS subject_description
    FROM class_subjects cs
    JOIN classes c ON c.id = cs.class_id
    JOIN subjects s ON s.id = cs.subject_id
    WHERE cs.school_id = ? AND cs.teacher_id = ?
    ORDER BY s.name, c.name, c.section
  `;

  const rows = await db.prepare(query).all(schoolId, req.user!.linkedTeacherId);
  res.json(rows);
});

/** Student: Get all subjects and assigned teachers for the student's class */
subjectsRouter.get("/my-class", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role !== "STUDENT" || !req.user!.linkedStudentId) {
    return res.status(403).json({ error: "Students only" });
  }

  const classId = await studentClassId(req.user!.linkedStudentId);
  if (!classId) return res.json([]);

  const query = `
    SELECT 
      cs.id,
      cs.class_id,
      cs.subject_id,
      cs.teacher_id,
      c.name AS class_name,
      c.section AS section,
      s.name AS subject_name,
      s.code AS subject_code,
      s.type AS subject_type,
      s.credits AS subject_credits,
      s.description AS subject_description,
      t.name AS teacher_name,
      t.email AS teacher_email,
      t.phone AS teacher_phone,
      t.photo_url AS teacher_photo_url
    FROM class_subjects cs
    JOIN classes c ON c.id = cs.class_id
    JOIN subjects s ON s.id = cs.subject_id
    LEFT JOIN teachers t ON t.id = cs.teacher_id
    WHERE cs.school_id = ? AND cs.class_id = ?
    ORDER BY s.name
  `;

  const rows = await db.prepare(query).all(schoolId, classId);
  res.json(rows);
});

subjectsRouter.get("/:id", authorize("subjects.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const row = await db
    .prepare("SELECT * FROM subjects WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!row) return res.status(404).json({ error: "Subject not found" });
  res.json(row);
});
