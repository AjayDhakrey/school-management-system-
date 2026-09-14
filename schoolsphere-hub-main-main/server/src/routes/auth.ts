import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/client.js";
import { authenticate, signToken, type AuthUser } from "../middleware/auth.js";
import type { Role, StaffDepartment } from "../permissions.js";
import { logAudit } from "./helpers.js";

interface UserRow {
  id: string;
  school_id: string | null;
  role: Role;
  department: StaffDepartment | null;
  name: string;
  email: string;
  password_hash: string;
  status: string;
  linked_teacher_id: string | null;
  linked_parent_id: string | null;
  linked_student_id: string | null;
  linked_staff_id: string | null;
  school_status: string | null;
}

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length > 254 ||
    password.length > 128 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const row = (await db
    .prepare(
      `SELECT u.id, u.school_id, u.role, u.department, u.name, u.email, u.password_hash,
              u.status, u.linked_teacher_id, u.linked_parent_id, u.linked_student_id,
              u.linked_staff_id, s.status AS school_status
       FROM users u LEFT JOIN schools s ON s.id = u.school_id
       WHERE u.email = ?`,
    )
    .get(email.toLowerCase().trim())) as UserRow | undefined;

  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const validSchoolContext =
    row.role === "SUPER_ADMIN"
      ? row.school_id === null
      : Boolean(row.school_id && ["ACTIVE", "TRIAL"].includes(row.school_status ?? ""));
  if (row.status !== "ACTIVE" || !validSchoolContext) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const authUser: AuthUser = {
    id: row.id,
    role: row.role,
    schoolId: row.school_id,
    department: row.department,
    linkedTeacherId: row.linked_teacher_id,
    linkedParentId: row.linked_parent_id,
    linkedStudentId: row.linked_student_id,
    linkedStaffId: row.linked_staff_id,
  };

  const token = signToken(authUser);
  req.user = authUser;
  await logAudit(req, "auth.login_succeeded", row.id, row.role);
  res.json({
    token,
    user: {
      ...authUser,
      name: row.name,
      email: row.email,
    },
  });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const profile = (await db
    .prepare("SELECT name, email FROM users WHERE id = ?")
    .get(req.user!.id)) as {
    name: string;
    email: string;
  };
  res.json({ user: { ...req.user!, ...profile } });
});

authRouter.patch("/password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    currentPassword.length > 128 ||
    newPassword.length < 8 ||
    newPassword.length > 128
  ) {
    return res
      .status(400)
      .json({ error: "currentPassword and a newPassword of 8 to 128 characters are required" });
  }

  const row = (await db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(req.user!.id)) as { password_hash: string } | undefined;
  if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(passwordHash, req.user!.id);
  res.json({ ok: true });
});
