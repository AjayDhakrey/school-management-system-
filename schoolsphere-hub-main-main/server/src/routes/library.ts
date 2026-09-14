import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";

export const libraryRouter = Router();
libraryRouter.use(authenticate);

libraryRouter.get("/books", authorize("library.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  res.json(
    await db
      .prepare("SELECT * FROM library_books WHERE school_id = ? ORDER BY title")
      .all(schoolId),
  );
});

libraryRouter.post("/books", authorize("library.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { title, author } = req.body ?? {};
  if (typeof title !== "string" || !title.trim())
    return res.status(400).json({ error: "title is required" });
  if (
    title.trim().length > 200 ||
    (author != null && (typeof author !== "string" || author.trim().length > 200))
  )
    return res.status(400).json({ error: "title and author must be at most 200 characters" });
  const id = randomUUID();
  await db
    .prepare("INSERT INTO library_books (id, school_id, title, author) VALUES (?, ?, ?, ?)")
    .run(
      id,
      schoolId,
      title.trim(),
      typeof author === "string" && author.trim() ? author.trim() : null,
    );
  res.status(201).json({ id });
});

libraryRouter.get("/records", authorize("library.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (req.user!.role === "STUDENT") {
    return res.json(
      await db
        .prepare("SELECT * FROM library_records WHERE school_id = ? AND student_id = ?")
        .all(schoolId, req.user!.linkedStudentId),
    );
  }
  res.json(
    await db
      .prepare("SELECT * FROM library_records WHERE school_id = ? ORDER BY issued_on DESC")
      .all(schoolId),
  );
});

libraryRouter.post("/records", authorize("library.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { bookId, studentId } = req.body ?? {};
  if (!bookId || !studentId)
    return res.status(400).json({ error: "bookId and studentId are required" });
  if (typeof bookId !== "string" || typeof studentId !== "string")
    return res.status(400).json({ error: "bookId and studentId must be strings" });
  const id = randomUUID();
  await db.transaction(async () => {
    const book = (await db
      .prepare("SELECT id, status FROM library_books WHERE id = ? AND school_id = ? FOR UPDATE")
      .get(bookId, schoolId)) as { id: string; status: string } | undefined;
    if (!book) throw Object.assign(new Error("Book not found"), { statusCode: 404 });
    const student = await db
      .prepare("SELECT id FROM students WHERE id = ? AND school_id = ?")
      .get(studentId, schoolId);
    if (!student) throw Object.assign(new Error("Student not found"), { statusCode: 404 });
    const active = await db
      .prepare(
        "SELECT id FROM library_records WHERE book_id = ? AND school_id = ? AND returned_on IS NULL",
      )
      .get(bookId, schoolId);
    if (active || book.status === "Issued")
      throw Object.assign(new Error("Book is already issued"), { statusCode: 409 });
    await db
      .prepare(
        "INSERT INTO library_records (id, school_id, book_id, student_id, issued_on) VALUES (?, ?, ?, ?, date('now'))",
      )
      .run(id, schoolId, bookId, studentId);
    await db
      .prepare("UPDATE library_books SET status = 'Issued' WHERE id = ? AND school_id = ?")
      .run(bookId, schoolId);
  });
  res.status(201).json({ id });
});

libraryRouter.patch("/records/:id/return", authorize("library.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  await db.transaction(async () => {
    const record = (await db
      .prepare(
        "SELECT book_id, returned_on FROM library_records WHERE id = ? AND school_id = ? FOR UPDATE",
      )
      .get(req.params.id, schoolId)) as { book_id: string; returned_on: string | null } | undefined;
    if (!record) throw Object.assign(new Error("Record not found"), { statusCode: 404 });
    if (record.returned_on)
      throw Object.assign(new Error("Book was already returned"), { statusCode: 409 });
    await db
      .prepare(
        "UPDATE library_records SET returned_on = date('now') WHERE id = ? AND school_id = ? AND returned_on IS NULL",
      )
      .run(req.params.id, schoolId);
    await db
      .prepare("UPDATE library_books SET status = 'Available' WHERE id = ? AND school_id = ?")
      .run(record.book_id, schoolId);
  });
  res.json({ ok: true });
});
