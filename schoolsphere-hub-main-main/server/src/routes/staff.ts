import { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { loginStatusFor } from "./helpers.js";

export const staffRouter = Router();
staffRouter.use(authenticate);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\-\s0-9]{7,20}$/;
const STATUSES = ["ACTIVE", "ON_LEAVE", "INACTIVE", "SUSPENDED", "ARCHIVED"];

/**
 * The four canonical staff departments — the same fixed set the permission model keys off
 * (permissions.ts STAFF_DEPARTMENT_PERMISSIONS) and users.department stores. The UI labels them
 * "Administration / Accounts / Library / Transport", so those spellings are accepted and folded
 * back to the canonical code here; anything else is rejected so a login can always resolve a
 * permission set.
 */
const DEPARTMENTS = ["ADMIN", "ACCOUNTS", "LIBRARY", "TRANSPORT"] as const;
type Department = (typeof DEPARTMENTS)[number];
const DEPARTMENT_ALIASES: Record<string, Department> = {
  admin: "ADMIN",
  administration: "ADMIN",
  accounts: "ACCOUNTS",
  account: "ACCOUNTS",
  library: "LIBRARY",
  transport: "TRANSPORT",
};

function normalizeDepartment(value: unknown): Department | null {
  if (typeof value !== "string") return null;
  return DEPARTMENT_ALIASES[value.trim().toLowerCase()] ?? null;
}

/** Field validation shared by create (required=true) and update (required=false). */
function validate(b: Record<string, unknown>, required = false): string | null {
  if (
    (required || b.name !== undefined) &&
    (typeof b.name !== "string" || !b.name.trim() || b.name.length > 150)
  ) {
    return "A valid name is required";
  }
  if (
    b.department !== undefined &&
    b.department !== null &&
    normalizeDepartment(b.department) === null
  ) {
    return "Invalid staff department";
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

const withUserId = `SELECT s.*, (SELECT id FROM users u WHERE u.linked_staff_id = s.id) AS user_id FROM staff s`;

staffRouter.get("/", authorize("staff.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const where = ["s.school_id = ?"];
  const args: unknown[] = [schoolId];

  // A STAFF member may only ever see their own record through this list.
  if (req.user!.role === "STAFF") {
    where.push("s.id = ?");
    args.push(req.user!.linkedStaffId);
  }
  for (const [key, col] of [
    ["department", "department"],
    ["status", "employment_status"],
  ] as const) {
    const value = req.query[key];
    if (typeof value === "string" && value) {
      where.push(`s.${col} = ?`);
      args.push(key === "department" ? (normalizeDepartment(value) ?? value) : value);
    }
  }
  if (typeof req.query.q === "string" && req.query.q) {
    where.push(
      "(lower(s.name) LIKE lower(?) OR lower(coalesce(s.employee_id, '')) LIKE lower(?) OR lower(coalesce(s.email, '')) LIKE lower(?))",
    );
    args.push(...Array(3).fill(`%${req.query.q}%`));
  }
  res.json(
    await db.prepare(`${withUserId} WHERE ${where.join(" AND ")} ORDER BY s.name`).all(...args),
  );
});

staffRouter.get("/me", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role !== "STAFF") return res.status(403).json({ error: "Staff only" });
  const row = await db
    .prepare("SELECT * FROM staff WHERE id = ? AND school_id = ?")
    .get(req.user!.linkedStaffId, schoolId);
  if (!row) return res.status(404).json({ error: "Staff record not found" });
  res.json(row);
});

staffRouter.patch("/me", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role !== "STAFF") return res.status(403).json({ error: "Staff only" });
  const b = req.body ?? {};
  const error = await validate(b);
  if (error) return res.status(400).json({ error });

  const updates: string[] = [];
  const args: unknown[] = [];
  for (const key of ["phone"]) {
    if (b[key] !== undefined) {
      updates.push(`${key} = ?`);
      args.push(b[key] || null);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "No valid fields to update" });
  updates.push("updated_at = datetime('now')");
  await db
    .prepare(`UPDATE staff SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`)
    .run(...args, req.user!.linkedStaffId, schoolId);
  res.json({ ok: true });
});

staffRouter.get("/:id", authorize("staff.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role === "STAFF" && req.params.id !== req.user!.linkedStaffId) {
    return res.status(404).json({ error: "Staff not found" });
  }
  const row = await db
    .prepare(`${withUserId} WHERE s.id = ? AND s.school_id = ?`)
    .get(req.params.id, schoolId);
  if (!row) return res.status(404).json({ error: "Staff not found" });
  res.json(row);
});

