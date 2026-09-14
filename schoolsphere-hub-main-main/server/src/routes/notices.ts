import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { notify } from "./helpers.js";

export const noticesRouter = Router();
noticesRouter.use(authenticate);

const AUDIENCE_FOR_ROLE: Record<string, string> = {
  TEACHER: "Teachers",
  PARENT: "Parents",
  STUDENT: "Students",
  STAFF: "Staff",
};
const AUDIENCES = ["All", "Students", "Teachers", "Parents", "Staff"];
const PRIORITIES = ["High", "Medium", "Low"];

async function withReadState(rows: unknown[], userId: string) {
  const read = new Set(
    (
      (await db.prepare("SELECT notice_id FROM notice_reads WHERE user_id = ?").all(userId)) as {
        notice_id: string;
      }[]
    ).map((r) => r.notice_id),
  );
  return (rows as { id: string }[]).map((r) => ({ ...r, read: read.has(r.id) }));
}

noticesRouter.get("/", authorize("notices.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const audience = AUDIENCE_FOR_ROLE[req.user!.role];
  if (audience) {
    const rows = await db
      .prepare(
        "SELECT * FROM notices WHERE school_id = ? AND (audience = 'All' OR audience = ?) ORDER BY date DESC",
      )
      .all(schoolId, audience);
    return res.json(await withReadState(rows, req.user!.id));
  }
  const rows = await db
    .prepare("SELECT * FROM notices WHERE school_id = ? ORDER BY date DESC")
    .all(schoolId);
  res.json(await withReadState(rows, req.user!.id));
});

noticesRouter.post("/:id/read", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const notice = await db
    .prepare("SELECT id FROM notices WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!notice) return res.status(404).json({ error: "Notice not found" });
  const existing = await db
    .prepare("SELECT id FROM notice_reads WHERE user_id = ? AND notice_id = ?")
    .get(req.user!.id, req.params.id);
  if (!existing) {
    await db
      .prepare("INSERT INTO notice_reads (id, user_id, notice_id) VALUES (?, ?, ?)")
      .run(randomUUID(), req.user!.id, req.params.id);
  }
  res.json({ ok: true });
});

noticesRouter.post("/", authorize("notices.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { title, description, category, priority, audience } = req.body ?? {};
  if (typeof title !== "string" || !title.trim())
    return res.status(400).json({ error: "title is required" });
  if (
    title.trim().length > 200 ||
    (description != null && (typeof description !== "string" || description.length > 5000))
  )
    return res.status(400).json({ error: "title or description is too long" });
  if (audience != null && !AUDIENCES.includes(audience))
    return res.status(400).json({ error: "Invalid audience" });
  if (priority != null && !PRIORITIES.includes(priority))
    return res.status(400).json({ error: "Invalid priority" });
  const author =
    (
      (await db
        .prepare("SELECT name FROM users WHERE id = ? AND school_id = ?")
        .get(req.user!.id, schoolId)) as { name: string } | undefined
    )?.name ?? null;
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO notices (id, school_id, title, description, category, priority, audience, date, author)
     VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?)`,
    )
    .run(
      id,
      schoolId,
      title.trim(),
      description ?? null,
      category ?? "General",
      priority ?? "Medium",
      audience ?? "All",
      author ?? null,
    );

  const targetRoles =
    audience === "Students"
      ? ["STUDENT"]
      : audience === "Teachers"
        ? ["TEACHER"]
        : audience === "Parents"
          ? ["PARENT"]
          : audience === "Staff"
            ? ["STAFF"]
            : ["STUDENT", "TEACHER", "PARENT", "STAFF"];
  const placeholders = targetRoles.map(() => "?").join(",");
  const users = (await db
    .prepare(`SELECT id FROM users WHERE school_id = ? AND role IN (${placeholders})`)
    .all(schoolId, ...targetRoles)) as {
    id: string;
  }[];
  await Promise.all(users.map((u) => notify(schoolId, u.id, "Notices", "New notice", title)));

  res.status(201).json({ id });
});

noticesRouter.delete("/:id", authorize("notices.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const result = await db
    .prepare("DELETE FROM notices WHERE id = ? AND school_id = ?")
    .run(req.params.id, schoolId);
  if (result.changes === 0) return res.status(404).json({ error: "Notice not found" });
  res.json({ ok: true });
});
