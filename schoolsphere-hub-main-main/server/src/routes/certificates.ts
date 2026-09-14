import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { parentChildIds } from "./helpers.js";

export const certificatesRouter = Router();
certificatesRouter.use(authenticate);

const TYPES = ["BONAFIDE", "TRANSFER", "CHARACTER"];

certificatesRouter.get("/", authorize("certificates.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { studentId } = req.query;
  const user = req.user!;

  if (user.role === "STUDENT") {
    return res.json(
      await db
        .prepare(
          "SELECT * FROM certificates WHERE school_id = ? AND student_id = ? ORDER BY issued_on DESC",
        )
        .all(schoolId, user.linkedStudentId),
    );
  }
  if (user.role === "PARENT") {
    const ids = await parentChildIds(user.linkedParentId);
    if (ids.length === 0) return res.json([]);
    const placeholders = ids.map(() => "?").join(",");
    return res.json(
      await db
        .prepare(
          `SELECT * FROM certificates WHERE school_id = ? AND student_id IN (${placeholders}) ORDER BY issued_on DESC`,
        )
        .all(schoolId, ...ids),
    );
  }

  if (typeof studentId === "string" && studentId.trim()) {
    return res.json(
      await db
        .prepare(
          "SELECT * FROM certificates WHERE school_id = ? AND student_id = ? ORDER BY issued_on DESC",
        )
        .all(schoolId, studentId),
    );
  }
  res.json(
    await db
      .prepare("SELECT * FROM certificates WHERE school_id = ? ORDER BY issued_on DESC")
      .all(schoolId),
  );
});

certificatesRouter.post("/", authorize("certificates.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { studentId, type } = req.body ?? {};
  if (typeof studentId !== "string" || !studentId.trim())
    return res.status(400).json({ error: "studentId is required" });
  if (typeof type !== "string" || !TYPES.includes(type))
    return res.status(400).json({ error: `type must be one of ${TYPES.join(", ")}` });

  const student = await db
    .prepare("SELECT id FROM students WHERE id = ? AND school_id = ?")
    .get(studentId, schoolId);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const id = randomUUID();
  const issuer =
    (
      (await db.prepare("SELECT name FROM users WHERE id = ?").get(req.user!.id)) as
        { name: string } | undefined
    )?.name ?? null;
  await db
    .prepare(
      "INSERT INTO certificates (id, school_id, student_id, type, issued_by) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, schoolId, studentId, type, issuer);
  res.status(201).json({ id });
});
