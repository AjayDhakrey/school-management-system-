import { useMemo } from "react";
import { useSchoolProfile } from "@/hooks/useApi";

// The school day: which days are working days and when each period starts and ends.
// Saved on the school (schools.timings, migration 62); until a school saves its own, the
// defaults below are used.

export const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type PeriodTime = { start: string; end: string };
export type SchoolTimings = { days: string[]; periods: PeriodTime[] };

export const DEFAULT_TIMINGS: SchoolTimings = {
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  periods: [
    { start: "08:15", end: "09:00" },
    { start: "09:05", end: "09:50" },
    { start: "09:55", end: "10:40" },
    { start: "11:00", end: "11:45" },
    { start: "11:50", end: "12:35" },
    { start: "13:15", end: "14:00" },
    { start: "14:05", end: "14:50" },
  ],
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reads saved timings, falling back to the defaults for anything missing or malformed. */
export function parseTimings(raw: unknown): SchoolTimings {
  const value = (typeof raw === "string" ? safeJson(raw) : raw) as Partial<SchoolTimings> | null;
  const days = Array.isArray(value?.days) ? WEEK_DAYS.filter((d) => value!.days!.includes(d)) : [];
  const periods = Array.isArray(value?.periods)
    ? value!.periods!.filter(
        (p): p is PeriodTime =>
          Boolean(p) && HHMM.test(String(p.start)) && HHMM.test(String(p.end)),
      )
    : [];
  return {
    days: days.length ? days : DEFAULT_TIMINGS.days,
    periods: periods.length ? periods : DEFAULT_TIMINGS.periods,
  };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export const toMinutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const fromMinutes = (total: number) => {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** "13:15" → "1:15 PM" */
export function formatClock(hhmm: string) {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "8:15 – 9:00 AM", or "11:50 AM – 12:35 PM" when it crosses noon. */
export function periodLabel(p: PeriodTime | undefined) {
  if (!p) return "";
  const a = formatClock(p.start);
  const b = formatClock(p.end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/** Problems that stop the timings being saved (empty when they're fine). */
export function timingProblems(t: SchoolTimings): string[] {
  const problems: string[] = [];
  if (!t.days.length) problems.push("Pick at least one working day.");
  if (!t.periods.length) problems.push("Add at least one period.");
  t.periods.forEach((p, i) => {
    if (!HHMM.test(p.start) || !HHMM.test(p.end)) {
      problems.push(`Period ${i + 1}: enter a start and end time.`);
    } else if (toMinutes(p.end) <= toMinutes(p.start)) {
      problems.push(`Period ${i + 1}: must end after it starts.`);
    } else if (i > 0 && toMinutes(p.start) < toMinutes(t.periods[i - 1]!.end)) {
      problems.push(`Period ${i + 1}: starts before period ${i} ends.`);
    }
  });
  return problems;
}

export type TimedPeriod = PeriodTime & { period: number; time: string };

/** The school's timings, ready for timetables: periods numbered from 1, with readable times. */
export function useSchoolTimings() {
  const { data: school, isLoading } = useSchoolProfile();
  const raw = (school as { timings?: unknown } | undefined)?.timings;
  return useMemo(() => {
    const t = parseTimings(raw);
    const periods: TimedPeriod[] = t.periods.map((p, i) => ({
      ...p,
      period: i + 1,
      time: periodLabel(p),
    }));
    return { days: t.days, periods, raw: t, isLoading };
  }, [raw, isLoading]);
}

/** Whether `period` on `day` is happening right now. */
export function isPeriodLive(day: string, p: PeriodTime | undefined) {
  if (!p) return false;
  const now = new Date();
  if (day !== now.toLocaleDateString("en-US", { weekday: "long" })) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= toMinutes(p.start) && minutes < toMinutes(p.end);
}
