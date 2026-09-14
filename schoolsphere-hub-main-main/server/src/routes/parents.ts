import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";

export const parentsRouter = Router();
parentsRouter.use(authenticate);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\-\s0-9]{7,20}$/;
const RELATIONS = ["Father", "Mother", "Guardian", "Grandparent", "Other"];
function valid(body: Record<string, unknown>, requireName = false) {
  if (
    (requireName || body.name !== undefined) &&
    (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 150)
  )
    return "A valid name is required";
  if (
    body.email &&
    (typeof body.email !== "string" || body.email.length > 254 || !EMAIL.test(body.email))
  )
    return "Invalid email address";
  if (body.phone && (typeof body.phone !== "string" || !PHONE.test(body.phone)))
    return "Invalid phone number";
  return null;
}
async function shapedParents(sql: string, args: unknown[]) {
  return await db
    .prepare(
      `SELECT p.*,coalesce((SELECT json_agg(student_id) FROM student_guardians sg WHERE sg.parent_id=p.id),'[]'::json) AS linked_student_ids FROM parents p WHERE ${sql} ORDER BY p.name`,
    )
    .all(...args);
}

parentsRouter.get("/", authorize("parents.view"), async (req, res) => {
  const sid = requireSchoolId(req, res);
  if (!sid) return;
  if (req.user!.role === "PARENT")
    return res.json(await shapedParents("p.id=? AND p.school_id=?", [req.user!.linkedParentId, sid]));
  if (req.user!.role === "STUDENT")
    return res.json(
      await shapedParents(
        "p.school_id=? AND EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.parent_id=p.id AND sg.student_id=?)",
        [sid, req.user!.linkedStudentId],
      ),
    );
  res.json(await shapedParents("p.school_id=?", [sid]));
});

parentsRouter.get("/:id/children", authorize("parents.view"), async (req, res) => {
  const sid = requireSchoolId(req, res);
  if (!sid) return;
  if (req.user!.role === "PARENT" && req.params.id !== req.user!.linkedParentId)
    return res.status(403).json({ error: "Cannot view another parent's children" });
  if (req.user!.role === "STUDENT") return res.status(403).json({ error: "Not permitted" });
  const parent = await db
    .prepare("SELECT 1 FROM parents WHERE id=? AND school_id=?")
    .get(req.params.id, sid);
  if (!parent) return res.status(404).json({ error: "Parent not found" });
  res.json(
    await db
      .prepare(
        "SELECT s.*,sg.relationship,sg.is_primary FROM students s JOIN student_guardians sg ON sg.student_id=s.id WHERE sg.parent_id=? AND sg.school_id=? ORDER BY s.name",
      )
      .all(req.params.id, sid),
  );
});

parentsRouter.get("/:id", authorize("parents.view"), async (req, res) => {
  const sid = requireSchoolId(req, res);
  if (!sid) return;
  if (req.user!.role === "PARENT" && req.params.id !== req.user!.linkedParentId)
    return res.status(403).json({ error: "Cannot view another parent's record" });
  if (
    req.user!.role === "STUDENT" &&
    !(await db
      .prepare("SELECT 1 FROM student_guardians WHERE parent_id=? AND student_id=? AND school_id=?")
      .get(req.params.id, req.user!.linkedStudentId, sid))
  )
    return res.status(404).json({ error: "Parent not found" });
  const rows = await shapedParents("p.id=? AND p.school_id=?", [req.params.id, sid]);
  if (!rows.length) return res.status(404).json({ error: "Parent not found" });
  res.json(rows[0]);
});

parentsRouter.post("/", authorize("parents.create"), async (req, res) => {
  const sid = requireSchoolId(req, res);
  if (!sid) return;
  const body = req.body ?? {};
  const error = valid(body, true);
  if (error) return res.status(400).json({ error });
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const phone = body.phone ? String(body.phone).trim() : null;
  if (
    (email || phone) &&
    (await db
      .prepare(
        "SELECT 1 FROM parents WHERE school_id=? AND ((? IS NOT NULL AND lower(email)=lower(?)) OR (? IS NOT NULL AND phone=?))",
      )
      .get(sid, email, email, phone, phone))
  )
    return res.status(409).json({ error: "A guardian with this email or phone already exists" });
  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO parents(id,school_id,name,email,phone,linked_student_ids) VALUES(?,?,?,?,?,'[]')",
    )
    .run(id, sid, String(body.name).trim(), email, phone);
  res.status(201).json({ id });
});

parentsRouter.patch("/:id", authorize("parents.update"), async (req, res) => {
  const sid = requireSchoolId(req, res);
  if (!sid) return;
  if (
    !(await db.prepare("SELECT 1 FROM parents WHERE id=? AND school_id=?").get(req.params.id, sid))
  )
    return res.status(404).json({ error: "Parent not found" });
  const body = req.body ?? {};
  const error = valid(body);
  if (error) return res.status(400).json({ error });
  const updates: string[] = [];
  const args: unknown[] = [];
  for (const key of ["name", "email", "phone"]) {
    if (body[key] !== undefined) {
      updates.push(`${key}=?`);
      args.push(body[key] ? String(body[key]).trim() : null);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "No valid fields to update" });
  try {
    await db
      .prepare(`UPDATE parents SET ${updates.join(",")} WHERE id=? AND school_id=?`)
      .run(...args, req.params.id, sid);
    res.json({ ok: true });
  } catch {
    return res.status(409).json({ error: "Guardian contact already exists" });
  }
});

