import { Router } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import type { Role, StaffDepartment } from "../permissions.js";
import { logAudit } from "./helpers.js";

export const usersRouter = Router();
usersRouter.use(authenticate);

interface UserRow {
  id: string;
  role: Role;
  department: StaffDepartment | null;
  name: string;
  email: string;
  status: string;
  linked_teacher_id: string | null;
  linked_parent_id: string | null;
  linked_student_id: string | null;
  created_at: string;
}

function genTempPassword() {
  return randomBytes(6).toString("base64url"); // e.g. "aZ3-kQ9x" — short, url-safe, easy to relay
}

const SCHOOL_USER_ROLES: Role[] = ["SCHOOL_ADMIN", "TEACHER", "STAFF", "PARENT", "STUDENT"];
const STAFF_DEPARTMENTS: StaffDepartment[] = ["ADMIN", "ACCOUNTS", "LIBRARY", "TRANSPORT"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

usersRouter.get("/", authorize("users.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const rows = (await db
    .prepare(
      `SELECT id, role, department, name, email, status, linked_teacher_id, linked_parent_id, linked_student_id, created_at
       FROM users WHERE school_id = ? ORDER BY created_at DESC`,
    )
    .all(schoolId)) as UserRow[];
  res.json(rows);
});

/**
 * Attaches a real login to an existing teacher/staff/parent/student record — there is no
 * generic "invite by email" here, a login is always tied to a real domain record.
 */
usersRouter.post("/", authorize("users.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { role, linkedId, name, email, department, password } = req.body ?? {};
  if (
    typeof role !== "string" ||
    !SCHOOL_USER_ROLES.includes(role as Role) ||
    typeof email !== "string" ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email.trim()) ||
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 120
  ) {
    return res.status(400).json({ error: "role, name and email are required" });
  }
  if (
    password !== undefined &&
    (typeof password !== "string" || password.length < 8 || password.length > 128)
  ) {
    return res.status(400).json({ error: "password must be 8 to 128 characters" });
  }
  if (role === "STAFF" && !STAFF_DEPARTMENTS.includes(department)) {
    return res
      .status(400)
      .json({ error: `department must be one of ${STAFF_DEPARTMENTS.join(", ")}` });
  }
  const normalizedEmail = email.toLowerCase().trim();
  if (await db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail)) {
    return res.status(409).json({ error: "A login with this email already exists" });
  }

  let linkedTeacherId: string | null = null;
  let linkedParentId: string | null = null;
  let linkedStudentId: string | null = null;
  let linkedStaffId: string | null = null;

  if (role === "TEACHER") {
    if (typeof linkedId !== "string")
      return res.status(400).json({ error: "linkedId (teacher) is required" });
    const row = await db
      .prepare("SELECT id FROM teachers WHERE id = ? AND school_id = ?")
      .get(linkedId, schoolId);
    if (!row) return res.status(404).json({ error: "Teacher record not found" });
    linkedTeacherId = linkedId;
  } else if (role === "PARENT") {
    if (typeof linkedId !== "string")
      return res.status(400).json({ error: "linkedId (parent) is required" });
    const row = await db
      .prepare("SELECT id FROM parents WHERE id = ? AND school_id = ?")
      .get(linkedId, schoolId);
    if (!row) return res.status(404).json({ error: "Parent record not found" });
    linkedParentId = linkedId;
  } else if (role === "STUDENT") {
    if (typeof linkedId !== "string")
      return res.status(400).json({ error: "linkedId (student) is required" });
    const row = await db
      .prepare("SELECT id FROM students WHERE id = ? AND school_id = ?")
      .get(linkedId, schoolId);
    if (!row) return res.status(404).json({ error: "Student record not found" });
    linkedStudentId = linkedId;
  } else if (role === "STAFF") {
    if (typeof linkedId !== "string")
      return res.status(400).json({ error: "linkedId (staff) is required" });
    const row = await db
      .prepare("SELECT id FROM staff WHERE id = ? AND school_id = ?")
      .get(linkedId, schoolId);
    if (!row) return res.status(404).json({ error: "Staff record not found" });
    linkedStaffId = linkedId;
  } else if (role !== "SCHOOL_ADMIN") {
    return res.status(400).json({ error: "Unsupported role for a school-created login" });
  }

  // An admin-supplied password is used as-is (never echoed back); otherwise the server
  // generates one and returns it once so the admin can relay it to the user.
  const tempPassword = typeof password === "string" ? undefined : genTempPassword();
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, school_id, role, department, name, email, password_hash, linked_teacher_id, linked_parent_id, linked_student_id, linked_staff_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      schoolId,
      role,
      role === "STAFF" ? (department ?? null) : null,
      name,
      normalizedEmail,
      bcrypt.hashSync(tempPassword ?? password, 10),
      linkedTeacherId,
      linkedParentId,
      linkedStudentId,
      linkedStaffId,
    );

  await logAudit(req, "user.created", id, role);
  res.status(201).json({ id, ...(tempPassword ? { tempPassword } : {}) });
});

usersRouter.patch("/:id", authorize("users.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = await db
    .prepare("SELECT id FROM users WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!existing) return res.status(404).json({ error: "User not found" });

  const { status, resetPassword, password } = req.body ?? {};
  let tempPassword: string | undefined;

  if (typeof status === "string") {
    if (!["ACTIVE", "SUSPENDED"].includes(status))
      return res.status(400).json({ error: "status must be ACTIVE or SUSPENDED" });
    await db
      .prepare("UPDATE users SET status = ? WHERE id = ? AND school_id = ?")
      .run(status, req.params.id, schoolId);
  }
  if (typeof password === "string") {
    if (password.length < 8 || password.length > 128)
      return res.status(400).json({ error: "password must be 8 to 128 characters" });
    await db
      .prepare("UPDATE users SET password_hash = ? WHERE id = ? AND school_id = ?")
      .run(bcrypt.hashSync(password, 10), req.params.id, schoolId);
  } else if (resetPassword === true) {
    tempPassword = genTempPassword();
    await db
      .prepare("UPDATE users SET password_hash = ? WHERE id = ? AND school_id = ?")
      .run(bcrypt.hashSync(tempPassword, 10), req.params.id, schoolId);
  }
  if (status === undefined && resetPassword !== true && typeof password !== "string") {
    return res
      .status(400)
      .json({ error: "Nothing to update — pass status, resetPassword and/or password" });
  }

  if (typeof status === "string") await logAudit(req, "user.status_changed", req.params.id, status);
  if (typeof password === "string" || resetPassword === true)
    await logAudit(req, "user.password_reset", req.params.id);
  res.json({ ok: true, ...(tempPassword ? { tempPassword } : {}) });
});

/** Removes the login only — never the underlying teacher/staff/parent/student record. */
usersRouter.delete("/:id", authorize("users.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.params.id === req.user!.id)
    return res.status(400).json({ error: "Cannot delete your own account" });

  // notice_reads and notifications reference users(id) with no cascade — clear those first
  // or the delete below fails with a foreign key constraint error.
  await db.prepare("DELETE FROM notice_reads WHERE user_id = ?").run(req.params.id);
  await db.prepare("DELETE FROM notifications WHERE user_id = ?").run(req.params.id);

  const result = await db
    .prepare("DELETE FROM users WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  if (result.changes === 0) return res.status(404).json({ error: "User not found" });
  await logAudit(req, "user.deleted", req.params.id);
  res.json({ ok: true });
});
