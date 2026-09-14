import { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { loginStatusFor } from "./helpers.js";

export const teachersRouter = Router();
teachersRouter.use(authenticate);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\-\s0-9]{7,20}$/;
const STATUSES = ["ACTIVE", "ON_LEAVE", "INACTIVE", "SUSPENDED", "ARCHIVED"];

/** Field validation shared by create (required=true) and update (required=false). */
function validate(b: Record<string, unknown>, required = false): string | null {
  if (
    (required || b.name !== undefined) &&
    (typeof b.name !== "string" || !b.name.trim() || b.name.trim().length > 150)
  ) {
    return "A valid name is required";
  }
  if (b.email && (typeof b.email !== "string" || !EMAIL.test(b.email) || b.email.length > 254))
    return "Invalid email";
  if (b.phone && (typeof b.phone !== "string" || !PHONE.test(b.phone))) return "Invalid phone";
  if (
    b.employeeId &&
    (typeof b.employeeId !== "string" || !b.employeeId.trim() || b.employeeId.length > 60)
  ) {
    return "Invalid employee ID";
  }
  if (
    b.joiningDate &&
    (typeof b.joiningDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.joiningDate) ||
      Number.isNaN(Date.parse(b.joiningDate)))
  ) {
    return "Invalid joining date";
  }
  if (
    b.employmentStatus !== undefined &&
    !STATUSES.includes(String(b.employmentStatus).toUpperCase())
  ) {
    return "Invalid employment status";
  }
  return null;
}

/** Real Class-Subject-Teacher rows (Step 3 architecture) this teacher is currently assigned to. */
async function assignments(teacherId: string, schoolId: string) {
  return await db
    .prepare(
      `SELECT cs.id, cs.class_id, cs.subject_id, c.name AS class_name, c.section, s.name AS subject_name
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id
       JOIN subjects s ON s.id = cs.subject_id
       WHERE cs.teacher_id = ? AND cs.school_id = ?
       ORDER BY s.name, c.name, c.section`,
    )
    .all(teacherId, schoolId);
}

/**
 * Reconciles this teacher's Class-Subject-Teacher mappings (class_subjects) to the cartesian
 * product of the given class ids x subject ids — the single Step 3 assignment system, never a
 * parallel one. Also mirrors the id lists into teachers.assigned_classes/subjects for legacy reads.
 * Throws on any cross-school id or a class-subject already owned by a different teacher.
 */
async function syncAssignments(
  teacherId: string,
  schoolId: string,
  classes: unknown,
  subjects: unknown,
) {
  if (
    !Array.isArray(classes) ||
    !Array.isArray(subjects) ||
    !classes.every((x) => typeof x === "string") ||
    !subjects.every((x) => typeof x === "string")
  ) {
    throw new Error("Assignments must be ID arrays");
  }
  for (const classId of classes) {
    if (
      !(await db
        .prepare("SELECT 1 FROM classes WHERE id = ? AND school_id = ? AND status = 'ACTIVE'")
        .get(classId, schoolId))
    ) {
      throw new Error("Invalid class assignment");
    }
  }
  for (const subjectId of subjects) {
    if (
      !(await db
        .prepare("SELECT 1 FROM subjects WHERE id = ? AND school_id = ? AND status = 'ACTIVE'")
        .get(subjectId, schoolId))
    ) {
      throw new Error("Invalid subject assignment");
    }
  }

  const desired = new Set(classes.flatMap((c) => subjects.map((s) => `${c}:${s}`)));
  const existing = (await db
    .prepare(
      `SELECT id, class_id, subject_id, teacher_id FROM class_subjects
       WHERE school_id = ? AND (teacher_id = ? OR class_id IN (SELECT jsonb_array_elements_text(COALESCE(?,'[]')::jsonb)))`,
    )
    .all(schoolId, teacherId, JSON.stringify(classes))) as {
    id: string;
    class_id: string;
    subject_id: string;
    teacher_id: string | null;
  }[];

  for (const row of existing) {
    const key = `${row.class_id}:${row.subject_id}`;
    if (row.teacher_id === teacherId && !desired.has(key)) {
      await db.prepare("UPDATE class_subjects SET teacher_id = NULL WHERE id = ?").run(row.id);
    }
    if (desired.has(key)) {
      if (row.teacher_id && row.teacher_id !== teacherId) {
        throw new Error("A selected class-subject is assigned to another teacher");
      }
      await db
        .prepare("UPDATE class_subjects SET teacher_id = ? WHERE id = ?")
        .run(teacherId, row.id);
      desired.delete(key);
    }
  }
  for (const key of desired) {
    const [classId, subjectId] = key.split(":");
    await db
      .prepare(
        "INSERT INTO class_subjects (id, school_id, class_id, subject_id, teacher_id) VALUES (?, ?, ?, ?, ?)",
      )
      .run(randomUUID(), schoolId, classId, subjectId, teacherId);
  }
  await db
    .prepare("UPDATE teachers SET assigned_classes = ?, assigned_subjects = ? WHERE id = ?")
    .run(JSON.stringify(classes), JSON.stringify(subjects), teacherId);
}