parentsRouter.post("/:id/link", authorize("parents.update"), async (req, res) => {
  const sid = requireSchoolId(req, res);
  if (!sid) return;
  const { studentId, relationship = "Guardian", isPrimary = false } = req.body ?? {};
  if (typeof studentId !== "string" || !studentId)
    return res.status(400).json({ error: "studentId is required" });
  if (!RELATIONS.includes(String(relationship)))
    return res.status(400).json({ error: "Invalid relationship type" });
  if (
    !(await db.prepare("SELECT 1 FROM parents WHERE id=? AND school_id=?").get(req.params.id, sid))
  )
    return res.status(404).json({ error: "Parent not found" });
  const student = (await db
    .prepare("SELECT parent_id FROM students WHERE id=? AND school_id=?")
    .get(studentId, sid)) as { parent_id: string | null } | undefined;
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (
    await db
      .prepare("SELECT 1 FROM student_guardians WHERE student_id=? AND parent_id=?")
      .get(studentId, req.params.id)
  )
    return res.status(409).json({ error: "Guardian is already linked to this student" });
  try {
    await db.transaction(async () => {
      await db
        .prepare(
          "INSERT INTO student_guardians(id,school_id,student_id,parent_id,relationship,is_primary) VALUES(?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          sid,
          studentId,
          req.params.id,
          relationship,
          isPrimary || !student.parent_id ? 1 : 0,
        );
      if (isPrimary || !student.parent_id) {
        await db
          .prepare(
            "UPDATE student_guardians SET is_primary=CASE WHEN parent_id=? THEN 1 ELSE 0 END WHERE student_id=?",
          )
          .run(req.params.id, studentId);
        await db
          .prepare("UPDATE students SET parent_id=?,updated_at=datetime('now') WHERE id=?")
          .run(req.params.id, studentId);
      }
      await syncJson(req.params.id);
    });
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "Guardian relationship could not be created" });
  }
});

parentsRouter.post("/:id/unlink", authorize("parents.update"), async (req, res) => {
  const sid = requireSchoolId(req, res);
  if (!sid) return;
  const { studentId } = req.body ?? {};
  if (typeof studentId !== "string" || !studentId)
    return res.status(400).json({ error: "studentId is required" });
  if (
    !(await db.prepare("SELECT 1 FROM parents WHERE id=? AND school_id=?").get(req.params.id, sid))
  )
    return res.status(404).json({ error: "Parent not found" });
  if (!(await db.prepare("SELECT 1 FROM students WHERE id=? AND school_id=?").get(studentId, sid)))
    return res.status(404).json({ error: "Student not found" });
  const link = (await db
    .prepare(
      "SELECT is_primary FROM student_guardians WHERE parent_id=? AND student_id=? AND school_id=?",
    )
    .get(req.params.id, studentId, sid)) as { is_primary: number } | undefined;
  if (!link) return res.status(404).json({ error: "Guardian relationship not found" });
  try {
    await db.transaction(async () => {
      await db
        .prepare("DELETE FROM student_guardians WHERE parent_id=? AND student_id=? AND school_id=?")
        .run(req.params.id, studentId, sid);
      if (link.is_primary) {
        const next = (await db
          .prepare(
            "SELECT parent_id FROM student_guardians WHERE student_id=? ORDER BY created_at LIMIT 1",
          )
          .get(studentId)) as { parent_id: string } | undefined;
        await db
          .prepare("UPDATE students SET parent_id=?,updated_at=datetime('now') WHERE id=?")
          .run(next?.parent_id ?? null, studentId);
        if (next)
          await db
            .prepare("UPDATE student_guardians SET is_primary=1 WHERE parent_id=? AND student_id=?")
            .run(next.parent_id, studentId);
      }
      await syncJson(req.params.id);
    });
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "Guardian relationship could not be removed" });
  }
});

parentsRouter.delete("/:id", authorize("parents.update"), async (req, res) => {
  const sid = requireSchoolId(req, res);
  if (!sid) return;
  if (
    !(await db.prepare("SELECT 1 FROM parents WHERE id=? AND school_id=?").get(req.params.id, sid))
  )
    return res.status(404).json({ error: "Parent not found" });
  if (
    (await db
      .prepare("SELECT 1 FROM student_guardians WHERE parent_id=? LIMIT 1")
      .get(req.params.id)) ||
    (await db.prepare("SELECT 1 FROM users WHERE linked_parent_id=? LIMIT 1").get(req.params.id))
  )
    return res
      .status(409)
      .json({ error: "Guardian cannot be deleted while linked to a student or portal account" });
  await db.prepare("DELETE FROM parents WHERE id=? AND school_id=?").run(req.params.id, sid);
  res.json({ ok: true });
});

async function syncJson(parentId: string) {
  const ids = (
    (await db
      .prepare("SELECT student_id FROM student_guardians WHERE parent_id=? ORDER BY created_at")
      .all(parentId)) as { student_id: string }[]
  ).map((r) => r.student_id);
  await db
    .prepare("UPDATE parents SET linked_student_ids=? WHERE id=?")
    .run(JSON.stringify(ids), parentId);
}
