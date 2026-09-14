import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { logAudit } from "./helpers.js";

export const announcementsRouter = Router();
announcementsRouter.use(authenticate, requireSuperAdmin);

announcementsRouter.get("/", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM announcements ORDER BY created_at DESC").all());
});

announcementsRouter.post("/", async (req, res) => {
  const { title, body, audience } = req.body ?? {};
  if (typeof title !== "string" || !title.trim())
    return res.status(400).json({ error: "title is required" });
  const id = randomUUID();
  await db
    .prepare("INSERT INTO announcements (id, title, body, audience) VALUES (?, ?, ?, ?)")
    .run(id, title, body ?? null, audience ?? "ALL");
  await logAudit(req, "announcement.created", id, title);
  res.status(201).json({ id });
});

announcementsRouter.delete("/:id", async (req, res) => {
  const result = await db.prepare("DELETE FROM announcements WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Announcement not found" });
  await logAudit(req, "announcement.deleted", req.params.id);
  res.json({ ok: true });
});
