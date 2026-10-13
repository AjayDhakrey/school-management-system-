import { api } from "@/lib/api";
import type { ApiAcademicYear, ApiFee, ApiFeeStructure } from "@/hooks/useApi";
import {
  academicMonths,
  academicTerms,
  annualLabel,
  billingMonthOf,
  billingTermOf,
  dueDayOf,
  isAnnualFee,
  monthlyDueDate,
  ONE_TIME_LABEL,
} from "@/lib/fees";

// Bills a newly admitted student from their class's fee structure, with the same rules as
// "Generate Fees" on the Fee Structure page:
//   • One-time fees (e.g. Admission Fee) — once per student, ever
//   • Yearly fees — once for the session
//   • Term fees — the term they join in, plus any later terms that have already started
//   • Monthly fees — from the admission month up to the current month (later months are billed
//     by the normal monthly Generate Fees)
//   • Hostel fees only for hostellers, Transport fees only for students with a bus route
// No due date is ever earlier than the admission date, so a new student never starts "Overdue".
// Anything already billed to the student is skipped, so running it twice is harmless.

const BILLED_FREQUENCIES = ["Monthly", "Term", "Annual", "One-Time"];
const BATCH = 500;

export type NewStudentBilling = {
  studentId: string;
  classId: string | null | undefined;
  /** The class's academic year; falls back to the school's active year. */
  academicYearId?: string | null;
  /** YYYY-MM-DD; defaults to today. */
  admittedOn?: string | null;
  isHosteller?: boolean;
  hasTransport?: boolean;
};

export async function billNewStudent(
  input: NewStudentBilling,
): Promise<{ count: number; total: number; reason?: string }> {
  if (!input.classId) return { count: 0, total: 0, reason: "the student has no class" };

  const [structures, years, existing] = await Promise.all([
    api.get<ApiFeeStructure[]>("/fee-structures"),
    api.get<ApiAcademicYear[]>("/academic-years"),
    api.get<ApiFee[]>(`/fees?studentId=${encodeURIComponent(input.studentId)}`),
  ]);

  const year =
    years.find((y) => y.id === input.academicYearId) ?? years.find((y) => y.status === "ACTIVE");
  if (!year) return { count: 0, total: 0, reason: "no active academic year was found" };

  const months = academicMonths(year);
  if (!months.length)
    return { count: 0, total: 0, reason: `${year.name} has no start / end dates` };
  const terms = academicTerms(months, year.name);
  const yearLabel = annualLabel(year.name);

  const today = new Date().toISOString().slice(0, 10);
  const admittedOn = (input.admittedOn || today).slice(0, 10);
  const first = months[0]!.key;
  const last = months.at(-1)!.key;
  const startKey = admittedOn.slice(0, 7) > first ? admittedOn.slice(0, 7) : first;
  const nowKey = today.slice(0, 7) < last ? today.slice(0, 7) : last;
  const endKey = nowKey > startKey ? nowKey : startKey;
  const targetMonths = months.filter((m) => m.key >= startKey && m.key <= endKey);
  if (!targetMonths.length) {
    return { count: 0, total: 0, reason: `the admission date is outside ${year.name}` };
  }

  // Never due before the student actually joined.
  const notBeforeAdmission = (due: string | null) => (due && due > admittedOn ? due : admittedOn);

  const applicable = structures.filter(
    (s) =>
      (s.status ?? "ACTIVE") === "ACTIVE" &&
      s.academic_year_id === year.id &&
      (!s.class_id || s.class_id === input.classId) &&
      BILLED_FREQUENCIES.includes(s.frequency ?? "") &&
      !(s.category === "Hostel" && !input.isHosteller) &&
      !(s.category === "Transport" && !input.hasTransport),
  );

  if (!applicable.length) {
    return { count: 0, total: 0, reason: `the class has no fee structure for ${year.name}` };
  }

  // What this student already has, so nothing is billed twice.
  const billed = new Set<string>();
  for (const f of existing) {
    if (f.description === ONE_TIME_LABEL) {
      billed.add(`once|${f.fee_type.trim().toLowerCase()}`);
      continue;
    }
    if (!f.fee_structure_id) continue;
    const term = billingTermOf(f);
    if (term) billed.add(`${f.fee_structure_id}|${term}`);
    else if (isAnnualFee(f)) billed.add(`${f.fee_structure_id}|${f.description}`);
    else {
      const month =
        months.find((m) => m.label === billingMonthOf(f))?.key ?? f.due_date?.slice(0, 7);
      if (month) billed.add(`${f.fee_structure_id}|${month}`);
    }
  }

  const items: {
    studentId: string;
    feeStructureId: string;
    amount: number;
    dueDate: string | null;
    description: string;
  }[] = [];
  const add = (
    s: ApiFeeStructure,
    key: string,
    monthKey: string,
    description: string,
    due?: string | null,
  ) => {
    if (billed.has(key)) return;
    billed.add(key);
    items.push({
      studentId: input.studentId,
      feeStructureId: s.id,
      amount: s.amount,
      dueDate: notBeforeAdmission(due ?? monthlyDueDate(monthKey, dueDayOf(s))),
      description,
    });
  };

  const startTerm = terms.find((t) => t.months.some((m) => m.key === startKey));
  for (const s of applicable) {
    switch (s.frequency) {
      case "One-Time":
        add(s, `once|${s.fee_type.trim().toLowerCase()}`, startKey, ONE_TIME_LABEL);
        break;
      case "Annual":
        add(s, `${s.id}|${yearLabel}`, startKey, yearLabel, s.due_date ?? null);
        break;
      case "Term":
        for (const t of terms) {
          const started = t.months[0]!.key <= endKey;
          if (!started || (startTerm && t.number < startTerm.number)) continue;
          const termStart = t.months[0]!.key > startKey ? t.months[0]!.key : startKey;
          add(s, `${s.id}|${t.label}`, termStart, t.label);
        }
        break;
      default:
        for (const m of targetMonths) add(s, `${s.id}|${m.key}`, m.key, m.label);
    }
  }

  let count = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const result = await api.post<{ created: number }>("/fees/bulk", {
      items: items.slice(i, i + BATCH),
    });
    count += result.created;
  }
  if (!items.length) return { count: 0, total: 0, reason: "everything due is already billed" };
  return { count, total: items.reduce((sum, item) => sum + item.amount, 0) };
}
