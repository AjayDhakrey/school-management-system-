import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";

export const holidaysRouter = Router();
holidaysRouter.use(authenticate);

holidaysRouter.get("/", authorize("holidays.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  res.json(
    await db.prepare("SELECT * FROM holidays WHERE school_id = ? ORDER BY date").all(schoolId),
  );
});

holidaysRouter.post("/", authorize("holidays.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, date, day, type, session } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || typeof date !== "string" || !date.trim()) {
    return res.status(400).json({ error: "name and date are required" });
  }
  if (
    name.trim().length > 150 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  )
    return res.status(400).json({ error: "Provide a valid name and date in YYYY-MM-DD format" });
  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO holidays (id, school_id, name, date, day, type, session) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, schoolId, name.trim(), date, day ?? null, type ?? "Holiday", session ?? null);
  res.status(201).json({ id });
});

holidaysRouter.delete("/:id", authorize("holidays.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const result = await db
    .prepare("DELETE FROM holidays WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  if (result.changes === 0) return res.status(404).json({ error: "Holiday not found" });
  res.json({ ok: true });
});
