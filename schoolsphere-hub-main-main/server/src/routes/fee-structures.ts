import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { logAudit } from "./helpers.js";

export const feeStructuresRouter = Router();
feeStructuresRouter.use(authenticate);

const CATEGORIES = [
  "Tuition",
  "Admission",
  "Transport",
  "Library",
  "Examination",
  "Activity",
  "Hostel",
  "Other",
];
const FREQUENCIES = ["Monthly", "Quarterly", "Term", "Annual", "One-Time"];
const STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"];
const dateValid = (value: unknown) =>
  value == null ||
  value === "" ||
  (typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

async function placement(schoolId: string, classId: unknown, academicYearId: unknown) {
  if (typeof academicYearId !== "string" || !academicYearId)
    return { error: "academicYearId is required" } as const;
  const year = (await db
    .prepare("SELECT id,name FROM academic_years WHERE id=? AND school_id=?")
    .get(academicYearId, schoolId)) as { id: string; name: string } | undefined;
  if (!year) return { error: "Academic year does not belong to this school" } as const;
  if (classId == null || classId === "") return { year, classRow: null } as const;
  if (typeof classId !== "string") return { error: "Invalid classId" } as const;
  const classRow = (await db
    .prepare(
      "SELECT id,name,section,academic_year_id FROM classes WHERE id=? AND school_id=? AND status='ACTIVE'",
    )
    .get(classId, schoolId)) as
    { id: string; name: string; section: string; academic_year_id: string } | undefined;
  if (!classRow || classRow.academic_year_id !== academicYearId)
    return { error: "Class does not belong to this school and academic year" } as const;
  return { year, classRow } as const;
}

feeStructuresRouter.get("/", authorize("fee_structures.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const where = ["fs.school_id=?"],
    params: unknown[] = [schoolId];
  for (const [key, column] of [
    ["academicYearId", "academic_year_id"],
    ["classId", "class_id"],
    ["category", "category"],
    ["status", "status"],
  ] as const) {
    const value = req.query[key];
    if (typeof value === "string" && value) {
      where.push(`fs.${column}=?`);
      params.push(value);
    }
  }
  res.json(
    await db
      .prepare(
        `SELECT fs.*,ay.name academic_year_name,c.name class_name,c.section FROM fee_structures fs LEFT JOIN academic_years ay ON ay.id=fs.academic_year_id LEFT JOIN classes c ON c.id=fs.class_id WHERE ${where.join(" AND ")} ORDER BY ay.start_date DESC,fs.category,fs.fee_type`,
      )
      .all(...params),
  );
});

feeStructuresRouter.post("/", authorize("fee_structures.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const body = req.body ?? {};
  const category = body.category ?? body.feeType ?? "Tuition",
    feeType = body.feeType ?? category;
  const frequency = body.frequency ?? "Annual",
    status = body.status ?? "ACTIVE";
  if (
    !CATEGORIES.includes(category) ||
    !FREQUENCIES.includes(frequency) ||
    !STATUSES.includes(status) ||
    typeof feeType !== "string" ||
    !feeType.trim() ||
    typeof body.amount !== "number" ||
    !Number.isFinite(body.amount) ||
    body.amount <= 0 ||
    !dateValid(body.dueDate) ||
    (body.description != null &&
      (typeof body.description !== "string" || body.description.length > 1000))
  )
    return res.status(400).json({ error: "Invalid fee structure values" });
  let academicYearId = body.academicYearId;
  if (!academicYearId && typeof body.session === "string")
    academicYearId = (
      (await db
        .prepare("SELECT id FROM academic_years WHERE school_id=? AND name=?")
        .get(schoolId, body.session)) as { id: string } | undefined
    )?.id;
  if (!academicYearId)
    academicYearId = (
      (await db
        .prepare("SELECT id FROM academic_years WHERE school_id=? AND status='ACTIVE'")
        .get(schoolId)) as { id: string } | undefined
    )?.id;
  const p = await placement(schoolId, body.classId, academicYearId);
  if ("error" in p) return res.status(400).json({ error: p.error });
  const duplicate = await db
    .prepare(
      "SELECT id FROM fee_structures WHERE school_id=? AND academic_year_id=? AND class_id IS NOT DISTINCT FROM ? AND lower(category)=lower(?) AND lower(fee_type)=lower(?) AND frequency=? AND due_date IS NOT DISTINCT FROM ? AND status='ACTIVE'",
    )
    .get(
      schoolId,
      academicYearId,
      body.classId || null,
      category,
      feeType.trim(),
      frequency,
      body.dueDate || null,
    );
  if (duplicate)
    return res.status(409).json({ error: "An equivalent active fee structure already exists" });
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO fee_structures(id,school_id,class_id,academic_year_id,fee_type,category,frequency,amount,due_date,status,description,session,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      schoolId,
      body.classId || null,
      academicYearId,
      feeType.trim(),
      category,
      frequency,
      body.amount,
      body.dueDate || null,
      status,
      body.description?.trim() || null,
      p.year.name,
      req.user!.id,
    );
  await logAudit(
    req,
    "fee_structure.created",
    id,
    JSON.stringify({
      category,
      frequency,
      amount: body.amount,
      academicYearId,
      classId: body.classId || null,
    }),
  );
  res.status(201).json({ id });
});

feeStructuresRouter.patch("/:id", authorize("fee_structures.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const old = (await db
    .prepare("SELECT * FROM fee_structures WHERE id=? AND school_id=?")
    .get(req.params.id, schoolId)) as Record<string, any> | undefined;
  if (!old) return res.status(404).json({ error: "Fee structure not found" });
  const b = req.body ?? {},
    category = b.category ?? old.category,
    frequency = b.frequency ?? old.frequency,
    amount = b.amount ?? old.amount,
    status = b.status ?? old.status;
  const academicYearId = b.academicYearId ?? old.academic_year_id,
    classId = b.classId === undefined ? old.class_id : b.classId;
  if (
    !CATEGORIES.includes(category) ||
    !FREQUENCIES.includes(frequency) ||
    !STATUSES.includes(status) ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !dateValid(b.dueDate === undefined ? old.due_date : b.dueDate)
  )
    return res.status(400).json({ error: "Invalid fee structure values" });
  const p = await placement(schoolId, classId, academicYearId);
  if ("error" in p) return res.status(400).json({ error: p.error });
  try {
    await db
      .prepare(
        `UPDATE fee_structures SET class_id=?,academic_year_id=?,fee_type=?,category=?,frequency=?,amount=?,due_date=?,status=?,description=?,session=?,updated_at=app_now() WHERE id=? AND school_id=?`,
      )
      .run(
        classId || null,
        academicYearId,
        b.feeType ?? old.fee_type,
        category,
        frequency,
        amount,
        b.dueDate === undefined ? old.due_date : b.dueDate || null,
        status,
        b.description === undefined ? old.description : b.description || null,
        p.year.name,
        req.params.id,
        schoolId,
      );
  } catch (error) {
    if (error instanceof Error && error.message.includes("uq_fee_structures_equivalent"))
      return res.status(409).json({ error: "An equivalent active fee structure already exists" });
    throw error;
  }
  await logAudit(
    req,
    "fee_structure.updated",
    req.params.id,
    JSON.stringify({ category, frequency, amount, status }),
  );
  res.json({ ok: true });
});

feeStructuresRouter.delete("/:id", authorize("fee_structures.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (
    !(await db
      .prepare("SELECT 1 FROM fee_structures WHERE id=? AND school_id=?")
      .get(req.params.id, schoolId))
  )
    return res.status(404).json({ error: "Fee structure not found" });
  if (
    await db
      .prepare("SELECT 1 FROM fees WHERE fee_structure_id=? AND school_id=? LIMIT 1")
      .get(req.params.id, schoolId)
  )
    return res
      .status(409)
      .json({ error: "Assigned fee structures cannot be deleted; archive them instead" });
  await db
    .prepare("DELETE FROM fee_structures WHERE id=? AND school_id=?")
    .run(req.params.id, schoolId);
  await logAudit(req, "fee_structure.deleted", req.params.id);
  res.json({ ok: true });
});
