import { db } from "../db/client.js";

/**
 * The attendance status vocabulary the whole app uses (frontend STATUS_OPTIONS matches this).
 * "Leave" is the excused / approved-absence category. No HALF_DAY concept exists in this project.
 */
export const ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "Leave"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const STATUS_BY_LOWER = new Map(ATTENDANCE_STATUSES.map((s) => [s.toLowerCase(), s]));

/** Case-insensitively resolves a client status string to the canonical spelling, or null if unknown. */
export function normalizeStatus(value: unknown): AttendanceStatus | null {
  return typeof value === "string"
    ? (STATUS_BY_LOWER.get(value.trim().toLowerCase()) ?? null)
    : null;
}

/**
 * An attendance `date` is an opaque school-calendar day, never run through Date()/timezone math on
 * write. We only bound-check it as a string: a real YYYY-MM-DD, not before 2000-01-01, and not more
 * than one day past today (the +1 absorbs UTC-vs-local skew for schools ahead of UTC without
 * allowing genuine future-dating). There is no per-school timezone setting to key off.
 */
export function validateAttendanceDate(value: unknown): { date: string } | { error: string } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: "date must be a valid YYYY-MM-DD calendar date" };
  }
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { error: "date must be a valid YYYY-MM-DD calendar date" };
  }
  if (value < "2000-01-01") return { error: "date is out of the supported range" };
  const maxAllowed = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (value > maxAllowed) return { error: "attendance cannot be marked for a future date" };
  return { date: value };
}

/** True-ish holiday lookup for a school on a date — returns the holiday row so callers can warn (never block). */
export async function holidayOn(schoolId: string, date: string) {
  return (
    ((await db
      .prepare("SELECT name, type FROM holidays WHERE school_id = ? AND date = ? LIMIT 1")
      .get(schoolId, date)) as { name: string; type: string | null } | undefined) ?? null
  );
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  eligible: number;
  percentage: number;
}

/**
 * Attendance % formula (documented, not silent):
 *   eligible days  = Present + Late + Absent   (Leave/excused is neutral — excluded)
 *   attended days  = Present + Late            (a late arrival still counts as attended)
 *   percentage     = round(attended / eligible * 100), or 0 when there are no eligible days
 */
export function summarize(rows: { status: string }[]): AttendanceSummary {
  const c = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const r of rows) {
    if (r.status === "Present") c.present++;
    else if (r.status === "Absent") c.absent++;
    else if (r.status === "Late") c.late++;
    else if (r.status === "Leave") c.leave++;
  }
  const eligible = c.present + c.late + c.absent;
  const percentage = eligible ? Math.round(((c.present + c.late) / eligible) * 1000) / 10 : 0;
  return { ...c, total: c.present + c.absent + c.late + c.leave, eligible, percentage };
}

/** Recomputes and persists the denormalised students.attendance percentage from real records. */
export async function recomputeStudentAttendance(studentId: string) {
  const rows = (await db
    .prepare("SELECT status FROM attendance WHERE student_id = ?")
    .all(studentId)) as { status: string }[];
  await db
    .prepare("UPDATE students SET attendance = ?, updated_at = datetime('now') WHERE id = ?")
    .run(summarize(rows).percentage, studentId);
}
