import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import { assertParentOwnsStudent } from "./helpers.js";

export const transportRouter = Router();
transportRouter.use(authenticate);
const VEHICLE_STATUSES = ["On Route", "Idle", "Maintenance"];

type VehicleRow = {
  id: string;
  school_id: string;
  number: string | null;
  route: string | null;
  driver: string | null;
  driver_phone: string | null;
  pickup_time: string | null;
  drop_time: string | null;
  capacity: number;
  status: string;
  stops: string;
};

function withParsedStops(row: VehicleRow, occupied: number) {
  let stops: { name: string; time: string }[] = [];
  try {
    stops = JSON.parse(row.stops ?? "[]");
  } catch {
    stops = [];
  }
  return { ...row, stops, occupied };
}

transportRouter.get("/", authorize("transport.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const rows = (await db
    .prepare("SELECT * FROM vehicles WHERE school_id = ? ORDER BY number")
    .all(schoolId)) as VehicleRow[];
  const counts = (await db
    .prepare(
      "SELECT vehicle_id, COUNT(*) as n FROM students WHERE school_id = ? AND vehicle_id IS NOT NULL GROUP BY vehicle_id",
    )
    .all(schoolId)) as { vehicle_id: string; n: number }[];
  const occupiedById = new Map(counts.map((c) => [c.vehicle_id, c.n]));
  res.json(rows.map((v) => withParsedStops(v, occupiedById.get(v.id) ?? 0)));
});

/** The authenticated student's own transport assignment, or (for a parent) one of their own children's — never anyone else's. */
transportRouter.get("/mine", authorize("transport.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const user = req.user!;

  let studentId: string | null = null;
  if (user.role === "STUDENT") {
    studentId = user.linkedStudentId;
  } else if (user.role === "PARENT") {
    const requested = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
    if (!requested || !(await assertParentOwnsStudent(user, requested))) {
      return res.status(400).json({ error: "A valid studentId (your own child) is required" });
    }
    studentId = requested;
  } else {
    return res.status(403).json({ error: "Students or parents only" });
  }

  const student = (await db
    .prepare(
      "SELECT vehicle_id, pickup_point, drop_point FROM students WHERE id = ? AND school_id = ?",
    )
    .get(studentId, schoolId)) as
    | { vehicle_id: string | null; pickup_point: string | null; drop_point: string | null }
    | undefined;
  if (!student?.vehicle_id) return res.json(null);

  const vehicle = (await db
    .prepare("SELECT * FROM vehicles WHERE id = ? AND school_id = ?")
    .get(student.vehicle_id, schoolId)) as VehicleRow | undefined;
  if (!vehicle) return res.json(null);
  res.json({
    ...withParsedStops(vehicle, 0),
    pickup_point: student.pickup_point,
    drop_point: student.drop_point,
  });
});

transportRouter.post("/", authorize("transport.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { number, route, driver, driverPhone, pickupTime, dropTime, capacity, status, stops } =
    req.body ?? {};
  if (typeof number !== "string" || !number.trim())
    return res.status(400).json({ error: "number is required" });
  const parsedCapacity = capacity == null ? 40 : Number(capacity);
  if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 500)
    return res.status(400).json({ error: "capacity must be an integer from 1 to 500" });
  if (status != null && !VEHICLE_STATUSES.includes(status))
    return res.status(400).json({ error: "Invalid vehicle status" });
  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO vehicles (id, school_id, number, route, driver, driver_phone, pickup_time, drop_time, capacity, status, stops) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      schoolId,
      number.trim(),
      route ?? null,
      driver ?? null,
      driverPhone ?? null,
      pickupTime ?? null,
      dropTime ?? null,
      parsedCapacity,
      status ?? "Idle",
      JSON.stringify(Array.isArray(stops) ? stops : []),
    );
  res.status(201).json({ id });
});

transportRouter.patch("/:id", authorize("transport.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = await db
    .prepare("SELECT id FROM vehicles WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!existing) return res.status(404).json({ error: "Vehicle not found" });
  if (req.body?.status != null && !VEHICLE_STATUSES.includes(req.body.status))
    return res.status(400).json({ error: "Invalid vehicle status" });
  if (req.body?.capacity != null) {
    const capacity = Number(req.body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)
      return res.status(400).json({ error: "capacity must be an integer from 1 to 500" });
  }

  const keyMap: Record<string, string> = {
    driverPhone: "driver_phone",
    pickupTime: "pickup_time",
    dropTime: "drop_time",
  };
  const fields = [
    "number",
    "route",
    "driver",
    "driver_phone",
    "pickup_time",
    "drop_time",
    "capacity",
    "status",
    "stops",
  ];
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const [bodyKey, value] of Object.entries(req.body ?? {})) {
    const column = keyMap[bodyKey] ?? bodyKey;
    if (!fields.includes(column)) continue;
    updates.push(`${column} = ?`);
    params.push(column === "stops" ? JSON.stringify(value ?? []) : value);
  }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });
  params.push(req.params.id, schoolId);
  await db
    .prepare(`UPDATE vehicles SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`)
    .run(...params);
  res.json({ ok: true });
});

transportRouter.delete("/:id", authorize("transport.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const existing = await db
    .prepare("SELECT id FROM vehicles WHERE id = ? AND school_id = ?")
    .get(req.params.id, schoolId);
  if (!existing) return res.status(404).json({ error: "Vehicle not found" });

  await db.transaction(async () => {
    await db
      .prepare(
        "UPDATE students SET vehicle_id = NULL, pickup_point = NULL, drop_point = NULL WHERE vehicle_id = ? AND school_id = ?",
      )
      .run(req.params.id, schoolId);
    await db
      .prepare("DELETE FROM vehicles WHERE id = ? AND school_id = ?")
      .run(req.params.id, schoolId);
  });
  res.json({ ok: true });
});