staffRouter.post("/", authorize("staff.create"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const b = req.body ?? {};
  const error = await validate(b, true);
  if (error) return res.status(400).json({ error });
  const department = normalizeDepartment(b.department);
  if (!department) return res.status(400).json({ error: "Department is required" });

  if (
    b.employeeId &&
    (await db
      .prepare("SELECT 1 FROM staff WHERE school_id = ? AND lower(employee_id) = lower(?)")
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
          `INSERT INTO staff
         (id, school_id, employee_id, name, department, designation, email, phone, employment_status, joining_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .run(
          id,
          schoolId,
          b.employeeId ? String(b.employeeId).trim() : null,
          String(b.name).trim(),
          department,
          b.designation ?? null,
          b.email || null,
          b.phone || null,
          String(b.employmentStatus ?? "ACTIVE").toUpperCase(),
          b.joiningDate || null,
        );

      if (login) {
        userId = randomUUID();
        await db
          .prepare(
            "INSERT INTO users (id, school_id, role, department, name, email, password_hash, linked_staff_id) VALUES (?, ?, 'STAFF', ?, ?, ?, ?, ?)",
          )
          .run(
            userId,
            schoolId,
            department,
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
      .json({ error: err instanceof Error ? err.message : "Staff could not be created" });
  }
});

staffRouter.patch("/:id", authorize("staff.update"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const old = (await db
    .prepare("SELECT * FROM staff WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as Record<string, unknown> | undefined;
  if (!old) return res.status(404).json({ error: "Staff not found" });
  const b = req.body ?? {};
  const error = await validate(b);
  if (error) return res.status(400).json({ error });

  if (
    b.employeeId &&
    (await db
      .prepare(
        "SELECT 1 FROM staff WHERE school_id = ? AND lower(employee_id) = lower(?) AND id <> ?",
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
    if (!allowed.includes(col)) continue;
    if (col === "employment_status") {
      updates.push(`${col} = ?`);
      args.push(String(value).toUpperCase());
    } else if (col === "department") {
      updates.push(`${col} = ?`);
      args.push(normalizeDepartment(value));
    } else {
      updates.push(`${col} = ?`);
      args.push(value || null);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "No valid fields to update" });

  const status =
    b.employmentStatus === undefined
      ? String(old.employment_status)
      : String(b.employmentStatus).toUpperCase();
  const department =
    b.department === undefined
      ? (old.department as string | null)
      : normalizeDepartment(b.department);

  try {
    await db.transaction(async () => {
      updates.push("updated_at = datetime('now')");
      await db
        .prepare(`UPDATE staff SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`)
        .run(...args, req.params.id, schoolId);
      await db
        .prepare(
          "UPDATE users SET status = ?, department = ? WHERE linked_staff_id = ? AND school_id = ?",
        )
        .run(loginStatusFor(status), department, req.params.id, schoolId);
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
      .json({ error: err instanceof Error ? err.message : "Staff could not be updated" });
  }
});

staffRouter.delete("/:id", authorize("staff.delete"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (
    !(await db
      .prepare("SELECT 1 FROM staff WHERE id = ? AND school_id = ?")
      .get(req.params.id, schoolId))
  ) {
    return res.status(404).json({ error: "Staff not found" });
  }

  // staff_attendance holds a real FK to staff(id); a linked login or any leave history is also
  // reason enough to archive (keep the record) rather than hard-delete.
  const referenced =
    Boolean(
      await db
        .prepare("SELECT 1 FROM staff_attendance WHERE staff_id = ? LIMIT 1")
        .get(req.params.id),
    ) ||
    Boolean(
      await db.prepare("SELECT 1 FROM users WHERE linked_staff_id = ? LIMIT 1").get(req.params.id),
    ) ||
    Boolean(
      await db
        .prepare(
          `SELECT 1 FROM leave_requests
           WHERE requester_type = 'STAFF' AND requester_id IN (SELECT id FROM users WHERE linked_staff_id = ?) LIMIT 1`,
        )
        .get(req.params.id),
    );

  async function archive() {
    await db
      .prepare(
        "UPDATE staff SET employment_status = 'ARCHIVED', updated_at = datetime('now') WHERE id = ? AND school_id = ?",
      )
      .run(req.params.id, schoolId);
    await db
      .prepare("UPDATE users SET status = 'SUSPENDED' WHERE linked_staff_id = ? AND school_id = ?")
      .run(req.params.id, schoolId);
  }

  if (referenced) {
    await archive();
    return res.json({ ok: true, archived: true });
  }
  try {
    await db
      .prepare("DELETE FROM staff WHERE id = ? AND school_id = ?")
      .run(req.params.id, schoolId);
    res.json({ ok: true, archived: false });
  } catch {
    await archive();
    res.json({ ok: true, archived: true });
  }
});
