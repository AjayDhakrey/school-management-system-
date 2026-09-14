import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";

export const schoolOptionsRouter = Router();
schoolOptionsRouter.use(authenticate);
const TYPES = ["teacher-designations", "staff-departments", "staff-designations"];

schoolOptionsRouter.get("/", authorize("settings.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const rows = (await db
    .prepare(
      "SELECT option_type, option_value FROM school_options WHERE school_id = ? ORDER BY option_value",
    )
    .all(schoolId)) as { option_type: string; option_value: string }[];
  res.json(
    Object.fromEntries(
      TYPES.map((type) => [
        type,
        rows.filter((row) => row.option_type === type).map((row) => row.option_value),
      ]),
    ),
  );
});

schoolOptionsRouter.post("/", authorize("settings.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { type, value } = req.body ?? {};
  if (
    !TYPES.includes(type) ||
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 100
  )
    return res.status(400).json({ error: "Valid option type and value are required" });
  await db
    .prepare(
      "INSERT INTO school_options (id, school_id, option_type, option_value) VALUES (?, ?, ?, ?) ON CONFLICT (school_id, option_type, option_value) DO NOTHING",
    )
    .run(randomUUID(), schoolId, type, value.trim());
  res.status(201).json({ ok: true });
});
