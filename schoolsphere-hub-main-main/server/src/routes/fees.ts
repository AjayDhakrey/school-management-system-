import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { assertParentOwnsStudent, inClause, logAudit, notify, parentChildIds } from "./helpers.js";

export const feesRouter = Router();
feesRouter.use(authenticate);
const METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Other"];
const dateValid = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

async function studentScope(user: NonNullable<Express.Request["user"]>, requested?: string) {
  if (user.role === "STUDENT") return { sql: "f.student_id=?", params: [user.linkedStudentId] };
  if (user.role === "PARENT") {
    if (requested && !(await assertParentOwnsStudent(user, requested)))
      return { sql: "f.student_id IN (NULL)", params: [] };
    if (requested) return { sql: "f.student_id=?", params: [requested] };
    const { sql, params } = inClause(await parentChildIds(user.linkedParentId));
    return { sql: `f.student_id ${sql}`, params };
  }
  return null;
}

const feeSelect = `SELECT f.*,s.name student_name,s.admission_no,c.name class_name,c.section,ay.name academic_year_name,
  GREATEST(0,f.amount-f.discount+f.fine) total_fee,
  GREATEST(0,f.amount-f.discount+f.fine-f.paid_amount) outstanding_amount,
  CASE WHEN f.paid_amount>=GREATEST(0,f.amount-f.discount+f.fine) THEN 'Paid'
       WHEN f.paid_amount>0 THEN 'Partial'
       WHEN f.due_date IS NOT NULL AND f.due_date<to_char(current_date,'YYYY-MM-DD') THEN 'Overdue' ELSE 'Pending' END calculated_status,
  CASE WHEN f.due_date IS NOT NULL AND f.due_date<to_char(current_date,'YYYY-MM-DD') THEN GREATEST(0,f.amount-f.discount+f.fine-f.paid_amount) ELSE 0 END overdue_amount
 FROM fees f JOIN students s ON s.id=f.student_id LEFT JOIN classes c ON c.id=f.class_id LEFT JOIN academic_years ay ON ay.id=f.academic_year_id`;

feesRouter.get("/", authorize("fees.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const scope = await studentScope(
    req.user!,
    typeof req.query.studentId === "string" ? req.query.studentId : undefined,
  );
  const where = ["f.school_id=?"],
    params: unknown[] = [schoolId];
  if (scope) {
    where.push(scope.sql);
    params.push(...scope.params);
  }
  for (const [key, column] of [
    ["academicYearId", "academic_year_id"],
    ["classId", "class_id"],
    ["feeStructureId", "fee_structure_id"],
  ] as const) {
    const v = req.query[key];
    if (typeof v === "string" && v) {
      where.push(`f.${column}=?`);
      params.push(v);
    }
  }
  if (typeof req.query.status === "string" && req.query.status) {
    where.push(
      `(CASE WHEN f.paid_amount>=GREATEST(0,f.amount-f.discount+f.fine) THEN 'Paid' WHEN f.paid_amount>0 THEN 'Partial' WHEN f.due_date IS NOT NULL AND f.due_date<to_char(current_date,'YYYY-MM-DD') THEN 'Overdue' ELSE 'Pending' END)=?`,
    );
    params.push(req.query.status);
  }
  res.json(
    await db
      .prepare(
        `${feeSelect} WHERE ${where.join(" AND ")} ORDER BY f.due_date NULLS LAST,f.created_at`,
      )
      .all(...params),
  );
});

feesRouter.get("/receipts", authorize("fees.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const scope = await studentScope(
    req.user!,
    typeof req.query.studentId === "string" ? req.query.studentId : undefined,
  );
  const where = ["r.school_id=?"],
    params: unknown[] = [schoolId];
  if (scope) {
    where.push(scope.sql.replaceAll("f.student_id", "r.student_id"));
    params.push(...scope.params);
  }
  res.json(
    await db
      .prepare(
        `SELECT r.* FROM fee_receipts r WHERE ${where.join(" AND ")} ORDER BY r.payment_date DESC,r.created_at DESC`,
      )
      .all(...params),
  );
});

feesRouter.get("/receipts/:id", authorize("fees.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const scope = await studentScope(req.user!);
  const where = ["r.id=?", "r.school_id=?"],
    params: unknown[] = [req.params.id, schoolId];
  if (scope) {
    where.push(scope.sql.replaceAll("f.student_id", "r.student_id"));
    params.push(...scope.params);
  }
  const row = await db
    .prepare(`SELECT r.* FROM fee_receipts r WHERE ${where.join(" AND ")}`)
    .get(...params);
  if (!row) return res.status(404).json({ error: "Receipt not found" });
  res.json(row);
});

