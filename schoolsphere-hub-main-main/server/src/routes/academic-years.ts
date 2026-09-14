import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";

export const academicYearsRouter = Router();
academicYearsRouter.use(authenticate);

const STATUSES = ["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"];

function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

academicYearsRouter.get("/", authorize("academic_years.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  res.json(
    await db
      .prepare("SELECT * FROM academic_years WHERE school_id = ? ORDER BY start_date DESC")
      .all(schoolId),
  );
});

academicYearsRouter.get("/:id", authorize("academic_years.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const row = await db
    .prepare("SELECT * FROM academic_years WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!row) return res.status(404).json({ error: "Academic year not found" });
  res.json(row);
});

academicYearsRouter.post("/", authorize("academic_years.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, startDate, endDate } = req.body ?? {};
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 30 ||
    !validDate(startDate) ||
    !validDate(endDate)
  ) {
    return res.status(400).json({ error: "name and valid startDate/endDate are required" });
  }
  if (startDate >= endDate)
    return res.status(400).json({ error: "endDate must be after startDate" });
  if (
    await db
      .prepare("SELECT 1 FROM academic_years WHERE school_id = ? AND lower(name) = lower(?)")
      .get(schoolId, name.trim())
  ) {
    return res.status(409).json({ error: "Academic year already exists" });
  }
  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO academic_years (id, school_id, name, start_date, end_date) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, schoolId, name.trim(), startDate, endDate);
  res.status(201).json({ id });
});

academicYearsRouter.patch("/:id", authorize("academic_years.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare("SELECT * FROM academic_years WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as
    { name: string; start_date: string; end_date: string; status: string } | undefined;
  if (!existing) return res.status(404).json({ error: "Academic year not found" });
  const name = req.body?.name === undefined ? existing.name : req.body.name;
  const startDate = req.body?.startDate === undefined ? existing.start_date : req.body.startDate;
  const endDate = req.body?.endDate === undefined ? existing.end_date : req.body.endDate;
  const status = req.body?.status === undefined ? existing.status : req.body.status;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 30 ||
    !validDate(startDate) ||
    !validDate(endDate) ||
    !STATUSES.includes(status)
  ) {
    return res.status(400).json({ error: "Invalid academic year values" });
  }
  if (startDate >= endDate)
    return res.status(400).json({ error: "endDate must be after startDate" });
  const duplicate = await db
    .prepare(
      "SELECT 1 FROM academic_years WHERE school_id = ? AND lower(name) = lower(?) AND id <> ?",
    )
    .get(schoolId, name.trim(), req.params.id);
  if (duplicate) return res.status(409).json({ error: "Academic year already exists" });

  await db.transaction(async () => {
    if (status === "ACTIVE")
      await db
        .prepare(
          "UPDATE academic_years SET status = 'CLOSED' WHERE school_id = ? AND status = 'ACTIVE' AND id <> ?",
        )
        .run(schoolId, req.params.id);
    await db
      .prepare(
        "UPDATE academic_years SET name = ?, start_date = ?, end_date = ?, status = ? WHERE id = ? AND school_id = ?",
      )
      .run(name.trim(), startDate, endDate, status, req.params.id, schoolId);
    if (status === "ACTIVE")
      await db.prepare("UPDATE schools SET session = ? WHERE id = ?").run(name.trim(), schoolId);
  });
  res.json({ ok: true });
});

academicYearsRouter.delete("/:id", authorize("academic_years.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const year = (await db
    .prepare("SELECT status FROM academic_years WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as { status: string } | undefined;
  if (!year) return res.status(404).json({ error: "Academic year not found" });
  if (year.status === "ACTIVE")
    return res
      .status(409)
      .json({ error: "Active academic year cannot be deleted; close or archive it first" });
  const used = await db
    .prepare("SELECT 1 FROM classes WHERE academic_year_id = ? AND school_id = ? LIMIT 1")
    .get(req.params.id, schoolId);
  if (used)
    return res
      .status(409)
      .json({ error: "Academic year is referenced by classes and cannot be deleted" });
  await db
    .prepare("DELETE FROM academic_years WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  res.json({ ok: true });
});
