import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { syncParentLink } from "./helpers.js";

export const studentsRouter = Router();
studentsRouter.use(authenticate);
const STATUSES = ["Active", "Inactive", "Graduated", "Transferred", "Archived"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\-\s0-9]{7,20}$/;
const dateOk = (v: unknown) =>
  v == null ||
  v === "" ||
  (typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    v <= new Date().toISOString().slice(0, 10));

function scope(user: NonNullable<Express.Request["user"]>) {
  if (user.role === "TEACHER")
    return {
      sql: `s.school_id=? AND s.class_id IN (SELECT jsonb_array_elements_text(COALESCE((SELECT assigned_classes FROM teachers WHERE id=?),'[]')::jsonb) UNION SELECT id FROM classes WHERE class_teacher_id=?)`,
      args: [user.schoolId, user.linkedTeacherId, user.linkedTeacherId],
    };
  if (user.role === "PARENT")
    return {
      sql: "s.school_id=? AND EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.student_id=s.id AND sg.parent_id=?)",
      args: [user.schoolId, user.linkedParentId],
    };
  if (user.role === "STUDENT")
    return { sql: "s.school_id=? AND s.id=?", args: [user.schoolId, user.linkedStudentId] };
  return { sql: "s.school_id=?", args: [user.schoolId] };
}

async function placement(schoolId: string, classId: unknown, yearId: unknown) {
  if (classId == null || classId === "")
    return yearId
      ? { error: "A class is required when an academic year is selected" }
      : { row: null };
  if (typeof classId !== "string") return { error: "Invalid class" };
  const row = (await db
    .prepare(
      `SELECT c.id,c.name,c.section,c.academic_year_id FROM classes c JOIN academic_years ay ON ay.id=c.academic_year_id AND ay.school_id=c.school_id WHERE c.id=? AND c.school_id=? AND c.status='ACTIVE'`,
    )
    .get(classId, schoolId)) as
    { id: string; name: string; section: string; academic_year_id: string } | undefined;
  if (!row) return { error: "Class does not belong to this school or is inactive" };
  if (yearId && yearId !== row.academic_year_id)
    return { error: "Class does not belong to the selected academic year" };
  return { row };
}

async function validate(body: Record<string, unknown>, schoolId: string, currentId = "") {
  if (
    body.name !== undefined &&
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
  if (!dateOk(body.dob)) return "DOB must be valid and cannot be in the future";
  if (!dateOk(body.admittedOn ?? body.admitted_on))
    return "Admission date must be valid and cannot be in the future";
  if (body.address != null && (typeof body.address !== "string" || body.address.length > 1000))
    return "Address is too long";
  if (
    body.roll != null &&
    body.roll !== "" &&
    (!Number.isInteger(Number(body.roll)) || Number(body.roll) < 1)
  )
    return "Roll number must be a positive integer";
  if (body.status !== undefined && !STATUSES.includes(String(body.status)))
    return "Invalid student status";
  const no = body.admissionNo ?? body.admission_no;
  if (no != null && (typeof no !== "string" || !no.trim() || no.trim().length > 60))
    return "Invalid admission number";
  if (
    no &&
    (await db
      .prepare(
        "SELECT 1 FROM students WHERE school_id=? AND lower(admission_no)=lower(?) AND id<>?",
      )
      .get(schoolId, String(no).trim(), currentId))
  )
    return "Admission number already exists in this school";
  return null;
}

studentsRouter.get("/", authorize("students.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const s = scope(req.user!);
  const where: string[] = [];
  const args: unknown[] = [];
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    where.push(
      "(lower(s.name) LIKE lower(?) OR lower(coalesce(s.admission_no,'')) LIKE lower(?) OR CAST(s.roll AS TEXT) LIKE ?)",
    );
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  for (const [key, col] of [
    ["academicYearId", "academic_year_id"],
    ["classId", "class_id"],
    ["className", "class_name"],
    ["section", "section"],
    ["status", "status"],
  ] as const) {
    const v = req.query[key];
    if (typeof v === "string" && v) {
      where.push(`s.${col}=?`);
      args.push(v);
    }
  }
  res.json(
    await db
      .prepare(
        `SELECT s.* FROM students s WHERE ${s.sql}${where.length ? ` AND ${where.join(" AND ")}` : ""} ORDER BY s.name`,
      )
      .all(...s.args, ...args),
  );
});

studentsRouter.get("/me", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role !== "STUDENT") return res.status(403).json({ error: "Students only" });
  const row = await db
    .prepare("SELECT * FROM students WHERE id=? AND school_id=?")
    .get(req.user!.linkedStudentId, schoolId);
  if (!row) return res.status(404).json({ error: "Student record not found" });
  res.json(row);
});

