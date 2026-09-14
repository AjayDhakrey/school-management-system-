import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { logAudit } from "./helpers.js";

export const leadsRouter = Router();
leadsRouter.use(authenticate, requireSuperAdmin);

const STATUSES = ["NEW", "CONTACTED", "DEMO_SCHEDULED", "CONVERTED", "LOST"];

leadsRouter.get("/", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM leads ORDER BY created_at DESC").all());
});

leadsRouter.post("/", async (req, res) => {
  const { schoolName, contactName, email, phone, source, notes } = req.body ?? {};
  if (typeof schoolName !== "string" || !schoolName.trim()) {
    return res.status(400).json({ error: "schoolName is required" });
  }
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO leads (id, school_name, contact_name, email, phone, source, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      schoolName,
      contactName ?? null,
      email ?? null,
      phone ?? null,
      source ?? null,
      notes ?? null,
    );
  await logAudit(req, "lead.created", id, schoolName);
  res.status(201).json({ id });
});

leadsRouter.patch("/:id", async (req, res) => {
  const existing = await db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lead not found" });

  const { status, notes } = req.body ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];
  if (typeof status === "string") {
    if (!STATUSES.includes(status))
      return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
    updates.push("status = ?");
    params.push(status);
  }
  if (typeof notes === "string") {
    updates.push("notes = ?");
    params.push(notes);
  }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });

  params.push(req.params.id);
  await db.prepare(`UPDATE leads SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  await logAudit(req, "lead.updated", req.params.id, JSON.stringify(req.body));
  res.json({ ok: true });
});

leadsRouter.post("/:id/convert", async (req, res) => {
  const lead = (await db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id)) as
    | {
        id: string;
        school_name: string;
        email: string | null;
        phone: string | null;
        status: string;
      }
    | undefined;
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  if (lead.status === "CONVERTED") return res.status(400).json({ error: "Lead already converted" });

  const { plan, billingCycle } = req.body ?? {};
  const shortName = lead.school_name.split(" ").slice(0, 2).join(" ") || lead.school_name;
  const schoolId = `SCH-${String(Date.now()).slice(-6)}`;
  await db
    .prepare(
      `INSERT INTO schools (id, name, short_name, email, phone, status, plan, billing_cycle, payment_status, subscription_started_at)
     VALUES (?, ?, ?, ?, ?, 'TRIAL', ?, ?, 'PENDING', date('now'))`,
    )
    .run(
      schoolId,
      lead.school_name,
      shortName,
      lead.email,
      lead.phone,
      plan ?? "Basic",
      billingCycle ?? "MONTHLY",
    );

  await db.prepare("UPDATE leads SET status = 'CONVERTED' WHERE id = ?").run(lead.id);
  await logAudit(req, "lead.converted", lead.id, schoolId);
  res.status(201).json({ schoolId });
});
