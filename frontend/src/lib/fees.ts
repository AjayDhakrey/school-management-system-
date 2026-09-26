import type { ApiAcademicYear, ApiFee, ApiFeeStructure } from "@/hooks/useApi";

// Allowed values of fee_structures.category / .frequency (check constraints in
// supabase/migrations/39_portal_schema_sync.sql).
export const FEE_CATEGORIES = [
  "Tuition",
  "Admission",
  "Transport",
  "Library",
  "Examination",
  "Activity",
  "Hostel",
  "Other",
] as const;
export const FEE_FREQUENCIES = ["Monthly", "Quarterly", "Term", "Annual", "One-Time"] as const;

export const DEFAULT_DUE_DAY = 10;

export type BillingMonth = {
  /** "2026-04" */
  key: string;
  /** "April 2026" — also what a generated monthly fee stores as its description. */
  label: string;
  /** "Apr" */
  short: string;
};

function parseMonth(date: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? "");
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) };
}

function monthName(y: number, m: number, style: "long" | "short") {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", {
    month: style,
    timeZone: "UTC",
  });
}

/** Calendar months an academic year spans, e.g. April 2026 … March 2027. */
export function academicMonths(
  year: Pick<ApiAcademicYear, "start_date" | "end_date"> | undefined,
): BillingMonth[] {
  const start = parseMonth(year?.start_date);
  const end = parseMonth(year?.end_date);
  if (!start || !end) return [];
  const months: BillingMonth[] = [];
  let { y, m } = start;
  while ((y < end.y || (y === end.y && m <= end.m)) && months.length < 24) {
    months.push({
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: `${monthName(y, m, "long")} ${y}`,
      short: monthName(y, m, "short"),
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** Due date for a month, clamped so day 31 lands on the last day of shorter months. */
export function monthlyDueDate(monthKey: string, day: number) {
  const parsed = parseMonth(monthKey);
  if (!parsed) return null;
  const lastDay = new Date(Date.UTC(parsed.y, parsed.m, 0)).getUTCDate();
  return `${monthKey}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** Monthly structures keep their due day in due_date (the first month's due date). */
export function dueDayOf(structure: Pick<ApiFeeStructure, "due_date">) {
  const day = Number(structure.due_date?.slice(8, 10));
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : DEFAULT_DUE_DAY;
}

export function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

const MONTH_LABEL = /^[A-Z][a-z]+ \d{4}$/;

/** Month a generated monthly fee covers ("April 2026"), or null for other fees. */
export function billingMonthOf(fee: Pick<ApiFee, "description">) {
  return fee.description && MONTH_LABEL.test(fee.description) ? fee.description : null;
}

/** Fee name as shown to people: "Tuition Fee · April 2026" for a monthly due. */
export function feeTitle(fee: Pick<ApiFee, "fee_type" | "description">) {
  const month = billingMonthOf(fee);
  return month ? `${fee.fee_type} · ${month}` : fee.fee_type;
}