studentsRouter.patch("/me", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role !== "STUDENT") return res.status(403).json({ error: "Students only" });
  const body = req.body ?? {};
  const error = await validate(body, schoolId, req.user!.linkedStudentId ?? "");
  if (error) return res.status(400).json({ error });
  const map: Record<string, string> = { photoUrl: "photo_url", bloodGroup: "blood_group" };
  const allowed = ["email", "phone", "dob", "address", "photo_url", "blood_group"];
  const updates: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(body)) {
    const col = map[key] ?? key;
    if (allowed.includes(col)) {
      updates.push(`${col}=?`);
      args.push(value === "" ? null : value);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "No valid fields to update" });
  updates.push("updated_at=datetime('now')");
  await db
    .prepare(`UPDATE students SET ${updates.join(",")} WHERE id=? AND school_id=?`)
    .run(...args, req.user!.linkedStudentId, schoolId);
  res.json({ ok: true });
});

studentsRouter.get("/:id", authorize("students.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const s = scope(req.user!);
  const row = await db
    .prepare(`SELECT s.* FROM students s WHERE ${s.sql} AND s.id=?`)
    .get(...s.args, req.params.id);
  if (!row) return res.status(404).json({ error: "Student not found" });
  res.json(row);
});

studentsRouter.post("/", authorize("students.create"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const body = req.body ?? {};
  if (body.name === undefined) body.name = "";
  const error = await validate(body, schoolId);
  if (error) return res.status(400).json({ error });
  const p = await placement(schoolId, body.classId, body.academicYearId);
  if (p.error) return res.status(400).json({ error: p.error });
  if (
    body.parentId &&
    !(await db
      .prepare("SELECT 1 FROM parents WHERE id=? AND school_id=?")
      .get(body.parentId, schoolId))
  )
    return res.status(400).json({ error: "Parent does not belong to this school" });
  const roll = body.roll == null || body.roll === "" ? null : Number(body.roll);
  if (
    roll &&
    p.row &&
    (await db
      .prepare(
        "SELECT 1 FROM students WHERE school_id=? AND academic_year_id=? AND class_id=? AND roll=?",
      )
      .get(schoolId, p.row.academic_year_id, p.row.id, roll))
  )
    return res
      .status(409)
      .json({ error: "Roll number already exists in this class and academic year" });
  const id = randomUUID();
  try {
    await db.transaction(async () => {
      await db
        .prepare(
          `INSERT INTO students (id,school_id,name,admission_no,class_id,academic_year_id,class_name,section,roll,parent_id,status,admitted_on,email,phone,dob,address,blood_group,vehicle_id,pickup_point,drop_point,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
        )
        .run(
          id,
          schoolId,
          String(body.name).trim(),
          body.admissionNo ? String(body.admissionNo).trim() : null,
          p.row?.id ?? null,
          p.row?.academic_year_id ?? null,
          p.row?.name ?? null,
          p.row?.section ?? null,
          roll,
          body.parentId ?? null,
          body.status ?? "Active",
          body.admittedOn || null,
          body.email || null,
          body.phone || null,
          body.dob || null,
          body.address || null,
          body.bloodGroup || null,
          body.vehicleId || null,
          body.pickupPoint || null,
          body.dropPoint || null,
        );
      if (body.parentId) await syncParentLink(null, String(body.parentId), id);
    });
    res.status(201).json({ id });
  } catch (e) {
    res.status(409).json({
      error:
        e instanceof Error && e.message.includes("UNIQUE")
          ? "Student identifier already exists"
          : "Student could not be created",
    });
  }
});

studentsRouter.patch("/:id", authorize("students.update"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare("SELECT * FROM students WHERE id=? AND school_id=?")
    .get(req.params.id, schoolId)) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: "Student not found" });
  const body = req.body ?? {};
  const error = await validate(body, schoolId, req.params.id);
  if (error) return res.status(400).json({ error });
  const p = await placement(
    schoolId,
    body.classId !== undefined ? body.classId : existing.class_id,
    body.academicYearId !== undefined ? body.academicYearId : existing.academic_year_id,
  );
  if (p.error) return res.status(400).json({ error: p.error });
  const parentId = body.parentId !== undefined ? body.parentId : existing.parent_id;
  if (
    parentId &&
    !(await db.prepare("SELECT 1 FROM parents WHERE id=? AND school_id=?").get(parentId, schoolId))
  )
    return res.status(400).json({ error: "Parent does not belong to this school" });
  const roll =
    body.roll !== undefined
      ? body.roll === "" || body.roll == null
        ? null
        : Number(body.roll)
      : existing.roll;
  if (
    roll &&
    p.row &&
    (await db
      .prepare(
        "SELECT 1 FROM students WHERE school_id=? AND academic_year_id=? AND class_id=? AND roll=? AND id<>?",
      )
      .get(schoolId, p.row.academic_year_id, p.row.id, roll, req.params.id))
  )
    return res
      .status(409)
      .json({ error: "Roll number already exists in this class and academic year" });
  const map: Record<string, string> = {
    admissionNo: "admission_no",
    parentId: "parent_id",
    vehicleId: "vehicle_id",
    pickupPoint: "pickup_point",
    dropPoint: "drop_point",
    admittedOn: "admitted_on",
    bloodGroup: "blood_group",
  };
  const allowed = [
    "name",
    "admission_no",
    "roll",
    "status",
    "parent_id",
    "vehicle_id",
    "pickup_point",
    "drop_point",
    "admitted_on",
    "email",
    "phone",
    "dob",
    "address",
    "blood_group",
  ];
  const updates: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(body)) {
    const col = map[key] ?? key;
    if (allowed.includes(col)) {
      updates.push(`${col}=?`);
      args.push(value === "" ? null : value);
    }
  }
  if (body.classId !== undefined || body.academicYearId !== undefined) {
    updates.push("class_id=?", "academic_year_id=?", "class_name=?", "section=?");
    args.push(
      p.row?.id ?? null,
      p.row?.academic_year_id ?? null,
      p.row?.name ?? null,
      p.row?.section ?? null,
    );
  }
  if (!updates.length) return res.status(400).json({ error: "No valid fields to update" });
  try {
    await db.transaction(async () => {
      updates.push("updated_at=datetime('now')");
      await db
        .prepare(`UPDATE students SET ${updates.join(",")} WHERE id=? AND school_id=?`)
        .run(...args, req.params.id, schoolId);
      if (body.parentId !== undefined && body.parentId !== existing.parent_id)
        await syncParentLink(
          existing.parent_id as string | null,
          parentId as string | null,
          req.params.id,
        );
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(409).json({
      error:
        e instanceof Error && e.message.includes("UNIQUE")
          ? "Student identifier already exists"
          : "Student could not be updated",
    });
  }
});

studentsRouter.delete("/:id", authorize("students.delete"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const row = await db
    .prepare("SELECT id FROM students WHERE id=? AND school_id=?")
    .get(req.params.id, schoolId);
  if (!row) return res.status(404).json({ error: "Student not found" });
  const referenceChecks = await Promise.all(
    [
      "attendance",
      "fees",
      "results",
      "library_records",
      "certificates",
      "homework_submissions",
    ].map(
      async (t) =>
        await db.prepare(`SELECT 1 FROM ${t} WHERE student_id=? LIMIT 1`).get(req.params.id),
    ),
  );
  const refs =
    referenceChecks.some(Boolean) ||
    Boolean(
      await db.prepare("SELECT 1 FROM users WHERE linked_student_id=? LIMIT 1").get(req.params.id),
    ) ||
    Boolean(
      await db
        .prepare("SELECT 1 FROM admissions WHERE converted_student_id=? LIMIT 1")
        .get(req.params.id),
    );
  if (refs) {
    await db
      .prepare(
        "UPDATE students SET status='Archived',updated_at=datetime('now') WHERE id=? AND school_id=?",
      )
      .run(req.params.id, schoolId);
    return res.json({ ok: true, archived: true });
  }
  try {
    await db.transaction(async () => {
      const gs = (await db
        .prepare("SELECT DISTINCT parent_id FROM student_guardians WHERE student_id=?")
        .all(req.params.id)) as { parent_id: string }[];
      await db
        .prepare("DELETE FROM student_guardians WHERE student_id=? AND school_id=?")
        .run(req.params.id, schoolId);
      await db
        .prepare("DELETE FROM students WHERE id=? AND school_id=?")
        .run(req.params.id, schoolId);
      for (const g of gs) {
        const ids = (
          (await db
            .prepare("SELECT student_id FROM student_guardians WHERE parent_id=?")
            .all(g.parent_id)) as { student_id: string }[]
        ).map((x) => x.student_id);
        await db
          .prepare("UPDATE parents SET linked_student_ids=? WHERE id=?")
          .run(JSON.stringify(ids), g.parent_id);
      }
    });
    res.json({ ok: true, archived: false });
  } catch {
    res.status(409).json({ error: "Student is referenced and was not deleted" });
  }
});
