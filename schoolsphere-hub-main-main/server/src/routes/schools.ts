import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { logAudit } from "./helpers.js";

export const schoolsRouter = Router();
schoolsRouter.use(authenticate, requireSuperAdmin);

interface SchoolRow {
  id: string;
  name: string;
  short_name: string;
  status: string;
  plan: string;
}

interface AdminRow {
  id: string;
  name: string;
  email: string;
}

async function adminForSchool(schoolId: string) {
  return (
    ((await db
      .prepare(
        "SELECT id, name, email FROM users WHERE school_id = ? AND role = 'SCHOOL_ADMIN' LIMIT 1",
      )
      .get(schoolId)) as AdminRow | undefined) ?? null
  );
}

// SaaS/platform-level view only — never school-internal counts (students, teachers, etc).
schoolsRouter.get("/", async (_req, res) => {
  const schools = (await db
    .prepare("SELECT * FROM schools ORDER BY name")
    .all()) as unknown as SchoolRow[];
  const withAdmin = await Promise.all(
    schools.map(async (s) => ({ ...s, admin: await adminForSchool(s.id) })),
  );
  res.json(withAdmin);
});

schoolsRouter.get("/:id", async (req, res) => {
  const school = await db.prepare("SELECT * FROM schools WHERE id = ?").get(req.params.id);
  if (!school) return res.status(404).json({ error: "School not found" });
  res.json({ ...school, admin: await adminForSchool(req.params.id) });
});

schoolsRouter.post("/", async (req, res) => {
  const { name, shortName, email, phone, address, plan, billingCycle, subscriptionExpiresAt } =
    req.body ?? {};
  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof shortName !== "string" ||
    !shortName.trim()
  ) {
    return res.status(400).json({ error: "name and shortName are required" });
  }

  const id = `SCH-${String(Date.now()).slice(-6)}`;
  await db
    .prepare(
      `INSERT INTO schools (id, name, short_name, address, phone, email, status, plan, billing_cycle, payment_status, subscription_started_at, subscription_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'TRIAL', ?, ?, 'PENDING', date('now'), ?)`,
    )
    .run(
      id,
      name,
      shortName,
      address ?? null,
      phone ?? null,
      email ?? null,
      plan ?? "Basic",
      billingCycle ?? "MONTHLY",
      subscriptionExpiresAt ?? null,
    );

  await logAudit(req, "school.created", id, name);
  res.status(201).json({ id });
});

schoolsRouter.patch("/:id", async (req, res) => {
  const existing = await db.prepare("SELECT id FROM schools WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "School not found" });

  const keyMap: Record<string, string> = {
    shortName: "short_name",
    billingCycle: "billing_cycle",
    paymentStatus: "payment_status",
    subscriptionStartedAt: "subscription_started_at",
    subscriptionExpiresAt: "subscription_expires_at",
  };
  const allowed = [
    "name",
    "short_name",
    "address",
    "phone",
    "email",
    "plan",
    "billing_cycle",
    "payment_status",
    "subscription_started_at",
    "subscription_expires_at",
  ];

  const updates: string[] = [];
  const params: unknown[] = [];
  for (const [bodyKey, value] of Object.entries(req.body ?? {})) {
    const column = keyMap[bodyKey] ?? bodyKey;
    if (allowed.includes(column)) {
      updates.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });

  params.push(req.params.id);
  await db.prepare(`UPDATE schools SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  await logAudit(req, "school.updated", req.params.id, JSON.stringify(req.body));
  res.json({ ok: true });
});

schoolsRouter.patch("/:id/status", async (req, res) => {
  const { status } = req.body ?? {};
  const allowed = ["ACTIVE", "INACTIVE", "SUSPENDED", "TRIAL", "EXPIRED"];
  if (!allowed.includes(status))
    return res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });

  const result = await db
    .prepare("UPDATE schools SET status = ? WHERE id = ?")
    .run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "School not found" });
  await logAudit(req, "school.status_changed", req.params.id, status);
  res.json({ ok: true });
});

/** Creates the School Admin account for a school, or replaces it (reset access) if one already exists. */
schoolsRouter.post("/:id/admin", async (req, res) => {
  const school = (await db
    .prepare("SELECT id, name FROM schools WHERE id = ?")
    .get(req.params.id)) as { id: string } | undefined;
  if (!school) return res.status(404).json({ error: "School not found" });

  const { name, email, password } = req.body ?? {};
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128 ||
    (name !== undefined && (typeof name !== "string" || name.length > 120))
  ) {
    return res
      .status(400)
      .json({ error: "valid email and a password of 8 to 128 characters are required" });
  }

  const existingAdmin = await adminForSchool(req.params.id);
  const passwordHash = bcrypt.hashSync(password, 10);

  if (existingAdmin) {
    await db
      .prepare(
        "UPDATE users SET name = COALESCE(?, name), email = ?, password_hash = ? WHERE id = ?",
      )
      .run(name ?? null, email.toLowerCase().trim(), passwordHash, existingAdmin.id);
    await logAudit(req, "school_admin.reset", existingAdmin.id, req.params.id);
    return res.json({ id: existingAdmin.id, reset: true });
  }

  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, school_id, role, name, email, password_hash) VALUES (?, ?, 'SCHOOL_ADMIN', ?, ?, ?)`,
    )
    .run(id, req.params.id, name ?? "School Admin", email.toLowerCase().trim(), passwordHash);
  await logAudit(req, "school_admin.created", id, req.params.id);
  res.status(201).json({ id, reset: false });
});
