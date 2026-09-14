import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { logAudit } from "./helpers.js";

export const supportRouter = Router();
supportRouter.use(authenticate, requireSuperAdmin);

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

supportRouter.get("/", async (_req, res) => {
  const rows = await db
    .prepare(
      `SELECT t.*, s.name AS school_name FROM support_tickets t
       LEFT JOIN schools s ON s.id = t.school_id
       ORDER BY t.created_at DESC`,
    )
    .all();
  res.json(rows);
});

supportRouter.post("/", async (req, res) => {
  const { schoolId, subject, message, priority } = req.body ?? {};
  if (typeof subject !== "string" || !subject.trim())
    return res.status(400).json({ error: "subject is required" });
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO support_tickets (id, school_id, subject, message, priority) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, schoolId ?? null, subject, message ?? null, priority ?? "NORMAL");
  await logAudit(req, "ticket.created", id, subject);
  res.status(201).json({ id });
});

supportRouter.patch("/:id", async (req, res) => {
  const existing = await db
    .prepare("SELECT id FROM support_tickets WHERE id = ?")
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Ticket not found" });

  const { status } = req.body ?? {};
  if (typeof status !== "string" || !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  }
  await db.prepare("UPDATE support_tickets SET status = ? WHERE id = ?").run(status, req.params.id);
  await logAudit(req, "ticket.status_changed", req.params.id, status);
  res.json({ ok: true });
});