const withUserId = `SELECT t.*, (SELECT id FROM users u WHERE u.linked_teacher_id = t.id) AS user_id FROM teachers t`;

teachersRouter.get("/", authorize("teachers.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const where = ["t.school_id = ?"];
  const args: unknown[] = [schoolId];

  // A TEACHER may only ever see their own record through this list.
  if (req.user!.role === "TEACHER") {
    where.push("t.id = ?");
    args.push(req.user!.linkedTeacherId);
  }
  for (const [key, col] of [
    ["department", "department"],
    ["status", "employment_status"],
  ] as const) {
    const value = req.query[key];
    if (typeof value === "string" && value) {
      where.push(`t.${col} = ?`);
      args.push(value);
    }
  }
  if (typeof req.query.q === "string" && req.query.q) {
    where.push(
      "(lower(t.name) LIKE lower(?) OR lower(coalesce(t.employee_id, '')) LIKE lower(?) OR lower(coalesce(t.email, '')) LIKE lower(?))",
    );
    args.push(...Array(3).fill(`%${req.query.q}%`));
  }
  res.json(
    await db.prepare(`${withUserId} WHERE ${where.join(" AND ")} ORDER BY t.name`).all(...args),
  );
});

teachersRouter.get("/me", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role !== "TEACHER") return res.status(403).json({ error: "Teachers only" });
  const row = (await db
    .prepare("SELECT * FROM teachers WHERE id = ? AND school_id = ?")
    .get(req.user!.linkedTeacherId, schoolId)) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: "Teacher record not found" });
  res.json({ ...row, assignments: await assignments(String(row.id), schoolId) });
});

teachersRouter.patch("/me", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role !== "TEACHER") return res.status(403).json({ error: "Teachers only" });
  const b = req.body ?? {};
  const error = await validate(b);
  if (error) return res.status(400).json({ error });

  const updates: string[] = [];
  const args: unknown[] = [];
  for (const [key, col] of [
    ["phone", "phone"],
    ["photoUrl", "photo_url"],
  ] as const) {
    if (b[key] !== undefined) {
      updates.push(`${col} = ?`);
      args.push(b[key] || null);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "No valid fields to update" });
  updates.push("updated_at = datetime('now')");
  await db
    .prepare(`UPDATE teachers SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`)
    .run(...args, req.user!.linkedTeacherId, schoolId);
  res.json({ ok: true });
});

teachersRouter.get("/:id", authorize("teachers.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role === "TEACHER" && req.params.id !== req.user!.linkedTeacherId) {
    return res.status(404).json({ error: "Teacher not found" });
  }
  const row = (await db
    .prepare(`${withUserId} WHERE t.id = ? AND t.school_id = ?`)
    .get(req.params.id, schoolId)) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: "Teacher not found" });
  res.json({ ...row, assignments: await assignments(req.params.id, schoolId) });
});

