import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";

export const roomsRouter = Router();
roomsRouter.use(authenticate);
const TYPES = ["CLASSROOM", "LAB", "LIBRARY", "HALL", "OFFICE", "OTHER"];
const STATUSES = ["ACTIVE", "MAINTENANCE", "INACTIVE"];

roomsRouter.get("/", authorize("rooms.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  res.json(await db.prepare("SELECT * FROM rooms WHERE school_id = ? ORDER BY name").all(schoolId));
});

roomsRouter.get("/:id", authorize("rooms.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const row = await db
    .prepare("SELECT * FROM rooms WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!row) return res.status(404).json({ error: "Room not found" });
  res.json(row);
});

roomsRouter.post("/", authorize("rooms.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, number, type = "CLASSROOM", capacity, status = "ACTIVE" } = req.body ?? {};
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 100 ||
    (number !== undefined && (typeof number !== "string" || number.length > 40)) ||
    !TYPES.includes(type) ||
    !STATUSES.includes(status) ||
    (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000))
  )
    return res.status(400).json({ error: "Invalid room values" });
  const duplicate = await db
    .prepare(
      "SELECT 1 FROM rooms WHERE school_id = ? AND (lower(name) = lower(?) OR (? IS NOT NULL AND lower(number) = lower(?)))",
    )
    .get(schoolId, name.trim(), number?.trim() || null, number?.trim() || null);
  if (duplicate) return res.status(409).json({ error: "Room name or number already exists" });
  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO rooms (id, school_id, name, number, type, capacity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, schoolId, name.trim(), number?.trim() || null, type, capacity ?? null, status);
  res.status(201).json({ id });
});

roomsRouter.patch("/:id", authorize("rooms.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const old = (await db
    .prepare("SELECT * FROM rooms WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId)) as
    | { name: string; number: string | null; type: string; capacity: number | null; status: string }
    | undefined;
  if (!old) return res.status(404).json({ error: "Room not found" });
  const name = req.body?.name ?? old.name,
    number = req.body?.number === undefined ? old.number : req.body.number;
  const type = req.body?.type ?? old.type,
    capacity = req.body?.capacity === undefined ? old.capacity : req.body.capacity,
    status = req.body?.status ?? old.status;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 100 ||
    (number !== null && (typeof number !== "string" || number.length > 40)) ||
    !TYPES.includes(type) ||
    !STATUSES.includes(status) ||
    (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000))
  )
    return res.status(400).json({ error: "Invalid room values" });
  const duplicate = await db
    .prepare(
      "SELECT 1 FROM rooms WHERE school_id = ? AND id <> ? AND (lower(name) = lower(?) OR (? IS NOT NULL AND lower(number) = lower(?)))",
    )
    .get(schoolId, req.params.id, name.trim(), number?.trim() || null, number?.trim() || null);
  if (duplicate) return res.status(409).json({ error: "Room name or number already exists" });
  await db
    .prepare(
      "UPDATE rooms SET name = ?, number = ?, type = ?, capacity = ?, status = ? WHERE id = ? AND school_id = ?",
    )
    .run(name.trim(), number?.trim() || null, type, capacity, status, req.params.id, schoolId);
  res.json({ ok: true });
});

roomsRouter.delete("/:id", authorize("rooms.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  if (
    !(await db
      .prepare("SELECT 1 FROM rooms WHERE id = ? AND school_id = ?")
      .get(req.params.id, schoolId))
  )
    return res.status(404).json({ error: "Room not found" });
  if (
    await db
      .prepare("SELECT 1 FROM classes WHERE room_id = ? AND school_id = ? LIMIT 1")
      .get(req.params.id, schoolId)
  )
    return res.status(409).json({ error: "Room is assigned to a class and cannot be deleted" });
  await db.prepare("DELETE FROM rooms WHERE id = ? AND school_id = ?").run(req.params.id, schoolId);
  res.json({ ok: true });
});
