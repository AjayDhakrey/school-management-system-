import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import type { Request } from "express";

export const admissionsRouter = Router();
admissionsRouter.use(authenticate);

const STAGES = [
  "ENQUIRY",
  "APPLICATION",
  "DOCUMENT_VERIFICATION",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "WAITLISTED",
  "CONVERTED",
] as const;
type Stage = (typeof STAGES)[number];

/** Which stages a transition may move to from a given stage — guards against skipping/invalid moves. */
const NEXT_STAGES: Record<Stage, Stage[]> = {
  ENQUIRY: ["APPLICATION", "REJECTED"],
  APPLICATION: ["DOCUMENT_VERIFICATION", "REJECTED"],
  DOCUMENT_VERIFICATION: ["UNDER_REVIEW", "APPLICATION", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "WAITLISTED", "DOCUMENT_VERIFICATION"],
  WAITLISTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  APPROVED: ["REJECTED"], // conversion is its own dedicated endpoint, not a plain stage move
  REJECTED: ["UNDER_REVIEW"], // allow reopening a rejected application
  CONVERTED: [],
};

/** Legacy `status` column kept in sync for back-compat with Dashboard/Reports, which never read `stage` directly for coloring. */
function statusForStage(stage: Stage): string {
  switch (stage) {
    case "ENQUIRY":
      return "New";
    case "WAITLISTED":
      return "Waitlisted";
    case "APPROVED":
    case "CONVERTED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return "Pending";
  }
}

async function actorName(req: Request) {
  const actor = req.user;
  if (!actor) return null;
  const row = (await db.prepare("SELECT name FROM users WHERE id = ?").get(actor.id)) as
    { name: string } | undefined;
  return row?.name ?? null;
}

/** Generates a unique, school-scoped sequential code like "SCH-0001-APP-1000", retrying past collisions. */
async function generateCode(schoolId: string, infix: "APP" | "ADM") {
  const column = infix === "APP" ? "application_no" : "admission_no";
  const table = infix === "APP" ? "admissions" : "students";
  const countRow = (await db
    .prepare(`SELECT COUNT(*) as n FROM ${table} WHERE school_id = ?`)
    .get(schoolId)) as { n: number };
  let seq = 1000 + countRow.n;
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = `${schoolId}-${infix}-${seq}`;
    const exists = await db
      .prepare(`SELECT 1 FROM ${table} WHERE school_id = ? AND ${column} = ?`)
      .get(schoolId, code);
    if (!exists) return code;
    seq++;
  }
  return `${schoolId}-${infix}-${Date.now()}`;
}

interface AdmissionRow {
  id: string;
  school_id: string;
  application_no: string | null;
  applicant: string;
  dob: string | null;
  gender: string | null;
  address: string | null;
  class_applied: string | null;
  section_applied: string | null;
  class_id_applied: string | null;
  academic_year: string | null;
  academic_year_id: string | null;
  parent_name: string | null;
  parent_relation: string | null;
  previous_school: string | null;
  previous_class: string | null;
  previous_board: string | null;
  previous_percentage: string | null;
  applied_on: string | null;
  status: string | null;
  stage: Stage;
  contact_email: string | null;
  contact_phone: string | null;
  admission_no: string | null;
  converted_student_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\-\s0-9]{7,20}$/;
function validateAdmission(body: Record<string, unknown>) {
  if (
    body.applicant !== undefined &&
    (typeof body.applicant !== "string" ||
      !body.applicant.trim() ||
      body.applicant.trim().length > 150)
  )
    return "A valid applicant name is required";
  if (
    body.contactEmail &&
    (typeof body.contactEmail !== "string" ||
      body.contactEmail.length > 254 ||
      !EMAIL.test(body.contactEmail))
  )
    return "Invalid contact email";
  if (
    body.contactPhone &&
    (typeof body.contactPhone !== "string" || !PHONE.test(body.contactPhone))
  )
    return "Invalid contact phone";
  if (
    body.dob &&
    (typeof body.dob !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.dob) ||
      Number.isNaN(Date.parse(body.dob)) ||
      body.dob > new Date().toISOString().slice(0, 10))
  )
    return "DOB must be valid and cannot be in the future";
  for (const key of ["address", "parentName", "previousSchool"] as const)
    if (
      body[key] != null &&
      (typeof body[key] !== "string" || body[key].length > (key === "address" ? 1000 : 200))
    )
      return `${key} is too long`;
  return null;
}

