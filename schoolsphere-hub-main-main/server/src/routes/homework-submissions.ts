import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { logAudit, notify, studentClassId } from "./helpers.js";

export const homeworkSubmissionsRouter = Router();
homeworkSubmissionsRouter.use(authenticate);

async function homeworkFor(schoolId: string, homeworkId: string) {
  return (await db
    .prepare(
      "SELECT id, class_id, due_date, teacher_id, title FROM homework WHERE id = ? AND school_id = ?",
    )
    .get(homeworkId, schoolId)) as
    | {
        id: string;
        class_id: string | null;
        due_date: string | null;
        teacher_id: string | null;
        title: string;
      }
    | undefined;
}

/** Teacher/School Admin: list all submissions for a homework item. */
homeworkSubmissionsRouter.get("/", authorize("homework.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { homeworkId } = req.query;
  if (typeof homeworkId !== "string" || !homeworkId.trim()) {
    return res.status(400).json({ error: "homeworkId query param is required" });
  }
  const homework = await homeworkFor(schoolId, homeworkId);
  if (!homework) return res.status(404).json({ error: "Homework not found" });
  if (req.user!.role === "TEACHER" && homework.teacher_id !== req.user!.linkedTeacherId) {
    return res.status(403).json({ error: "Not your homework" });
  }
  res.json(
    await db
      .prepare(
        `SELECT s.*, st.name AS student_name FROM homework_submissions s
         JOIN students st ON st.id = s.student_id
         WHERE s.school_id = ? AND s.homework_id = ? ORDER BY s.submitted_at DESC`,
      )
      .all(schoolId, homeworkId),
  );
});

/** Student: create or replace their own submission for a homework item. */
homeworkSubmissionsRouter.post("/", authorize("homework.submit"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role !== "STUDENT") return res.status(403).json({ error: "Students only" });

  const { homeworkId, fileName, note } = req.body ?? {};
  if (typeof homeworkId !== "string" || !homeworkId.trim())
    return res.status(400).json({ error: "homeworkId is required" });

  const homework = await homeworkFor(schoolId, homeworkId);
  if (!homework) return res.status(404).json({ error: "Homework not found" });

  const studentId = req.user!.linkedStudentId;
  const ownClassId = await studentClassId(studentId);
  if (homework.class_id && homework.class_id !== ownClassId) {
    return res.status(403).json({ error: "Homework not assigned to your class" });
  }

  const isLate = homework.due_date ? new Date() > new Date(homework.due_date) : false;
  const status = isLate ? "Late" : "Submitted";

  const existing = (await db
    .prepare("SELECT id FROM homework_submissions WHERE homework_id = ? AND student_id = ?")
    .get(homeworkId, studentId)) as { id: string } | undefined;

  let id: string;
  if (existing) {
    id = existing.id;
    await db
      .prepare(
        `UPDATE homework_submissions SET file_name = ?, note = ?, status = ?, submitted_at = datetime('now'), feedback = NULL, grade = NULL WHERE id = ?`,
      )
      .run(fileName ?? null, note ?? null, status, existing.id);
  } else {
    id = randomUUID();
    await db
      .prepare(
        `INSERT INTO homework_submissions (id, school_id, homework_id, student_id, file_name, note, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, schoolId, homeworkId, studentId, fileName ?? null, note ?? null, status);
  }

  if (homework.teacher_id) {
    const teacherUser = (await db
      .prepare("SELECT id FROM users WHERE linked_teacher_id = ? AND school_id = ?")
      .get(homework.teacher_id, schoolId)) as { id: string } | undefined;
    if (teacherUser)
      notify(
        schoolId,
        teacherUser.id,
        "Homework",
        "Homework submitted",
        `A student submitted "${homework.title}"`,
      );
  }

  await logAudit(
    req,
    "homework.submitted",
    id,
    JSON.stringify({ homeworkId, status, resubmission: !!existing }),
  );
  res.status(existing ? 200 : 201).json({ id, status });
});

/** Teacher/School Admin: add feedback/grade, marking the submission Reviewed. */
homeworkSubmissionsRouter.patch("/:id", authorize("homework.update"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = (await db
    .prepare(
      `SELECT s.id, s.student_id, h.teacher_id FROM homework_submissions s
       JOIN homework h ON h.id = s.homework_id
       WHERE s.id = ? AND s.school_id = ?`,
    )
    .get(req.params.id, schoolId)) as
    { id: string; student_id: string; teacher_id: string | null } | undefined;
  if (!existing) return res.status(404).json({ error: "Submission not found" });
  if (req.user!.role === "TEACHER" && existing.teacher_id !== req.user!.linkedTeacherId) {
    return res.status(403).json({ error: "Not your homework" });
  }

  const { feedback, grade } = req.body ?? {};
  await db
    .prepare(
      "UPDATE homework_submissions SET feedback = ?, grade = ?, status = 'Reviewed' WHERE id = ?",
    )
    .run(feedback ?? null, grade ?? null, req.params.id);

  const studentUser = (await db
    .prepare("SELECT id FROM users WHERE linked_student_id = ? AND school_id = ?")
    .get(existing.student_id, schoolId)) as { id: string } | undefined;
  if (studentUser)
    notify(
      schoolId,
      studentUser.id,
      "Homework",
      "Homework reviewed",
      "Your teacher left feedback on your submission.",
    );

  await logAudit(req, "homework.reviewed", req.params.id);
  res.json({ ok: true });
});
