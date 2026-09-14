import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { logAudit } from "./helpers.js";

export const paymentsRouter = Router();
paymentsRouter.use(authenticate, requireSuperAdmin);

paymentsRouter.get("/", async (_req, res) => {
  const rows = await db
    .prepare(
      `SELECT p.*, s.name AS school_name FROM payments p
       LEFT JOIN schools s ON s.id = p.school_id
       ORDER BY p.paid_on DESC, p.created_at DESC`,
    )
    .all();
  res.json(rows);
});

/** Records a payment and, unless disabled, extends the school's subscription (renewal). */
paymentsRouter.post("/", async (req, res) => {
  const { schoolId, amount, method, plan, extendsDays } = req.body ?? {};
  if (typeof schoolId !== "string" || !schoolId.trim())
    return res.status(400).json({ error: "schoolId is required" });
  if (typeof amount !== "number" || amount <= 0)
    return res.status(400).json({ error: "amount must be a positive number" });

  const school = (await db
    .prepare("SELECT id, subscription_expires_at FROM schools WHERE id = ?")
    .get(schoolId)) as { id: string; subscription_expires_at: string | null } | undefined;
  if (!school) return res.status(404).json({ error: "School not found" });

  const id = randomUUID();
  await db
    .prepare("INSERT INTO payments (id, school_id, amount, method, plan) VALUES (?, ?, ?, ?, ?)")
    .run(id, schoolId, amount, method ?? "Manual", plan ?? null);

  const days = typeof extendsDays === "number" && extendsDays > 0 ? extendsDays : 30;
  const base =
    school.subscription_expires_at && new Date(school.subscription_expires_at) > new Date()
      ? school.subscription_expires_at
      : null;
  await db
    .prepare(
      `UPDATE schools SET payment_status = 'PAID', status = CASE WHEN status IN ('TRIAL','EXPIRED','INACTIVE') THEN 'ACTIVE' ELSE status END,
     subscription_expires_at = date(COALESCE(?, 'now'), ? || ' days') WHERE id = ?`,
    )
    .run(base, String(days), schoolId);

  await logAudit(req, "payment.recorded", schoolId, `${amount} via ${method ?? "Manual"}`);
  res.status(201).json({ id });
});
