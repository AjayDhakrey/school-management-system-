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
const TERM_LABEL = /^Term [1-3] \(.+\)$/;

/** Term fees (e.g. Examination Fee) are billed three times a year, once per term. */
export const TERMS_PER_YEAR = 3;

export type BillingTerm = {
  number: number;
  /** "Term 1 (2026-2027)" — also what a generated term fee stores as its description. */
  label: string;
  /** "Apr – Jul" */
  range: string;
  months: BillingMonth[];
};

/** The academic year split into three terms of (nearly) equal length: Apr–Jul, Aug–Nov, Dec–Mar. */
export function academicTerms(months: BillingMonth[], yearName: string): BillingTerm[] {
  if (!months.length) return [];
  const size = Math.ceil(months.length / TERMS_PER_YEAR);
  const terms: BillingTerm[] = [];
  for (let i = 0; i < TERMS_PER_YEAR; i++) {
    const slice = months.slice(i * size, (i + 1) * size);
    if (!slice.length) break;
    terms.push({
      number: i + 1,
      label: `Term ${i + 1} (${yearName})`,
      range: slice.length > 1 ? `${slice[0]!.short} – ${slice.at(-1)!.short}` : slice[0]!.short,
      months: slice,
    });
  }
  return terms;
}

/** Month a generated monthly fee covers ("April 2026"), or null for other fees. */
export function billingMonthOf(fee: Pick<ApiFee, "description">) {
  return fee.description && MONTH_LABEL.test(fee.description) ? fee.description : null;
}

/** Term a generated term fee covers ("Term 1 (2026-2027)"), or null for other fees. */
export function billingTermOf(fee: Pick<ApiFee, "description">) {
  return fee.description && TERM_LABEL.test(fee.description) ? fee.description : null;
}

const ANNUAL_LABEL = /^Annual \(.+\)$/;
/** What a generated one-time fee (e.g. Admission Fee) stores as its description. */
export const ONE_TIME_LABEL = "One-time";

/** "Annual (2026-2027)" — what a generated yearly fee stores as its description. */
export function annualLabel(yearName: string) {
  return `Annual (${yearName})`;
}

/** Whether a fee was generated as a yearly fee ("Annual (2026-2027)"). */
export function isAnnualFee(fee: Pick<ApiFee, "description">) {
  return Boolean(fee.description && ANNUAL_LABEL.test(fee.description));
}

/** Billing period a generated fee covers — a month, a term, a year or one-time — or null. */
export function billingPeriodOf(fee: Pick<ApiFee, "description">) {
  if (!fee.description) return null;
  if (fee.description === ONE_TIME_LABEL || isAnnualFee(fee)) return fee.description;
  return billingMonthOf(fee) ?? billingTermOf(fee);
}

/**
 * Fee name as shown to people: "Tuition Fee · April 2026", "Examination Fee · Term 1 (2026-2027)",
 * "Transport Fee · Annual (2026-2027)", "Admission Fee · One-time".
 */
export function feeTitle(fee: Pick<ApiFee, "fee_type" | "description">) {
  const period = billingPeriodOf(fee);
  return period ? `${fee.fee_type} · ${period}` : fee.fee_type;
}
