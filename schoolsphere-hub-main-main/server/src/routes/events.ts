import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";

export const eventsRouter = Router();
eventsRouter.use(authenticate);
const CATEGORIES = ["Sports", "Academic", "Meeting", "Holiday", "Cultural"];

eventsRouter.get("/", authorize("holidays.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  res.json(
    await db
      .prepare(
        "SELECT id, school_id, title, event_date AS date, event_time AS time, location, category, description FROM school_events WHERE school_id = ? ORDER BY event_date, event_time",
      )
      .all(schoolId),
  );
});

eventsRouter.post("/", authorize("holidays.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { title, date, time, location, category, description } = req.body ?? {};
  if (
    [title, date, time, location, category, description].some(
      (v) => typeof v !== "string" || !v.trim(),
    )
  )
    return res.status(400).json({ error: "All event fields are required" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))
    return res.status(400).json({ error: "A valid event date is required" });
  if (!CATEGORIES.includes(category))
    return res.status(400).json({ error: "Invalid event category" });
  if (title.length > 200 || time.length > 100 || location.length > 300 || description.length > 5000)
    return res.status(400).json({ error: "Event field is too long" });
  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO school_events (id, school_id, title, event_date, event_time, location, category, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      schoolId,
      title.trim(),
      date,
      time.trim(),
      location.trim(),
      category,
      description.trim(),
      req.user!.id,
    );
  res.status(201).json({ id });
});

eventsRouter.delete("/:id", authorize("holidays.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const result = await db
    .prepare("DELETE FROM school_events WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  if (!result.changes) return res.status(404).json({ error: "Event not found" });
  res.json({ ok: true });
});
