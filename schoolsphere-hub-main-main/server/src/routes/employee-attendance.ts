import { Router } from "express";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import type { Permission } from "../permissions.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { logAudit } from "./helpers.js";
import { normalizeStatus, summarize, validateAttendanceDate } from "./attendance-helpers.js";

const MAX_REMARKS = 300;
const MARKABLE = ["ACTIVE", "ON_LEAVE"]; // employment states that may receive a *new* attendance mark

interface Config {
  table: "teacher_attendance" | "staff_attendance";
  fkCol: "teacher_id" | "staff_id";
  entityTable: "teachers" | "staff";
  role: "TEACHER" | "STAFF";
  linkedIdKey: "linkedTeacherId" | "linkedStaffId";
  bodyIdKey: "teacherId" | "staffId";
  perms: { view: Permission; manage: Permission; self: Permission };
  auditKind: string;
  label: string; // "Teacher" | "Staff"
}

/**
 * Teacher and staff daily attendance are byte-for-byte the same shape (Employee + Date → one row),
 * differing only in table/column/role — so one factory builds both routers rather than two
 * near-identical files diverging over time.
 */
export function makeEmployeeAttendanceRouter(cfg: Config): Router {
  const router = Router();
  router.use(authenticate);
  const { table, fkCol, entityTable, role, linkedIdKey, bodyIdKey, perms, auditKind, label } = cfg;

  const selectList = `
    SELECT ea.*, e.name AS person_name, e.employee_id, e.department, e.employment_status
    FROM ${table} ea JOIN ${entityTable} e ON e.id = ea.${fkCol}`;

  function selfId(req: Request): string | null {
    return req.user!.role === role ? (req.user![linkedIdKey] ?? "__none__") : null;
  }

  async function assertMarkable(schoolId: string, entityId: string) {
    const row = (await db
      .prepare(`SELECT employment_status FROM ${entityTable} WHERE id = ? AND school_id = ?`)
      .get(entityId, schoolId)) as { employment_status: string } | undefined;
    if (!row) return { error: `${label} not found`, status: 404 };
    if (!MARKABLE.includes(String(row.employment_status).toUpperCase())) {
      return {
        error: `${label} is ${row.employment_status.toLowerCase()} and cannot receive new attendance`,
        status: 409,
      };
    }
    return { ok: true };
  }

  router.get("/", authorize(perms.view), async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const q = req.query;
    const where = ["ea.school_id = ?"];
    const params: unknown[] = [schoolId];

    const mine = selfId(req);
    if (mine !== null) {
      where.push(`ea.${fkCol} = ?`);
      params.push(mine);
    }
    if (typeof q[bodyIdKey] === "string" && q[bodyIdKey]) {
      where.push(`ea.${fkCol} = ?`);
      params.push(q[bodyIdKey]);
    }
    if (typeof q.department === "string" && q.department) {
      where.push("upper(e.department) = upper(?)");
      params.push(q.department);
    }
    if (typeof q.status === "string" && normalizeStatus(q.status)) {
      where.push("ea.status = ?");
      params.push(normalizeStatus(q.status));
    }
    if (typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
      where.push("ea.date = ?");
      params.push(q.date);
    }
    if (typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month)) {
      where.push("ea.date LIKE ?");
      params.push(`${q.month}-%`);
    }
    if (typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) {
      where.push("ea.date >= ?");
      params.push(q.from);
    }
    if (typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) {
      where.push("ea.date <= ?");
      params.push(q.to);
    }
    res.json(
      await db
        .prepare(`${selectList} WHERE ${where.join(" AND ")} ORDER BY ea.date DESC, e.name`)
        .all(...params),
    );
  });

  /** The mark-sheet for one day: every currently-employed person + their saved status for that date. */
  router.get("/roster", authorize(perms.manage), async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const dateCheck = validateAttendanceDate(req.query.date);
    if ("error" in dateCheck) return res.status(400).json({ error: dateCheck.error });

    const where = ["e.school_id = ?", `upper(e.employment_status) IN ('ACTIVE','ON_LEAVE')`];
    const params: unknown[] = [dateCheck.date, schoolId, schoolId];
    if (typeof req.query.department === "string" && req.query.department) {
      where.push("upper(e.department) = upper(?)");
      params.push(req.query.department);
    }
    if (typeof req.query.q === "string" && req.query.q.trim()) {
      where.push(
        "(lower(e.name) LIKE lower(?) OR lower(coalesce(e.employee_id,'')) LIKE lower(?))",
      );
      params.push(`%${req.query.q.trim()}%`, `%${req.query.q.trim()}%`);
    }
    const people = await db
      .prepare(
        `SELECT e.id, e.name, e.employee_id, e.department, e.employment_status,
                ea.id AS attendance_id, ea.status, ea.remarks
         FROM ${entityTable} e
         LEFT JOIN ${table} ea ON ea.${fkCol} = e.id AND ea.date = ? AND ea.school_id = ?
         WHERE ${where.join(" AND ")}
         ORDER BY e.name`,
      )
      .all(...params);
    res.json({ date: dateCheck.date, people });
  });

  router.get("/summary", authorize(perms.view), async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const where = ["ea.school_id = ?"];
    const params: unknown[] = [schoolId];
    const mine = selfId(req);
    if (mine !== null) {
      where.push(`ea.${fkCol} = ?`);
      params.push(mine);
    } else if (typeof req.query[bodyIdKey] === "string" && req.query[bodyIdKey]) {
      where.push(`ea.${fkCol} = ?`);
      params.push(req.query[bodyIdKey]);
    }
    for (const [key, op] of [
      ["from", ">="],
      ["to", "<="],
    ] as const) {
      if (
        typeof req.query[key] === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.query[key] as string)
      ) {
        where.push(`ea.date ${op} ?`);
        params.push(req.query[key]);
      }
    }
    const rows = (await db
      .prepare(`SELECT ea.status FROM ${table} ea WHERE ${where.join(" AND ")}`)
      .all(...params)) as {
      status: string;
    }[];
    res.json(summarize(rows));
  });

  async function upsert(
    schoolId: string,
    entityId: string,
    date: string,
    status: string,
    remarks: string | null,
    actorId: string,
  ) {
    const existing = (await db
      .prepare(`SELECT id FROM ${table} WHERE school_id = ? AND ${fkCol} = ? AND date = ?`)
      .get(schoolId, entityId, date)) as { id: string } | undefined;
    await db
      .prepare(
        `INSERT INTO ${table} (id, school_id, ${fkCol}, date, status, remarks, marked_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(school_id, ${fkCol}, date) DO UPDATE SET
         status = excluded.status, remarks = excluded.remarks, marked_by = excluded.marked_by, updated_at = datetime('now')`,
      )
      .run(existing?.id ?? randomUUID(), schoolId, entityId, date, status, remarks, actorId);
    return { id: existing?.id ?? "new", wasUpdate: Boolean(existing) };
  }

  router.post("/", authorize(perms.manage), async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const entityId = req.body?.[bodyIdKey];
    if (typeof entityId !== "string" || !entityId)
      return res.status(400).json({ error: `${bodyIdKey} is required` });
    const dateCheck = validateAttendanceDate(req.body?.date);
    if ("error" in dateCheck) return res.status(400).json({ error: dateCheck.error });
    const status = normalizeStatus(req.body?.status);
    if (!status)
      return res.status(400).json({ error: "status must be one of Present, Absent, Late, Leave" });
    const remarks = req.body?.remarks;
    if (
      remarks !== undefined &&
      remarks !== null &&
      (typeof remarks !== "string" || remarks.length > MAX_REMARKS)
    ) {
      return res
        .status(400)
        .json({ error: `remarks must be a string of at most ${MAX_REMARKS} characters` });
    }
    const markable = await assertMarkable(schoolId, entityId);
    if ("error" in markable)
      return res.status(markable.status ?? 400).json({ error: markable.error });

    const { wasUpdate } = await upsert(
      schoolId,
      entityId,
      dateCheck.date,
      status,
      typeof remarks === "string" ? remarks : null,
      req.user!.id,
    );
    await logAudit(
      req,
      wasUpdate ? `${auditKind}.corrected` : `${auditKind}.marked`,
      entityId,
      `${dateCheck.date} → ${status}`,
    );
    res.status(wasUpdate ? 200 : 201).json({ ok: true });
  });

  router.post("/bulk", authorize(perms.manage), async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const { date, entries } = req.body ?? {};
    if (!Array.isArray(entries))
      return res.status(400).json({ error: "date and entries[] are required" });
    if (entries.length > 500)
      return res.status(400).json({ error: "Too many entries in one request" });
    const dateCheck = validateAttendanceDate(date);
    if ("error" in dateCheck) return res.status(400).json({ error: dateCheck.error });

    const markable = new Set(
      (
        (await db
          .prepare(
            `SELECT id FROM ${entityTable} WHERE school_id = ? AND upper(employment_status) IN ('ACTIVE','ON_LEAVE')`,
          )
          .all(schoolId)) as { id: string }[]
      ).map((r) => r.id),
    );
    const clean: { entityId: string; status: string; remarks: string | null }[] = [];
    let skipped = 0;
    for (const entry of entries as {
      status?: unknown;
      remarks?: unknown;
      [k: string]: unknown;
    }[]) {
      const eid = entry?.[bodyIdKey];
      if (typeof eid !== "string" || !markable.has(eid)) {
        skipped++;
        continue;
      }
      const status = normalizeStatus(entry?.status);
      if (!status) return res.status(400).json({ error: `Invalid status for ${bodyIdKey} ${eid}` });
      if (
        entry.remarks !== undefined &&
        entry.remarks !== null &&
        (typeof entry.remarks !== "string" || entry.remarks.length > MAX_REMARKS)
      ) {
        return res.status(400).json({ error: `remarks too long for ${eid}` });
      }
      clean.push({
        entityId: eid,
        status,
        remarks: typeof entry.remarks === "string" ? entry.remarks : null,
      });
    }

    try {
      await db.transaction(async () => {
        for (const e of clean)
          await upsert(schoolId, e.entityId, dateCheck.date, e.status, e.remarks, req.user!.id);
      });
    } catch (err) {
      try {
        await db.exec("ROLLBACK");
      } catch {
        /* already rolled back */
      }
      return res
        .status(409)
        .json({ error: err instanceof Error ? err.message : "Attendance could not be saved" });
    }
    await logAudit(
      req,
      `${auditKind}.bulk_marked`,
      null,
      `${dateCheck.date}: ${clean.length} saved, ${skipped} skipped`,
    );
    res.json({ ok: true, saved: clean.length, skipped });
  });

  router.patch("/:id", authorize(perms.manage), async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const existing = (await db
      .prepare(
        `SELECT id, ${fkCol} AS entity_id, date, status FROM ${table} WHERE id = ? AND school_id = ?`,
      )
      .get(req.params.id, schoolId)) as
      { id: string; entity_id: string; date: string; status: string } | undefined;
    if (!existing) return res.status(404).json({ error: "Record not found" });

    const { status, remarks } = req.body ?? {};
    const canonical = status === undefined ? existing.status : normalizeStatus(status);
    if (!canonical)
      return res.status(400).json({ error: "status must be one of Present, Absent, Late, Leave" });
    if (
      remarks !== undefined &&
      remarks !== null &&
      (typeof remarks !== "string" || remarks.length > MAX_REMARKS)
    ) {
      return res
        .status(400)
        .json({ error: `remarks must be a string of at most ${MAX_REMARKS} characters` });
    }
    if (status === undefined && remarks === undefined) {
      return res.status(400).json({ error: "Nothing to update — pass status and/or remarks" });
    }
    const sets = ["status = ?", "marked_by = ?", "updated_at = datetime('now')"];
    const args: unknown[] = [canonical, req.user!.id];
    if (remarks !== undefined) {
      sets.splice(1, 0, "remarks = ?");
      args.splice(1, 0, typeof remarks === "string" ? remarks : null);
    }
    await db
      .prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ? AND school_id = ?`)
      .run(...args, req.params.id, schoolId);
    await logAudit(
      req,
      `${auditKind}.corrected`,
      existing.entity_id,
      `${existing.date}: ${existing.status} → ${canonical}`,
    );
    res.json({ ok: true });
  });

  async function todayRow(schoolId: string, entityId: string) {
    return (await db
      .prepare(`SELECT * FROM ${table} WHERE school_id = ? AND ${fkCol} = ? AND date = date('now')`)
      .get(schoolId, entityId)) as
      { id: string; check_in: string | null; check_out: string | null } | undefined;
  }

  /** Self check-in — a person can only ever check themselves in, never set an arbitrary status. */
  router.post("/check-in", authorize(perms.self), async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const entityId = req.user![linkedIdKey];
    if (!entityId) return res.status(403).json({ error: `${label}s only` });

    const existing = await todayRow(schoolId, entityId);
    if (existing?.check_in) return res.status(400).json({ error: "Already checked in today" });

    const now = new Date().toTimeString().slice(0, 5);
    if (existing) {
      await db
        .prepare(`UPDATE ${table} SET check_in = ?, status = 'Present' WHERE id = ?`)
        .run(now, existing.id);
    } else {
      await db
        .prepare(
          `INSERT INTO ${table} (id, school_id, ${fkCol}, date, status, check_in) VALUES (?, ?, ?, date('now'), 'Present', ?)`,
        )
        .run(randomUUID(), schoolId, entityId, now);
    }
    res.json({ ok: true, checkIn: now });
  });

  /** Self check-out — requires an existing check-in for today. */
  router.post("/check-out", authorize(perms.self), async (req, res) => {
    const schoolId = requireSchoolId(req, res);
    if (!schoolId) return;
    const entityId = req.user![linkedIdKey];
    if (!entityId) return res.status(403).json({ error: `${label}s only` });

    const existing = await todayRow(schoolId, entityId);
    if (!existing?.check_in) return res.status(400).json({ error: "You haven't checked in today" });
    if (existing.check_out) return res.status(400).json({ error: "Already checked out today" });

    const now = new Date().toTimeString().slice(0, 5);
    await db.prepare(`UPDATE ${table} SET check_out = ? WHERE id = ?`).run(now, existing.id);
    res.json({ ok: true, checkOut: now });
  });

  return router;
}