teachersRouter.post("/", authorize("teachers.create"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const b = req.body ?? {};
  const error = await validate(b, true);
  if (error) return res.status(400).json({ error });

  if (
    b.employeeId &&
    (await db
      .prepare("SELECT 1 FROM teachers WHERE school_id = ? AND lower(employee_id) = lower(?)")
      .get(schoolId, String(b.employeeId).trim()))
  ) {
    return res.status(409).json({ error: "Employee ID already exists" });
  }

  const login = b.login as Record<string, unknown> | undefined;
  if (
    login &&
    (typeof login.email !== "string" ||
      !EMAIL.test(login.email) ||
      typeof login.password !== "string" ||
      login.password.length < 8 ||
      login.password.length > 128)
  ) {
    return res
      .status(400)
      .json({ error: "Login requires a valid email and 8-128 character password" });
  }
  if (
    login &&
    (await db.prepare("SELECT 1 FROM users WHERE lower(email) = lower(?)").get(login.email))
  ) {
    return res.status(409).json({ error: "Login email already exists" });
  }

  const id = randomUUID();
  let userId: string | null = null;
  try {
    await db.transaction(async () => {
      await db
        .prepare(
          `INSERT INTO teachers
         (id, school_id, employee_id, name, department, designation, email, phone,
          assigned_classes, assigned_subjects, employment_status, joining_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, datetime('now'), datetime('now'))`,
        )
        .run(
          id,
          schoolId,
          b.employeeId ? String(b.employeeId).trim() : null,
          String(b.name).trim(),
          b.department ?? null,
          b.designation ?? null,
          b.email || null,
          b.phone || null,
          String(b.employmentStatus ?? "ACTIVE").toUpperCase(),
          b.joiningDate || null,
        );

      if (b.assignedClasses !== undefined || b.assignedSubjects !== undefined) {
        await syncAssignments(id, schoolId, b.assignedClasses ?? [], b.assignedSubjects ?? []);
      }

      if (login) {
        userId = randomUUID();
        await db
          .prepare(
            "INSERT INTO users (id, school_id, role, name, email, password_hash, linked_teacher_id) VALUES (?, ?, 'TEACHER', ?, ?, ?, ?)",
          )
          .run(
            userId,
            schoolId,
            String(b.name).trim(),
            String(login.email).toLowerCase(),
            bcrypt.hashSync(String(login.password), 10),
            id,
          );
      }
    });
    res.status(201).json({ id, userId });
  } catch (err) {
    try {
      await db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    res
      .status(409)
      .json({ error: err instanceof Error ? err.message : "Teacher could not be created" });
  }
});

teachersRouter.patch("/:id", authorize("teachers.update"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const old = (await db
    .prepare("SELECT * FROM teachers WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as Record<string, unknown> | undefined;
  if (!old) return res.status(404).json({ error: "Teacher not found" });
  const b = req.body ?? {};
  const error = await validate(b);
  if (error) return res.status(400).json({ error });

  const status =
    b.employmentStatus === undefined
      ? String(old.employment_status)
      : String(b.employmentStatus).toUpperCase();
  // A teacher who is the active Class Teacher of a class must be reassigned before going inactive.
  if (
    status !== "ACTIVE" &&
    (await db
      .prepare("SELECT 1 FROM classes WHERE class_teacher_id = ? AND status = 'ACTIVE' LIMIT 1")
      .get(req.params.id))
  ) {
    return res
      .status(409)
      .json({ error: "Reassign active class-teacher duties before deactivation" });
  }

  if (
    b.employeeId &&
    (await db
      .prepare(
        "SELECT 1 FROM teachers WHERE school_id = ? AND lower(employee_id) = lower(?) AND id <> ?",
      )
      .get(schoolId, String(b.employeeId).trim(), req.params.id))
  ) {
    return res.status(409).json({ error: "Employee ID already exists" });
  }

  const columnFor: Record<string, string> = {
    employeeId: "employee_id",
    employmentStatus: "employment_status",
    joiningDate: "joining_date",
  };
  const allowed = [
    "employee_id",
    "name",
    "department",
    "designation",
    "email",
    "phone",
    "employment_status",
    "joining_date",
  ];
  const updates: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(b)) {
    const col = columnFor[key] ?? key;
    if (allowed.includes(col)) {
      updates.push(`${col} = ?`);
      args.push(col === "employment_status" ? String(value).toUpperCase() : value || null);
    }
  }

  try {
    await db.transaction(async () => {
      if (updates.length) {
        updates.push("updated_at = datetime('now')");
        await db
          .prepare(`UPDATE teachers SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`)
          .run(...args, req.params.id, schoolId);
      }
      if (b.assignedClasses !== undefined || b.assignedSubjects !== undefined) {
        await syncAssignments(
          req.params.id,
          schoolId,
          b.assignedClasses ?? JSON.parse(String(old.assigned_classes)),
          b.assignedSubjects ?? JSON.parse(String(old.assigned_subjects)),
        );
      }
      if (b.employmentStatus !== undefined) {
        await db
          .prepare("UPDATE users SET status = ? WHERE linked_teacher_id = ? AND school_id = ?")
          .run(loginStatusFor(status), req.params.id, schoolId);
      }
    });
    res.json({ ok: true });
  } catch (err) {
    try {
      await db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    res
      .status(409)
      .json({ error: err instanceof Error ? err.message : "Teacher could not be updated" });
  }
});

teachersRouter.delete("/:id", authorize("teachers.delete"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (
    !(await db
      .prepare("SELECT 1 FROM teachers WHERE id = ? AND school_id = ?")
      .get(req.params.id, schoolId))
  ) {
    return res.status(404).json({ error: "Teacher not found" });
  }
  if (
    await db
      .prepare("SELECT 1 FROM classes WHERE class_teacher_id = ? AND status = 'ACTIVE' LIMIT 1")
      .get(req.params.id)
  ) {
    return res.status(409).json({ error: "Reassign active class-teacher duties before archiving" });
  }

  // Any operational/history row referencing this teacher means we archive (keep the record) rather
  // than hard-delete. classes/class_subjects/homework/timetable_slots hold real FKs to teachers(id),
  // so a hard delete against any of them would fail the foreign-key check outright.
  const referenced =
    Boolean(
      await db
        .prepare("SELECT 1 FROM classes WHERE class_teacher_id = ? LIMIT 1")
        .get(req.params.id),
    ) ||
    Boolean(
      await db
        .prepare("SELECT 1 FROM class_subjects WHERE teacher_id = ? LIMIT 1")
        .get(req.params.id),
    ) ||
    Boolean(
      await db.prepare("SELECT 1 FROM homework WHERE teacher_id = ? LIMIT 1").get(req.params.id),
    ) ||
    Boolean(
      await db
        .prepare("SELECT 1 FROM timetable_slots WHERE teacher_id = ? LIMIT 1")
        .get(req.params.id),
    ) ||
    Boolean(
      await db
        .prepare("SELECT 1 FROM teacher_attendance WHERE teacher_id = ? LIMIT 1")
        .get(req.params.id),
    ) ||
    Boolean(
      await db
        .prepare(
          "SELECT 1 FROM leave_requests WHERE requester_type = 'TEACHER' AND requester_id = ? LIMIT 1",
        )
        .get(req.params.id),
    ) ||
    Boolean(
      await db
        .prepare("SELECT 1 FROM users WHERE linked_teacher_id = ? LIMIT 1")
        .get(req.params.id),
    );

  async function archive() {
    await db
      .prepare(
        "UPDATE teachers SET employment_status = 'ARCHIVED', updated_at = datetime('now') WHERE id = ? AND school_id = ?",
      )
      .run(req.params.id, schoolId);
    await db
      .prepare(
        "UPDATE users SET status = 'SUSPENDED' WHERE linked_teacher_id = ? AND school_id = ?",
      )
      .run(req.params.id, schoolId);
  }

  if (referenced) {
    archive();
    return res.json({ ok: true, archived: true });
  }
  try {
    await db
      .prepare("DELETE FROM teachers WHERE id = ? AND school_id = ?")
      .run(req.params.id, schoolId);
    res.json({ ok: true, archived: false });
  } catch {
    // A reference slipped in between the check and the delete — fall back to archiving.
    archive();
    res.json({ ok: true, archived: true });
  }
});