async function admissionPlacement(schoolId: string, classId: unknown, yearId: unknown) {
  if (typeof classId !== "string" || !classId)
    return { error: "An active class is required" } as const;
  const row = (await db
    .prepare(
      `SELECT c.id,c.name,c.section,c.academic_year_id,ay.name AS academic_year_name FROM classes c JOIN academic_years ay ON ay.id=c.academic_year_id AND ay.school_id=c.school_id WHERE c.id=? AND c.school_id=? AND c.status='ACTIVE'`,
    )
    .get(classId, schoolId)) as
    | {
        id: string;
        name: string;
        section: string;
        academic_year_id: string;
        academic_year_name: string;
      }
    | undefined;
  if (!row) return { error: "Class does not belong to this school or is inactive" } as const;
  if (yearId && yearId !== row.academic_year_id)
    return { error: "Class does not belong to the selected academic year" } as const;
  return { row } as const;
}

async function recordHistory(
  schoolId: string,
  admissionId: string,
  fromStage: string | null,
  toStage: string,
  remarks: string | null,
  req: Request,
) {
  await db
    .prepare(
      `INSERT INTO admission_status_history (id, school_id, admission_id, from_stage, to_stage, remarks, changed_by, changed_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      schoolId,
      admissionId,
      fromStage,
      toStage,
      remarks ?? null,
      req.user?.id ?? null,
      await actorName(req),
    );
}

/** Finds existing admissions/students/parents sharing this phone or email — surfaced to the caller so staff can catch duplicate enrolments. */
async function findDuplicates(
  schoolId: string,
  phone: string | null,
  email: string | null,
  excludeAdmissionId?: string,
) {
  if (!phone && !email) return [];
  const matches: { type: string; id: string; label: string }[] = [];

  const admissionRows = (await db
    .prepare(
      `SELECT id, applicant, contact_phone, contact_email FROM admissions
       WHERE school_id = ? AND stage NOT IN ('REJECTED', 'CONVERTED') AND id != ?
       AND ((contact_phone IS NOT NULL AND contact_phone = ?) OR (contact_email IS NOT NULL AND contact_email = ?))`,
    )
    .all(schoolId, excludeAdmissionId ?? "", phone ?? "", email ?? "")) as {
    id: string;
    applicant: string;
  }[];
  for (const r of admissionRows)
    matches.push({ type: "admission", id: r.id, label: `Application: ${r.applicant}` });

  const studentRows = (await db
    .prepare(
      `SELECT id, name FROM students WHERE school_id = ?
       AND ((phone IS NOT NULL AND phone = ?) OR (email IS NOT NULL AND email = ?))`,
    )
    .all(schoolId, phone ?? "", email ?? "")) as { id: string; name: string }[];
  for (const r of studentRows)
    matches.push({ type: "student", id: r.id, label: `Existing student: ${r.name}` });

  const parentRows = (await db
    .prepare(
      `SELECT id, name FROM parents WHERE school_id = ?
       AND ((phone IS NOT NULL AND phone = ?) OR (email IS NOT NULL AND email = ?))`,
    )
    .all(schoolId, phone ?? "", email ?? "")) as { id: string; name: string }[];
  for (const r of parentRows)
    matches.push({ type: "parent", id: r.id, label: `Existing guardian: ${r.name}` });

  return matches;
}

admissionsRouter.get("/", authorize("admissions.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  res.json(
    await db
      .prepare("SELECT * FROM admissions WHERE school_id = ? ORDER BY created_at DESC")
      .all(schoolId),
  );
});

/** Duplicate check without side effects — lets the "New Enquiry/Application" form warn before submit. Must stay above GET /:id. */
admissionsRouter.get("/check-duplicate", authorize("admissions.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const phone =
    typeof req.query.phone === "string" && req.query.phone.trim() ? req.query.phone.trim() : null;
  const email =
    typeof req.query.email === "string" && req.query.email.trim() ? req.query.email.trim() : null;
  res.json({ matches: await findDuplicates(schoolId, phone, email) });
});

admissionsRouter.get("/:id", authorize("admissions.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const admission = (await db
    .prepare("SELECT * FROM admissions WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as AdmissionRow | undefined;
  if (!admission) return res.status(404).json({ error: "Admission not found" });

  const documents = await db
    .prepare(
      "SELECT * FROM admission_documents WHERE admission_id = ? AND school_id = ? ORDER BY uploaded_at DESC",
    )
    .all(req.params.id, schoolId);
  const notes = await db
    .prepare(
      "SELECT * FROM admission_notes WHERE admission_id = ? AND school_id = ? ORDER BY created_at DESC",
    )
    .all(req.params.id, schoolId);
  const history = await db
    .prepare(
      "SELECT * FROM admission_status_history WHERE admission_id = ? AND school_id = ? ORDER BY changed_at DESC",
    )
    .all(req.params.id, schoolId);

  res.json({ ...admission, documentsList: documents, notesList: notes, history });
});

admissionsRouter.post("/", authorize("admissions.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const body = req.body ?? {};
  const validationError = validateAdmission(body);
  if (validationError) return res.status(400).json({ error: validationError });
  const {
    applicant,
    dob,
    gender,
    address,
    classApplied,
    sectionApplied,
    classIdApplied,
    academicYearId,
    academicYear,
    parentName,
    parentRelation,
    contactEmail,
    contactPhone,
    previousSchool,
    previousClass,
    previousBoard,
    previousPercentage,
    stage,
    force,
  } = body;

  if (typeof applicant !== "string" || !applicant.trim()) {
    return res.status(400).json({ error: "Applicant name is required" });
  }
  const phone =
    typeof contactPhone === "string" && contactPhone.trim() ? contactPhone.trim() : null;
  const email =
    typeof contactEmail === "string" && contactEmail.trim() ? contactEmail.trim() : null;
  if (!phone && !email) {
    return res.status(400).json({ error: "At least one of contact phone or email is required" });
  }

  if (!force) {
    const duplicates = await findDuplicates(schoolId, phone, email);
    if (duplicates.length > 0) {
      return res.status(409).json({ error: "Possible duplicate application found", duplicates });
    }
  }

  const initialStage: Stage = stage === "APPLICATION" ? "APPLICATION" : "ENQUIRY";
  const selectedPlacement = classIdApplied
    ? await admissionPlacement(schoolId, classIdApplied, academicYearId)
    : null;
  if (selectedPlacement && "error" in selectedPlacement)
    return res.status(400).json({ error: selectedPlacement.error });
  const id = randomUUID();
  const applicationNo = await generateCode(schoolId, "APP");

  await db
    .prepare(
      `INSERT INTO admissions
       (id, school_id, application_no, applicant, dob, gender, address, class_applied, section_applied, class_id_applied,
        academic_year, academic_year_id, parent_name, parent_relation, contact_email, contact_phone, previous_school, previous_class,
        previous_board, previous_percentage, applied_on, status, stage, created_by, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?)`,
    )
    .run(
      id,
      schoolId,
      applicationNo,
      applicant.trim(),
      dob ?? null,
      gender ?? null,
      address ?? null,
      selectedPlacement?.row.name ?? classApplied ?? null,
      selectedPlacement?.row.section ?? sectionApplied ?? null,
      selectedPlacement?.row.id ?? null,
      selectedPlacement?.row.academic_year_name ?? academicYear ?? null,
      selectedPlacement?.row.academic_year_id ?? null,
      parentName ?? null,
      parentRelation ?? null,
      email,
      phone,
      previousSchool ?? null,
      previousClass ?? null,
      previousBoard ?? null,
      previousPercentage ?? null,
      statusForStage(initialStage),
      initialStage,
      req.user?.id ?? null,
      await actorName(req),
    );
  await recordHistory(schoolId, id, null, initialStage, "Application created", req);

  res.status(201).json({ id, applicationNo });
});

admissionsRouter.patch("/:id", authorize("admissions.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare("SELECT id, stage FROM admissions WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as { id: string; stage: Stage } | undefined;
  if (!existing) return res.status(404).json({ error: "Admission not found" });
  if (existing.stage === "CONVERTED")
    return res.status(400).json({ error: "Converted applications can no longer be edited" });
  const validationError = validateAdmission(req.body ?? {});
  if (validationError) return res.status(400).json({ error: validationError });
  const current = (await db
    .prepare("SELECT class_id_applied, academic_year_id FROM admissions WHERE id=? AND school_id=?")
    .get(req.params.id, schoolId)) as {
    class_id_applied: string | null;
    academic_year_id: string | null;
  };
  const requestedClass =
    req.body?.classIdApplied !== undefined ? req.body.classIdApplied : current.class_id_applied;
  const requestedYear =
    req.body?.academicYearId !== undefined ? req.body.academicYearId : current.academic_year_id;
  const selectedPlacement = requestedClass
    ? await admissionPlacement(schoolId, requestedClass, requestedYear)
    : null;
  if (selectedPlacement && "error" in selectedPlacement)
    return res.status(400).json({ error: selectedPlacement.error });

  const keyMap: Record<string, string> = {
    dob: "dob",
    gender: "gender",
    address: "address",
    classApplied: "class_applied",
    sectionApplied: "section_applied",
    classIdApplied: "class_id_applied",
    academicYear: "academic_year",
    academicYearId: "academic_year_id",
    parentName: "parent_name",
    parentRelation: "parent_relation",
    contactEmail: "contact_email",
    contactPhone: "contact_phone",
    previousSchool: "previous_school",
    previousClass: "previous_class",
    previousBoard: "previous_board",
    previousPercentage: "previous_percentage",
    applicant: "applicant",
  };
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const [bodyKey, value] of Object.entries(req.body ?? {})) {
    const column = keyMap[bodyKey];
    if (!column) continue;
    updates.push(`${column} = ?`);
    params.push(value);
  }
  if (req.body?.classIdApplied !== undefined || req.body?.academicYearId !== undefined) {
    updates.push(
      "class_id_applied = ?",
      "class_applied = ?",
      "section_applied = ?",
      "academic_year_id = ?",
      "academic_year = ?",
    );
    params.push(
      selectedPlacement?.row.id ?? null,
      selectedPlacement?.row.name ?? null,
      selectedPlacement?.row.section ?? null,
      selectedPlacement?.row.academic_year_id ?? null,
      selectedPlacement?.row.academic_year_name ?? null,
    );
  }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });
  updates.push("updated_at = datetime('now')");
  params.push(req.params.id, schoolId);
  await db
    .prepare(`UPDATE admissions SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`)
    .run(...params);
  res.json({ ok: true });
});

admissionsRouter.delete("/:id", authorize("admissions.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare("SELECT stage FROM admissions WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as { stage: Stage } | undefined;
  if (!existing) return res.status(404).json({ error: "Admission not found" });
  if (existing.stage === "CONVERTED")
    return res.status(400).json({ error: "Cannot delete a converted application" });

  await db
    .prepare("DELETE FROM admission_documents WHERE admission_id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  await db
    .prepare("DELETE FROM admission_notes WHERE admission_id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  await db
    .prepare("DELETE FROM admission_status_history WHERE admission_id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  await db
    .prepare("DELETE FROM admissions WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  res.json({ ok: true });
});

/** Moves an application to a new stage (Approve/Reject/Waitlist/advance/reopen) — always logged to status history. */
admissionsRouter.post("/:id/transition", authorize("admissions.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare("SELECT * FROM admissions WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as AdmissionRow | undefined;
  if (!existing) return res.status(404).json({ error: "Admission not found" });

  const { toStage, remarks } = req.body ?? {};
  if (typeof toStage !== "string" || !STAGES.includes(toStage as Stage)) {
    return res.status(400).json({ error: `toStage must be one of ${STAGES.join(", ")}` });
  }
  const allowed = NEXT_STAGES[existing.stage] ?? [];
  if (!allowed.includes(toStage as Stage)) {
    return res.status(400).json({ error: `Cannot move from ${existing.stage} to ${toStage}` });
  }
  if (toStage === "APPROVED") {
    const selectedPlacement = await admissionPlacement(
      schoolId,
      existing.class_id_applied,
      existing.academic_year_id,
    );
    if ("error" in selectedPlacement)
      return res.status(400).json({ error: `Cannot approve: ${selectedPlacement.error}` });
  }

  await db
    .prepare(
      "UPDATE admissions SET stage = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?",
    )
    .run(toStage, statusForStage(toStage as Stage), req.params.id, schoolId);
  await recordHistory(schoolId, req.params.id, existing.stage, toStage, remarks ?? null, req);
  res.json({ ok: true });
});

admissionsRouter.post("/:id/documents", authorize("admissions.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const admission = await db
    .prepare("SELECT id FROM admissions WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!admission) return res.status(404).json({ error: "Admission not found" });

  const { name, docType, fileData, fileMime } = req.body ?? {};
  if (typeof name !== "string" || !name.trim())
    return res.status(400).json({ error: "Document name is required" });
  if (typeof fileData !== "string" || !fileData.startsWith("data:")) {
    return res.status(400).json({ error: "fileData must be a data: URL" });
  }
  if (fileData.length > 8_000_000)
    return res.status(413).json({ error: "File is too large (max ~6MB)" });

  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO admission_documents (id, school_id, admission_id, name, doc_type, file_data, file_mime, uploaded_by, uploaded_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      schoolId,
      req.params.id,
      name.trim(),
      docType ?? null,
      fileData,
      fileMime ?? null,
      req.user?.id ?? null,
      await actorName(req),
    );
  res.status(201).json({ id });
});

admissionsRouter.patch(
  "/:id/documents/:docId",
  authorize("admissions.manage"),
  async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const existing = await db
      .prepare(
        "SELECT id FROM admission_documents WHERE id = ? AND admission_id = ? AND school_id = ?",
      )
      .get(req.params.docId, req.params.id, schoolId);
    if (!existing) return res.status(404).json({ error: "Document not found" });

    const { status, remarks } = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];
    if (typeof status === "string") {
      if (!["Pending", "Verified", "Rejected"].includes(status)) {
        return res.status(400).json({ error: "status must be Pending, Verified or Rejected" });
      }
      updates.push("status = ?", "verified_by_name = ?", "verified_at = datetime('now')");
      params.push(status, await actorName(req));
    }
    if (typeof remarks === "string") {
      updates.push("remarks = ?");
      params.push(remarks);
    }
    if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });
    params.push(req.params.docId, schoolId);
    await db
      .prepare(
        `UPDATE admission_documents SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`,
      )
      .run(...params);
    res.json({ ok: true });
  },
);

admissionsRouter.delete(
  "/:id/documents/:docId",
  authorize("admissions.manage"),
  async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const result = await db
      .prepare(
        "DELETE FROM admission_documents WHERE id = ? AND admission_id = ? AND school_id = ?",
      )
      .run(req.params.docId, req.params.id, schoolId);
    if (result.changes === 0) return res.status(404).json({ error: "Document not found" });
    res.json({ ok: true });
  },
);

admissionsRouter.post("/:id/notes", authorize("admissions.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const admission = await db
    .prepare("SELECT id FROM admissions WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!admission) return res.status(404).json({ error: "Admission not found" });

  const { note } = req.body ?? {};
  if (typeof note !== "string" || !note.trim())
    return res.status(400).json({ error: "note is required" });

  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO admission_notes (id, school_id, admission_id, author_id, author_name, note) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, schoolId, req.params.id, req.user?.id ?? null, await actorName(req), note.trim());
  res.status(201).json({ id });
});

/** Converts an Approved application into a real student — the only stage this is allowed from. */
admissionsRouter.post("/:id/convert", authorize("admissions.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const admission = (await db
    .prepare("SELECT * FROM admissions WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as AdmissionRow | undefined;
  if (!admission) return res.status(404).json({ error: "Admission not found" });
  if (admission.stage !== "APPROVED") {
    return res
      .status(400)
      .json({ error: "Only Approved applications can be converted to a student" });
  }
  if (admission.converted_student_id)
    return res.status(409).json({ error: "Application has already been converted" });
  const selectedPlacement = await admissionPlacement(
    schoolId,
    admission.class_id_applied,
    admission.academic_year_id,
  );
  if ("error" in selectedPlacement) return res.status(400).json({ error: selectedPlacement.error });

  let studentId = "";
  let admissionNo = "";
  try {
    await db.transaction(async () => {
      // Reuse an existing guardian record matched by contact details, otherwise create one from the applicant's parent details.
      let parentId: string | null = null;
      if (admission.contact_phone || admission.contact_email) {
        const existingParent = (await db
          .prepare(
            `SELECT id FROM parents WHERE school_id = ?
         AND ((phone IS NOT NULL AND phone = ?) OR (email IS NOT NULL AND email = ?))`,
          )
          .get(schoolId, admission.contact_phone ?? "", admission.contact_email ?? "")) as
          { id: string } | undefined;
        parentId = existingParent?.id ?? null;
      }
      if (!parentId && admission.parent_name) {
        parentId = randomUUID();
        await db
          .prepare(
            "INSERT INTO parents (id, school_id, name, email, phone, linked_student_ids) VALUES (?, ?, ?, ?, ?, '[]')",
          )
          .run(
            parentId,
            schoolId,
            admission.parent_name,
            admission.contact_email ?? null,
            admission.contact_phone ?? null,
          );
      }

      admissionNo = await generateCode(schoolId, "ADM");
      studentId = randomUUID();
      await db
        .prepare(
          `INSERT INTO students
       (id, school_id, name, admission_no, class_id, academic_year_id, class_name, section, parent_id, status, admitted_on, email, phone, dob, gender, address, previous_school, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', date('now'), ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .run(
          studentId,
          schoolId,
          admission.applicant,
          admissionNo,
          selectedPlacement.row.id,
          selectedPlacement.row.academic_year_id,
          selectedPlacement.row.name,
          selectedPlacement.row.section,
          parentId,
          admission.contact_email ?? null,
          admission.contact_phone ?? null,
          admission.dob ?? null,
          admission.gender ?? null,
          admission.address ?? null,
          admission.previous_school ?? null,
        );

      if (parentId) {
        const parent = (await db
          .prepare("SELECT linked_student_ids FROM parents WHERE id = ?")
          .get(parentId)) as { linked_student_ids: string } | undefined;
        const linked: string[] = parent ? JSON.parse(parent.linked_student_ids || "[]") : [];
        if (!linked.includes(studentId)) linked.push(studentId);
        await db
          .prepare("UPDATE parents SET linked_student_ids = ? WHERE id = ?")
          .run(JSON.stringify(linked), parentId);
        await db
          .prepare(
            `INSERT INTO student_guardians (id, school_id, student_id, parent_id, relationship, is_primary)
      VALUES (?, ?, ?, ?, ?, 1)`,
          )
          .run(
            randomUUID(),
            schoolId,
            studentId,
            parentId,
            admission.parent_relation ?? "Guardian",
          );
      }

      await db
        .prepare(
          `UPDATE admissions SET stage = 'CONVERTED', status = 'Approved', admission_no = ?, converted_student_id = ?, updated_at = datetime('now')
     WHERE id = ? AND school_id = ?`,
        )
        .run(admissionNo, studentId, req.params.id, schoolId);
      await recordHistory(
        schoolId,
        req.params.id,
        "APPROVED",
        "CONVERTED",
        `Converted to student (${admissionNo})`,
        req,
      );
    });
    res.status(201).json({ studentId, admissionNo });
  } catch (error) {
    try {
      await db.exec("ROLLBACK");
    } catch {
      /* no active transaction */
    }
    res.status(409).json({
      error:
        error instanceof Error && error.message.includes("UNIQUE")
          ? "Admission was already converted or identifier conflicts"
          : "Admission conversion failed",
    });
  }
});