feesRouter.get("/:id/payments", authorize("fees.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const fee = (await db
    .prepare("SELECT student_id FROM fees WHERE id=? AND school_id=?")
    .get(req.params.id, schoolId)) as { student_id: string } | undefined;
  if (!fee) return res.status(404).json({ error: "Fee record not found" });
  if (req.user!.role === "STUDENT" && fee.student_id !== req.user!.linkedStudentId)
    return res.status(404).json({ error: "Fee record not found" });
  if (req.user!.role === "PARENT" && !(await assertParentOwnsStudent(req.user!, fee.student_id)))
    return res.status(404).json({ error: "Fee record not found" });
  res.json(
    await db
      .prepare(
        "SELECT p.*,r.id receipt_id,r.receipt_no FROM fee_payments p JOIN fee_receipts r ON r.payment_id=p.id WHERE p.fee_id=? AND p.school_id=? ORDER BY p.payment_date,p.created_at",
      )
      .all(req.params.id, schoolId),
  );
});

feesRouter.post("/", authorize("fees.create"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const b = req.body ?? {};
  if (typeof b.studentId !== "string" || !b.studentId)
    return res.status(400).json({ error: "studentId is required" });
  const student = (await db
    .prepare("SELECT id,class_id,academic_year_id FROM students WHERE id=? AND school_id=?")
    .get(b.studentId, schoolId)) as
    { id: string; class_id: string | null; academic_year_id: string | null } | undefined;
  if (!student) return res.status(400).json({ error: "Student does not belong to this school" });
  let amount = b.amount,
    feeType = b.feeType ?? "Tuition",
    dueDate = b.dueDate ?? null,
    structure: null | Record<string, any> = null;
  if (b.feeStructureId) {
    structure =
      ((await db
        .prepare("SELECT * FROM fee_structures WHERE id=? AND school_id=? AND status='ACTIVE'")
        .get(b.feeStructureId, schoolId)) as Record<string, any> | undefined) ?? null;
    if (!structure)
      return res
        .status(400)
        .json({ error: "Fee structure does not belong to this school or is inactive" });
    if (structure.class_id && structure.class_id !== student.class_id)
      return res
        .status(400)
        .json({ error: "Fee structure does not apply to this student's class" });
    if (structure.academic_year_id && structure.academic_year_id !== student.academic_year_id)
      return res
        .status(400)
        .json({ error: "Fee structure does not apply to this student's academic year" });
    amount = amount ?? structure.amount;
    feeType = structure.fee_type;
    dueDate = dueDate ?? structure.due_date;
  }
  const discount = b.discount ?? b.concession ?? 0,
    fine = b.fine ?? 0;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    typeof discount !== "number" ||
    discount < 0 ||
    discount > amount ||
    typeof fine !== "number" ||
    fine < 0 ||
    (dueDate != null && !dateValid(dueDate))
  )
    return res.status(400).json({ error: "Invalid fee assignment values" });
  const id = randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO fees(id,school_id,student_id,fee_structure_id,academic_year_id,class_id,amount,status,due_date,fee_type,discount,fine,paid_amount,description,created_by) VALUES(?,?,?,?,?,?,?,'Pending',?,?,?,?,0,?,?)`,
      )
      .run(
        id,
        schoolId,
        student.id,
        b.feeStructureId ?? null,
        student.academic_year_id,
        student.class_id,
        amount,
        dueDate,
        feeType,
        discount,
        fine,
        b.description ?? structure?.description ?? null,
        req.user!.id,
      );
  } catch (e) {
    if (e instanceof Error && e.message.includes("uq_fee_assignment_structure_student_due"))
      return res
        .status(409)
        .json({ error: "This fee structure is already assigned to the student for this due date" });
    throw e;
  }
  await logAudit(
    req,
    "student_fee.assigned",
    id,
    JSON.stringify({
      studentId: student.id,
      feeStructureId: b.feeStructureId ?? null,
      amount,
      discount,
      fine,
    }),
  );
  res.status(201).json({ id });
});

feesRouter.patch("/:id", authorize("fees.update"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const old = (await db
    .prepare("SELECT * FROM fees WHERE id=? AND school_id=?")
    .get(req.params.id, schoolId)) as Record<string, any> | undefined;
  if (!old) return res.status(404).json({ error: "Fee record not found" });
  if (
    req.body?.paidAmount !== undefined ||
    req.body?.receiptNo !== undefined ||
    req.body?.paidOn !== undefined
  )
    return res.status(400).json({ error: "Record payments through the payment endpoint" });
  const discount = req.body?.discount ?? req.body?.concession ?? old.discount,
    fine = req.body?.fine ?? old.fine,
    dueDate = req.body?.dueDate === undefined ? old.due_date : req.body.dueDate,
    description = req.body?.description === undefined ? old.description : req.body.description;
  if (
    typeof discount !== "number" ||
    discount < 0 ||
    discount > old.amount ||
    typeof fine !== "number" ||
    fine < 0 ||
    (dueDate != null && !dateValid(dueDate))
  )
    return res.status(400).json({ error: "Invalid adjustment values" });
  const payable = Math.max(0, old.amount - discount + fine);
  if (old.paid_amount > payable)
    return res
      .status(409)
      .json({ error: "Adjustment would reduce payable below payments already received" });
  const status =
    old.paid_amount >= payable
      ? "Paid"
      : old.paid_amount > 0
        ? "Partial"
        : dueDate && dueDate < new Date().toISOString().slice(0, 10)
          ? "Overdue"
          : "Pending";
  await db
    .prepare(
      "UPDATE fees SET discount=?,fine=?,due_date=?,description=?,status=?,updated_at=app_now() WHERE id=? AND school_id=?",
    )
    .run(discount, fine, dueDate, description ?? null, status, req.params.id, schoolId);
  await logAudit(
    req,
    "student_fee.adjusted",
    req.params.id,
    JSON.stringify({ discount, fine, dueDate }),
  );
  res.json({ ok: true });
});

feesRouter.delete("/:id", authorize("fees.update"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (
    !(await db
      .prepare("SELECT 1 FROM fees WHERE id=? AND school_id=?")
      .get(req.params.id, schoolId))
  )
    return res.status(404).json({ error: "Fee record not found" });
  if (
    await db
      .prepare("SELECT 1 FROM fee_payments WHERE fee_id=? AND school_id=? LIMIT 1")
      .get(req.params.id, schoolId)
  )
    return res.status(409).json({ error: "Fees with payment history cannot be deleted" });
  await db.prepare("DELETE FROM fees WHERE id=? AND school_id=?").run(req.params.id, schoolId);
  await logAudit(req, "student_fee.deleted", req.params.id);
  res.json({ ok: true });
});

feesRouter.post("/:id/pay", authorize("fees.pay"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const b = req.body ?? {},
    method = b.method ?? "Other";
  if (!METHODS.includes(method))
    return res.status(400).json({ error: `method must be one of ${METHODS.join(", ")}` });
  if (typeof b.payAmount !== "number" || !Number.isFinite(b.payAmount) || b.payAmount <= 0)
    return res.status(400).json({ error: "payAmount must be greater than zero" });
  if (b.paymentDate !== undefined && !dateValid(b.paymentDate))
    return res.status(400).json({ error: "Invalid paymentDate" });
  if (
    b.transactionReference != null &&
    (typeof b.transactionReference !== "string" ||
      !b.transactionReference.trim() ||
      b.transactionReference.length > 120)
  )
    return res.status(400).json({ error: "Invalid transactionReference" });
  if (
    b.idempotencyKey != null &&
    (typeof b.idempotencyKey !== "string" ||
      !b.idempotencyKey.trim() ||
      b.idempotencyKey.length > 120)
  )
    return res.status(400).json({ error: "Invalid idempotencyKey" });
  try {
    const result = await db.transaction(async () => {
      const fee = (await db
        .prepare("SELECT * FROM fees WHERE id=? AND school_id=? FOR UPDATE")
        .get(req.params.id, schoolId)) as Record<string, any> | undefined;
      if (!fee) throw Object.assign(new Error("Fee record not found"), { status: 404 });
      if (req.user!.role === "STUDENT" && fee.student_id !== req.user!.linkedStudentId)
        throw Object.assign(new Error("Fee record not found"), { status: 404 });
      if (
        req.user!.role === "PARENT" &&
        !(await assertParentOwnsStudent(req.user!, fee.student_id))
      )
        throw Object.assign(new Error("Fee record not found"), { status: 404 });
      const payable = Math.max(0, fee.amount - fee.discount + fee.fine),
        remaining = payable - fee.paid_amount;
      if (remaining <= 0)
        throw Object.assign(new Error("This fee is already fully paid"), { status: 409 });
      if (b.payAmount > remaining + 0.000001)
        throw Object.assign(new Error("Payment exceeds the outstanding amount"), { status: 409 });
      if (b.idempotencyKey) {
        const prior = await db
          .prepare(
            "SELECT p.id payment_id,r.id receipt_id,r.receipt_no FROM fee_payments p JOIN fee_receipts r ON r.payment_id=p.id WHERE p.school_id=? AND p.idempotency_key=?",
          )
          .get(schoolId, b.idempotencyKey);
        if (prior) return { duplicate: true, ...prior };
      }
      const snapshot = (await db
        .prepare(
          "SELECT s.name,s.admission_no,c.name class_name,c.section,ay.name academic_year_name FROM students s LEFT JOIN classes c ON c.id=? LEFT JOIN academic_years ay ON ay.id=? WHERE s.id=? AND s.school_id=?",
        )
        .get(fee.class_id, fee.academic_year_id, fee.student_id, schoolId)) as Record<string, any>;
      const school = (await db.prepare("SELECT name FROM schools WHERE id=?").get(schoolId)) as {
        name: string;
      };
      const collector = (await db
        .prepare("SELECT name FROM users WHERE id=?")
        .get(req.user!.id)) as { name: string };
      await db.prepare("SELECT pg_advisory_xact_lock(hashtext(?))").get(`fee-receipt:${schoolId}`);
      const sequence =
        Number(
          (
            (await db
              .prepare("SELECT count(*) n FROM fee_receipts WHERE school_id=?")
              .get(schoolId)) as { n: string }
          ).n,
        ) + 1;
      const receiptNo = `RCPT-${new Date().getUTCFullYear()}-${String(sequence).padStart(6, "0")}`;
      const paymentId = randomUUID(),
        receiptId = randomUUID(),
        paymentDate = b.paymentDate ?? new Date().toISOString().slice(0, 10);
      await db
        .prepare(
          `INSERT INTO fee_payments(id,school_id,fee_id,student_id,amount,method,transaction_reference,idempotency_key,payment_date,collected_by,remarks) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          paymentId,
          schoolId,
          fee.id,
          fee.student_id,
          b.payAmount,
          method,
          b.transactionReference?.trim() || null,
          b.idempotencyKey?.trim() || null,
          paymentDate,
          req.user!.id,
          b.remarks || null,
        );
      await db
        .prepare(
          `INSERT INTO fee_receipts(id,school_id,payment_id,fee_id,student_id,receipt_no,amount,method,payment_date,transaction_reference,school_name,student_name,admission_no,fee_type,academic_year_name,class_name,section,collector_name,remarks) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          receiptId,
          schoolId,
          paymentId,
          fee.id,
          fee.student_id,
          receiptNo,
          b.payAmount,
          method,
          paymentDate,
          b.transactionReference?.trim() || null,
          school.name,
          snapshot.name,
          snapshot.admission_no,
          fee.fee_type,
          snapshot.academic_year_name,
          snapshot.class_name,
          snapshot.section,
          collector.name,
          b.remarks || null,
        );
      const totalPaid = fee.paid_amount + b.payAmount,
        newStatus = totalPaid >= payable ? "Paid" : "Partial";
      await db
        .prepare(
          "UPDATE fees SET paid_amount=?,status=?,paid_on=?,receipt_no=?,updated_at=app_now() WHERE id=? AND school_id=?",
        )
        .run(totalPaid, newStatus, paymentDate, receiptNo, fee.id, schoolId);
      await logAudit(
        req,
        "fee_payment.recorded",
        paymentId,
        JSON.stringify({
          feeId: fee.id,
          studentId: fee.student_id,
          amount: b.payAmount,
          method,
          receiptNo,
        }),
      );
      return {
        duplicate: false,
        paymentId,
        transactionId: paymentId,
        receiptId,
        receiptNo,
        paidAmount: b.payAmount,
        totalPaid,
        remaining: Math.max(0, payable - totalPaid),
        status: newStatus,
      };
    });
    if (!result.duplicate)
      await notify(
        schoolId,
        req.user!.id,
        "Fees",
        "Payment recorded",
        `Payment received. Receipt ${result.receiptNo}.`,
      );
    res.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    const e = error as Error & { status?: number };
    if (
      e.message.includes("fee_payments_reference_unique") ||
      e.message.includes("fee_payments_idempotency_unique")
    )
      return res.status(409).json({ error: "Duplicate payment reference" });
    res.status(e.status ?? 409).json({ error: e.message || "Payment could not be recorded" });
  }
});
