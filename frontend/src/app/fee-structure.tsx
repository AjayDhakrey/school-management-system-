import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronRight,
  Layers,
  Maximize2,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  UserPlus,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/shared/ui-kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAcademicYears,
  useClasses,
  useFeeStructures,
  useFees,
  useStudents,
  type ApiAcademicYear,
  type ApiClass,
  type ApiFeeStructure,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import {
  academicMonths,
  academicTerms,
  billingMonthOf,
  billingTermOf,
  annualLabel,
  isAnnualFee,
  ONE_TIME_LABEL,
  TERMS_PER_YEAR,
  type BillingTerm,
  dueDayOf,
  monthlyDueDate,
  ordinal,
  DEFAULT_DUE_DAY,
  FEE_CATEGORIES,
  type BillingMonth,
} from "@/lib/fees";
import { cn } from "@/lib/utils";
import { escapeHtml, printHtml } from "@/lib/print";
import { useSchoolBranding } from "@/hooks/use-school-branding";

const ALL = "__all__";
const DUE_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
// Rows per bulk insert; each batch is written atomically.
const BILL_BATCH = 500;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const rupees = (n: number) => `₹${n.toLocaleString()}`;
const className = (c: Pick<ApiClass, "name" | "section">) =>
  c.section ? `${c.name}-${c.section}` : c.name;
const isActive = (s: ApiFeeStructure) => (s.status ?? "ACTIVE") === "ACTIVE";
/** Term fees (e.g. Examination Fee) are billed once per term — three times a year. */
const isTerm = (s: ApiFeeStructure) => s.frequency === "Term";

/** How a class-wise fee is charged; each gets its own section on the Fee Structure page. */
type BillingFrequency = "Monthly" | "Term" | "Annual" | "One-Time";

const BILLING_GROUPS: {
  frequency: BillingFrequency;
  title: string;
  note: string;
  examples: string;
  /** "month" → "₹1,500/month" */
  per: string;
  /** Option label in the class-wise form. */
  option: string;
}[] = [
  {
    frequency: "Monthly",
    title: "Monthly Fees",
    note: "Charged every month",
    examples: "Tuition Fee, Hostel Fee",
    per: "month",
    option: "Every month",
  },
  {
    frequency: "Term",
    title: "Term Fees",
    note: `Charged ${TERMS_PER_YEAR} times a year — Term 1, Term 2 and Term 3`,
    examples: "Examination Fee",
    per: "term",
    option: "Every term",
  },
  {
    frequency: "Annual",
    title: "Yearly Fees",
    note: "Charged once a year",
    examples: "Transport, Library, Activity Fee",
    per: "year",
    option: "Once a year",
  },
  {
    frequency: "One-Time",
    title: "One-Time Fees",
    note: "Charged once per student, when they join",
    examples: "Admission Fee",
    per: "one-time",
    option: "One time",
  },
];
const BILLING_FREQUENCIES = BILLING_GROUPS.map((g) => g.frequency) as string[];
/** Fees the class-wise sections and fee generation handle (everything except Quarterly). */
const isBillable = (s: ApiFeeStructure) => BILLING_FREQUENCIES.includes(s.frequency ?? "");
const groupOf = (frequency: string | null | undefined) =>
  BILLING_GROUPS.find((g) => g.frequency === frequency) ?? BILLING_GROUPS[0]!;

/** Categories that fit each way of charging; "Other" is always allowed. */
const CATEGORIES_FOR: Record<BillingFrequency, (typeof FEE_CATEGORIES)[number][]> = {
  Monthly: ["Tuition", "Hostel", "Other"],
  Term: ["Examination", "Other"],
  Annual: ["Transport", "Library", "Activity", "Other"],
  "One-Time": ["Admission", "Other"],
};
const categoriesFor = (frequency: string) =>
  CATEGORIES_FOR[frequency as BillingFrequency] ?? [...FEE_CATEGORIES];
/** Keep the category if it fits the new frequency, otherwise use that frequency's first one. */
const fitCategory = (category: string, frequency: string) => {
  const allowed = categoriesFor(frequency);
  return (allowed as string[]).includes(category) ? category : allowed[0]!;
};

/** The school's billing rules: tuition & hostel monthly, exams per term, transport / library /
 *  activity yearly, admission once. */
function frequencyForCategory(category: string): BillingFrequency {
  switch (category) {
    case "Examination":
      return "Term";
    case "Admission":
      return "One-Time";
    case "Transport":
    case "Library":
    case "Activity":
      return "Annual";
    default:
      return "Monthly";
  }
}
const sameHead = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function guessCategory(feeType: string): (typeof FEE_CATEGORIES)[number] {
  const name = feeType.toLowerCase();
  if (name.includes("transport") || name.includes("bus")) return "Transport";
  if (name.includes("library")) return "Library";
  if (name.includes("exam")) return "Examination";
  if (name.includes("hostel")) return "Hostel";
  if (name.includes("activit") || name.includes("sport")) return "Activity";
  if (name.includes("admission")) return "Admission";
  return "Tuition";
}

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function DueDaySelect({
  value,
  onChange,
  frequency = "Monthly",
}: {
  value: number;
  onChange: (day: number) => void;
  frequency?: string;
}) {
  const suffix =
    frequency === "Term" ? "" : frequency === "Monthly" ? "of every month" : "of the billing month";
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="bg-surface">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {DUE_DAYS.map((d) => (
          <SelectItem key={d} value={String(d)}>
            {suffix ? `${ordinal(d)} ${suffix}` : ordinal(d)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "2026-04-10" → "10 Apr" (or "10 Apr 2026" with the year). */
function shortDate(iso: string | null, withYear = false) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** "15,000", "₹2300", "1500.00" — an amount typed into the name box by mistake. */
function looksLikeAmount(name: string) {
  return /^[\s₹$,.\d-]+$/.test(name.trim());
}

/**
 * Due-date control that fits how the fee is charged: a day of every month for monthly fees, a day
 * of each term's first month (with the three dates spelled out) for term fees, one date in the
 * session for yearly fees, and nothing to pick for one-time fees — they're due when billed.
 */
function DueField({
  frequency,
  dueDay,
  onDueDay,
  dueDate,
  onDueDate,
  months,
  terms,
}: {
  frequency: string;
  dueDay: number;
  onDueDay: (day: number) => void;
  dueDate: string;
  onDueDate: (date: string) => void;
  months: BillingMonth[];
  terms: BillingTerm[];
}) {
  if (frequency === "One-Time") {
    return (
      <div className="grid gap-1.5">
        <Label>Due Date</Label>
        <p className="flex h-9 items-center rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
          On admission (when billed)
        </p>
      </div>
    );
  }
  if (frequency === "Annual" || !BILLING_FREQUENCIES.includes(frequency)) {
    const first = months[0]?.key;
    const last = months.at(-1)?.key;
    return (
      <div className="grid gap-1.5">
        <Label htmlFor="feeDueDate">Due Date</Label>
        <Input
          id="feeDueDate"
          type="date"
          value={dueDate}
          min={first ? `${first}-01` : undefined}
          max={last ? (monthlyDueDate(last, 31) ?? undefined) : undefined}
          onChange={(e) => onDueDate(e.target.value)}
          className="bg-surface"
        />
      </div>
    );
  }
  const termDates =
    frequency === "Term"
      ? terms
          .map((t) => (t.months[0] ? monthlyDueDate(t.months[0].key, dueDay) : null))
          .filter((d): d is string => Boolean(d))
      : [];
  return (
    <div className="grid gap-1.5">
      <Label>{frequency === "Term" ? "Due Each Term On" : "Due Every Month On"}</Label>
      <DueDaySelect value={dueDay} onChange={onDueDay} frequency={frequency} />
      {termDates.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Due {termDates.map((d) => shortDate(d)).join(", ")}
        </p>
      )}
    </div>
  );
}

const GROUP_ICON: Record<BillingFrequency, typeof Wallet> = {
  Monthly: CalendarDays,
  Term: BookOpenCheck,
  Annual: CalendarRange,
  "One-Time": UserPlus,
};
const GROUP_TONE: Record<BillingFrequency, string> = {
  Monthly: "bg-primary/10 text-primary",
  Term: "bg-gold-soft text-gold-foreground",
  Annual: "bg-success-soft text-success",
  "One-Time": "bg-info-soft text-info",
};

/** Numbered step heading inside the class-wise fee form. */
function StepTitle({ n, title, aside }: { n: number; title: string; aside?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {n}
      </span>
      <h3 className="flex-1 text-sm font-semibold">{title}</h3>
      {aside && <span className="text-[11px] font-medium text-muted-foreground">{aside}</span>}
    </div>
  );
}

/** Sets one fee head per standard (monthly, per term, yearly or one-time) for every section. */
function ClassWiseFeesDialog({
  head,
  headFrequency,
  defaultFrequency,
  year,
  months,
  terms,
  classes,
  billable,
  onDone,
}: {
  /** Existing head being edited; a new head when null. */
  head: string | null;
  /** How the head being edited is charged today. */
  headFrequency: BillingFrequency | null;
  /** Preselected charging for a new head (from the section it was added in). */
  defaultFrequency: BillingFrequency | null;
  year: ApiAcademicYear;
  months: BillingMonth[];
  terms: BillingTerm[];
  classes: ApiClass[];
  /** Active class-wise structures of this year (every billed frequency). */
  billable: ApiFeeStructure[];
  onDone: () => void;
}) {
  const [feeType, setFeeType] = useState(head ?? "");
  const lookupName = head ?? feeType;
  const ofHead = (s: ApiFeeStructure) =>
    sameHead(s.fee_type, lookupName) && (!headFrequency || s.frequency === headFrequency);
  const headRows = billable.filter((s) => s.class_id && ofHead(s));
  const sample = headRows[0];
  const [category, setCategory] = useState(
    sample?.category ?? (head ? guessCategory(head) : defaultCategory(defaultFrequency)),
  );
  const [frequency, setFrequency] = useState<BillingFrequency>(
    headFrequency ?? defaultFrequency ?? frequencyForCategory(category),
  );
  const group = groupOf(frequency);
  const per = group.per;
  const [dueDay, setDueDay] = useState(sample ? dueDayOf(sample) : DEFAULT_DUE_DAY);
  // Yearly fees are due on one date in the session.
  const [annualDue, setAnnualDue] = useState(
    sample?.frequency === "Annual" && sample.due_date
      ? sample.due_date
      : months[0]
        ? (monthlyDueDate(months[0].key, DEFAULT_DUE_DAY) ?? "")
        : "",
  );
  // Only what the user typed; untouched classes show the saved amount.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [fillAll, setFillAll] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const allClasses = billable.find((s) => !s.class_id && ofHead(s));

  const standards = Array.from(
    classes.reduce((groups, cls) => {
      const key = cls.name.trim().toLocaleLowerCase();
      const current = groups.get(key);
      if (current) current.classes.push(cls);
      else groups.set(key, { key, name: cls.name.trim(), classes: [cls] });
      return groups;
    }, new Map<string, { key: string; name: string; classes: ApiClass[] }>()),
  )
    .map(([, standard]) => standard)
    .sort((a, b) => collator.compare(a.name, b.name));

  const existingFor = (classId: string) => headRows.find((s) => s.class_id === classId);
  const shownAmount = (standard: (typeof standards)[number]) => {
    const edited = edits[standard.key];
    if (edited !== undefined) return edited;
    const existing = standard.classes.map((c) => existingFor(c.id)).find(Boolean);
    return existing ? String(existing.amount) : "";
  };
  const firstMonth = months[0];
  const dueDate =
    frequency === "Annual"
      ? annualDue || null
      : firstMonth
        ? monthlyDueDate(firstMonth.key, dueDay)
        : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const name = feeType.trim();
    if (!name) {
      toast.error("Enter a fee head name");
      return;
    }
    if (looksLikeAmount(name)) {
      toast.error("Fee head name can't be a number — use a name like “Tuition Fee”");
      return;
    }
    const renamed = Boolean(head) && !sameHead(name, head ?? "");
    const jobs: Promise<unknown>[] = [];
    // Renaming / re-scheduling applies to every row of this head, including the all-classes one.
    if (allClasses && (renamed || allClasses.frequency !== frequency)) {
      jobs.push(api.patch(`/fee-structures/${allClasses.id}`, { feeType: name, frequency }));
    }
    for (const standard of standards) {
      const raw = shownAmount(standard).trim();
      const value = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        toast.error(`Enter a valid amount for ${standard.name}`);
        return;
      }
      for (const cls of standard.classes) {
        const existing = existingFor(cls.id);
        if (existing && value === 0) {
          // Keep the row for fees already billed from it; just stop charging.
          jobs.push(
            api.patch(`/fee-structures/${existing.id}`, {
              status: "INACTIVE",
              ...(renamed ? { feeType: name } : {}),
            }),
          );
        } else if (existing) {
          const changed =
            renamed ||
            existing.frequency !== frequency ||
            existing.amount !== value ||
            (existing.due_date ?? null) !== dueDate ||
            existing.category !== category;
          if (changed) {
            jobs.push(
              api.patch(`/fee-structures/${existing.id}`, {
                amount: value,
                dueDate,
                category,
                frequency,
                ...(renamed ? { feeType: name } : {}),
              }),
            );
          }
        } else if (value > 0) {
          jobs.push(
            api.post("/fee-structures", {
              feeType: name,
              category,
              frequency,
              amount: value,
              classId: cls.id,
              academicYearId: year.id,
              dueDate,
            }),
          );
        }
      }
    }
    if (!jobs.length) {
      toast.info("No changes to save");
      return;
    }
    setSubmitting(true);
    const results = await Promise.allSettled(jobs);
    setSubmitting(false);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      const first = failed[0];
      toast.error(
        `${failed.length} of ${jobs.length} classes failed: ${first?.status === "rejected" ? errorText(first.reason, "unknown error") : ""}`,
      );
    } else {
      toast.success(
        `${name} saved by standard and applied to all ${classes.length} section${classes.length === 1 ? "" : "s"}`,
      );
    }
    onDone();
  }

  const filled = standards.filter((st) => Number(shownAmount(st)) > 0);
  const amounts = filled.map((st) => Number(shownAmount(st)));
  const low = amounts.length ? Math.min(...amounts) : 0;
  const high = amounts.length ? Math.max(...amounts) : 0;
  const GroupIcon = GROUP_ICON[frequency];
  const schedule =
    frequency === "Term"
      ? terms.map((t) => ({ label: `Term ${t.number}`, value: t.range }))
      : frequency === "Annual"
        ? [{ label: "Once", value: year.name }]
        : frequency === "One-Time"
          ? [{ label: "Once", value: "When the student joins" }]
          : [
              {
                label: "Every month",
                value: `${months[0]?.short ?? ""} – ${months.at(-1)?.short ?? ""}`,
              },
            ];

  return (
    <DialogContent className="flex max-h-[92vh] max-w-xl flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="border-b border-border px-5 pt-5 pb-4 text-left">
        <div className="flex items-center gap-3 pr-6">
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
              GROUP_TONE[frequency],
            )}
          >
            <GroupIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="truncate text-lg">
              {head ? `Edit ${head}` : `Add ${group.title.replace(/s$/, "")}`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {year.name} · one amount per standard, applied to every section
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Step 1 — how often */}
          <section className="space-y-2.5">
            <StepTitle n={1} title="How often is it charged?" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BILLING_GROUPS.map((option) => {
                const Icon = GROUP_ICON[option.frequency];
                const on = frequency === option.frequency;
                return (
                  <button
                    key={option.frequency}
                    type="button"
                    onClick={() => {
                      setFrequency(option.frequency);
                      setCategory((c) => fitCategory(c, option.frequency));
                    }}
                    aria-pressed={on}
                    className={cn(
                      "relative flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-all active:scale-[0.98]",
                      on
                        ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    {on && (
                      <span className="absolute top-1.5 right-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                    <span
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-xl",
                        on ? GROUP_TONE[option.frequency] : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span
                      className={cn(
                        "text-sm font-semibold leading-tight",
                        !on && "text-foreground/80",
                      )}
                    >
                      {option.option}
                    </span>
                    <span className="text-[10px] leading-none text-muted-foreground">
                      {option.frequency === "Monthly"
                        ? `${months.length}× a year`
                        : option.frequency === "Term"
                          ? `${TERMS_PER_YEAR}× a year`
                          : option.frequency === "Annual"
                            ? "1× a year"
                            : "on admission"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/50 px-3 py-2">
              <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground">Billed:</span>
              {schedule.map((item) => (
                <span
                  key={item.label + item.value}
                  className="rounded-full bg-card px-2 py-0.5 text-[11px] shadow-sm"
                >
                  <span className="font-semibold">{item.label}</span>
                  <span className="text-muted-foreground"> · {item.value}</span>
                </span>
              ))}
            </div>
          </section>

          {/* Step 2 — details */}
          <section className="space-y-2.5">
            <StepTitle n={2} title="Fee details" />
            <div className="grid gap-1.5">
              <Label htmlFor="classWiseHead" className="text-xs text-muted-foreground">
                Fee name
              </Label>
              <Input
                id="classWiseHead"
                value={feeType}
                onChange={(e) => {
                  setFeeType(e.target.value);
                  if (head) return;
                  const guessed = guessCategory(e.target.value);
                  setCategory(guessed);
                  setFrequency(frequencyForCategory(guessed));
                }}
                placeholder={`e.g. ${group.examples.split(",")[0]}`}
                className="h-10 bg-surface"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select
                  value={category}
                  // The list follows the chosen frequency, so picking a category never changes it.
                  // Radix also reports "" while the list swaps over; ignore that.
                  onValueChange={(v) => v && setCategory(v)}
                >
                  <SelectTrigger className="bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesFor(frequency).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DueField
                frequency={frequency}
                dueDay={dueDay}
                onDueDay={setDueDay}
                dueDate={annualDue}
                onDueDate={setAnnualDue}
                months={months}
                terms={terms}
              />
            </div>
          </section>

          {/* Step 3 — amounts */}
          <section className="space-y-2.5">
            <StepTitle
              n={3}
              title={`Amount per ${per === "one-time" ? "student" : per}`}
              aside={`${filled.length} of ${standards.length} set`}
            />
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  ₹
                </span>
                <Input
                  id="fillAll"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label="Same amount for every standard"
                  value={fillAll}
                  onChange={(e) => setFillAll(e.target.value)}
                  placeholder="Same amount for all classes"
                  className="h-9 border-0 bg-transparent pl-7 shadow-none focus-visible:ring-0"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 shrink-0"
                disabled={fillAll === ""}
                onClick={() =>
                  setEdits(Object.fromEntries(standards.map((st) => [st.key, fillAll])))
                }
              >
                Apply to all
              </Button>
            </div>

            {allClasses && (
              <p className="rounded-xl bg-gold-soft/50 px-3 py-2 text-xs text-muted-foreground">
                An "All Classes" {allClasses.fee_type} of {rupees(allClasses.amount)}/{per} also
                applies; class amounts here are charged on top of it.
              </p>
            )}

            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {standards.map((standard) => {
                const value = shownAmount(standard);
                const set = Number(value) > 0;
                return (
                  <li
                    key={standard.key}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 transition-colors",
                      set ? "bg-primary/[0.04]" : "bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        set ? "bg-success" : "bg-border",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold capitalize">{standard.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {standard.classes.length} section{standard.classes.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="relative w-36 shrink-0 sm:w-40">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                        ₹
                      </span>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`Amount per ${per} for ${standard.name}, applied to all sections`}
                        value={value}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [standard.key]: e.target.value }))
                        }
                        placeholder="0"
                        className={cn(
                          "h-9 pr-14 pl-6 text-right font-semibold tabular-nums",
                          set ? "border-primary/30 bg-card" : "bg-surface",
                        )}
                      />
                      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-muted-foreground">
                        {per === "one-time" ? "once" : `/${per}`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-2 border-t border-border bg-muted/30 px-5 py-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-xs text-muted-foreground">
            {filled.length ? (
              <>
                <span className="font-semibold text-foreground">
                  {low === high ? rupees(low) : `${rupees(low)} – ${rupees(high)}`}
                </span>{" "}
                {per === "one-time" ? "once" : `per ${per}`} · {filled.length} of {standards.length}{" "}
                classes
              </>
            ) : (
              "Enter an amount for at least one class"
            )}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-10">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitting} className="h-10 gap-1.5">
              <Check className="h-4 w-4" />
              {submitting
                ? "Saving…"
                : head
                  ? "Save Changes"
                  : `Save ${group.title.replace(/s$/, "")}`}
            </Button>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}

/** A sensible category to start a new head with, from the section it's being added in. */
function defaultCategory(frequency: BillingFrequency | null): (typeof FEE_CATEGORIES)[number] {
  switch (frequency) {
    case "Term":
      return "Examination";
    case "Annual":
      return "Transport";
    case "One-Time":
      return "Admission";
    default:
      return "Tuition";
  }
}

/** Bills every active student their dues for one month (or the whole session): monthly fees every
 *  month, term fees when a term starts, yearly fees once a year and one-time fees once ever. */
function GenerateFeesDialog({
  year,
  months,
  terms,
  classes,
  billable,
  onDone,
}: {
  year: ApiAcademicYear;
  months: BillingMonth[];
  terms: BillingTerm[];
  classes: ApiClass[];
  /** Active class-wise structures of this year (every billed frequency). */
  billable: ApiFeeStructure[];
  onDone: () => void;
}) {
  const { data: students } = useStudents();
  const { data: fees } = useFees();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [monthKey, setMonthKey] = useState(
    months.some((m) => m.key === thisMonth) ? thisMonth : (months[0]?.key ?? ""),
  );
  const [classId, setClassId] = useState(ALL);
  const [submitting, setSubmitting] = useState(false);
  const yearLabel = annualLabel(year.name);

  const plan = useMemo(() => {
    const targetMonths = monthKey === ALL ? months : months.filter((m) => m.key === monthKey);
    const keyForLabel = new Map(months.map((m) => [m.label, m.key]));
    const termStarting = new Map(terms.map((t) => [t.months[0]?.key, t]));
    // What's already billed: a monthly fee by its month (label or due date), a term fee by its
    // term, a yearly fee by its year, and a one-time fee by student + fee name in any year.
    const billed = new Set<string>();
    for (const f of fees ?? []) {
      if (f.description === ONE_TIME_LABEL) {
        billed.add(`once|${f.student_id}|${f.fee_type.trim().toLowerCase()}`);
        continue;
      }
      if (!f.fee_structure_id) continue;
      const termLabel = billingTermOf(f);
      if (termLabel) {
        billed.add(`${f.fee_structure_id}|${f.student_id}|${termLabel}`);
        continue;
      }
      if (isAnnualFee(f)) {
        billed.add(`${f.fee_structure_id}|${f.student_id}|${f.description}`);
        continue;
      }
      const label = billingMonthOf(f);
      const key = (label && keyForLabel.get(label)) ?? f.due_date?.slice(0, 7);
      if (key) billed.add(`${f.fee_structure_id}|${f.student_id}|${key}`);
    }
    const yearClassIds = new Set(classes.map((c) => c.id));
    const items: {
      studentId: string;
      feeStructureId: string;
      amount: number;
      dueDate: string | null;
      description: string;
    }[] = [];
    const counts: Record<BillingFrequency, number> = {
      Monthly: 0,
      Term: 0,
      Annual: 0,
      "One-Time": 0,
    };
    const billedStudents = new Set<string>();
    let skipped = 0;
    let total = 0;

    function bill(
      studentId: string,
      structure: ApiFeeStructure,
      key: string,
      monthKeyForDue: string,
      description: string,
    ) {
      if (billed.has(key)) {
        skipped += 1;
        return;
      }
      billed.add(key);
      items.push({
        studentId,
        feeStructureId: structure.id,
        amount: structure.amount,
        dueDate:
          structure.frequency === "Annual" && structure.due_date
            ? structure.due_date
            : monthlyDueDate(monthKeyForDue, dueDayOf(structure)),
        description,
      });
      billedStudents.add(studentId);
      total += structure.amount;
      counts[groupOf(structure.frequency).frequency] += 1;
    }

    for (const s of students ?? []) {
      const enrolled =
        s.academic_year_id === year.id &&
        (s.status ?? "Active").toLowerCase() === "active" &&
        s.class_id !== null &&
        yearClassIds.has(s.class_id) &&
        (classId === ALL || s.class_id === classId);
      if (!enrolled) continue;
      for (const structure of billable) {
        if (structure.class_id && structure.class_id !== s.class_id) continue;
        // Hostel fees are only for students who live in the hostel.
        if (structure.category === "Hostel" && !s.is_hosteller) continue;
        const first = targetMonths[0];
        if (!first) continue;
        switch (structure.frequency) {
          case "One-Time":
            // Once per student, ever — e.g. an Admission Fee isn't charged again next year.
            bill(
              s.id,
              structure,
              `once|${s.id}|${structure.fee_type.trim().toLowerCase()}`,
              first.key,
              ONE_TIME_LABEL,
            );
            break;
          case "Annual":
            bill(s.id, structure, `${structure.id}|${s.id}|${yearLabel}`, first.key, yearLabel);
            break;
          case "Term":
            // Billed once, in the month each term starts.
            for (const m of targetMonths) {
              const term = termStarting.get(m.key);
              if (term)
                bill(s.id, structure, `${structure.id}|${s.id}|${term.label}`, m.key, term.label);
            }
            break;
          default:
            for (const m of targetMonths) {
              bill(s.id, structure, `${structure.id}|${s.id}|${m.key}`, m.key, m.label);
            }
        }
      }
    }
    return { items, skipped, total, counts, students: billedStudents.size };
  }, [students, fees, billable, months, terms, classes, monthKey, classId, year.id, yearLabel]);
  const termStartLabel = new Map(terms.map((t) => [t.months[0]?.key, `Term ${t.number}`]));
  const hasTermFees = billable.some(isTerm);

  const periodLabel =
    monthKey === ALL
      ? `${year.name} (all ${months.length} months)`
      : (months.find((m) => m.key === monthKey)?.label ?? "");
  const breakdown = BILLING_GROUPS.filter((g) => plan.counts[g.frequency] > 0).map(
    (g) => `${plan.counts[g.frequency]} ${g.title.toLowerCase().replace(/ fees$/, "")}`,
  );

  async function handleGenerate() {
    if (!plan.items.length) return;
    setSubmitting(true);
    let created = 0;
    try {
      for (let i = 0; i < plan.items.length; i += BILL_BATCH) {
        const result = await api.post<{ created: number }>("/fees/bulk", {
          items: plan.items.slice(i, i + BILL_BATCH),
        });
        created += result.created;
      }
      toast.success(`Billed ${created} dues for ${periodLabel}`);
      onDone();
    } catch (err) {
      const note = created ? ` (${created} were billed before the error)` : "";
      toast.error(`${errorText(err, "Failed to generate fees")}${note}`);
      if (created) onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Generate Fees</DialogTitle>
        <DialogDescription>
          Monthly fees are billed every month, term fees when a term starts, yearly fees once a year
          and one-time fees once per student. Anything already billed is skipped, so it's safe to
          run again.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Month</Label>
            <Select value={monthKey} onValueChange={setMonthKey}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Choose a month" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                    {hasTermFees && termStartLabel.has(m.key)
                      ? ` · ${termStartLabel.get(m.key)} starts`
                      : ""}
                  </SelectItem>
                ))}
                <SelectItem value={ALL}>Whole session ({months.length} months)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value={ALL}>All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {className(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/40 p-3 text-center">
          <div>
            <p className="text-lg font-bold">{plan.students}</p>
            <p className="text-[11px] text-muted-foreground">Students</p>
          </div>
          <div>
            <p className="text-lg font-bold">{plan.items.length}</p>
            <p className="text-[11px] text-muted-foreground">New dues</p>
          </div>
          <div>
            <p className="text-lg font-bold">{rupees(plan.total)}</p>
            <p className="text-[11px] text-muted-foreground">Total billed</p>
          </div>
        </div>
        {breakdown.length > 0 && (
          <p className="text-xs text-muted-foreground">Includes {breakdown.join(", ")} dues.</p>
        )}
        {plan.skipped > 0 && (
          <p className="text-xs text-muted-foreground">
            {plan.skipped} due{plan.skipped === 1 ? " is" : "s are"} already billed and will be
            skipped.
          </p>
        )}
        {!plan.items.length && !plan.skipped && (
          <p className="text-xs text-muted-foreground">
            No active students in this selection have a fee to bill for this period.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button onClick={handleGenerate} disabled={submitting || !plan.items.length}>
          {submitting
            ? "Billing…"
            : plan.items.length
              ? `Bill ${plan.items.length} Dues`
              : "Nothing to Bill"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** Faint column tint per billing group, so each group reads as one band in the table. */
const GROUP_BAND: Record<BillingFrequency, string> = {
  Monthly: "bg-primary/[0.03]",
  Term: "bg-gold-soft/30",
  Annual: "bg-success-soft/30",
  "One-Time": "bg-info-soft/30",
};
const titleCase = (text: string) => text.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());

/** Coloured underline under each group's header band. */
const GROUP_ACCENT: Record<BillingFrequency, string> = {
  Monthly: "border-b-primary/50",
  Term: "border-b-gold/60",
  Annual: "border-b-success/50",
  "One-Time": "border-b-info/50",
};

/** Stylesheet for the printed class fee chart (landscape A4, colour bands kept). */
const FEE_CHART_PRINT_CSS = `
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
    border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #1e3a8a; }
  header p { margin: 0; color: #475569; line-height: 1.5; }
  .title { text-align: right; }
  h2 { font-size: 16px; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .06em; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip { border-radius: 999px; padding: 3px 10px; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
  thead th { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
  th.grp { font-size: 11px; color: #0f172a; text-align: center; }
  th.grp small { font-weight: 400; text-transform: none; letter-spacing: 0; color: #475569; margin-left: 4px; }
  td.cls, th.cls { text-align: left; font-weight: 600; white-space: nowrap; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.total { font-weight: 700; color: #1e3a8a; background: #eef2ff; }
  th.total { background: #e0e7ff; color: #1e3a8a; }
  td.total small { display: block; font-weight: 400; color: #64748b; font-size: 9px; }
  .edge { border-left: 2px solid #94a3b8; }
  .grp-Monthly, .band-Monthly { background: #eff6ff; }
  .grp-Term, .band-Term { background: #fef9e7; }
  .grp-Annual, .band-Annual { background: #ecfdf5; }
  .grp-One-Time, .band-One-Time { background: #f0f9ff; }
  th.grp-Monthly { border-bottom: 2px solid #3b82f6; }
  th.grp-Term { border-bottom: 2px solid #d4a017; }
  th.grp-Annual { border-bottom: 2px solid #16a34a; }
  th.grp-One-Time { border-bottom: 2px solid #0ea5e9; }
  tbody tr:nth-child(even) td.cls { background: #f8fafc; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  footer { display: flex; justify-content: space-between; margin-top: 10px; color: #64748b; font-size: 9.5px; }
`;

/** Every class-wise fee in one card: column groups per billing frequency and a yearly total. */
function ClassFeesCard({
  yearName,
  school,
  classes,
  billable,
  timesPerYear,
  onEditHead,
  onAdd,
}: {
  yearName: string;
  /** Printed at the top of the fee chart. */
  school: { name: string; address: string; phone: string; email: string };
  classes: ApiClass[];
  /** Active class-wise structures of this year (every billed frequency). */
  billable: ApiFeeStructure[];
  timesPerYear: (frequency: BillingFrequency) => number;
  onEditHead: (head: string, frequency: BillingFrequency) => void;
  onAdd: (frequency: BillingFrequency) => void;
}) {
  // Columns: each frequency's heads, in Monthly → Term → Yearly → One-time order.
  const columns = BILLING_GROUPS.flatMap((group) =>
    Array.from(
      new Map(
        billable
          .filter((s) => s.frequency === group.frequency)
          .map((s) => [s.fee_type.toLowerCase(), s.fee_type]),
      ).values(),
    )
      .sort(collator.compare)
      .map((head) => ({ head, group })),
  );
  const groupsUsed = BILLING_GROUPS.filter((g) => columns.some((c) => c.group === g));
  const amountFor = (cls: ApiClass, head: string, frequency: BillingFrequency) =>
    billable
      .filter(
        (s) =>
          s.frequency === frequency &&
          sameHead(s.fee_type, head) &&
          (!s.class_id || s.class_id === cls.id),
      )
      .reduce((sum, s) => sum + s.amount, 0);
  // Sections of a standard almost always pay the same, so they share a row ("Class 1 · A, B");
  // a section with different amounts keeps a row of its own.
  const rows: {
    key: string;
    name: string;
    sections: string[];
    amounts: number[];
    perYear: number;
  }[] = [];
  for (const cls of classes) {
    const amounts = columns.map(({ head, group }) => amountFor(cls, head, group.frequency));
    const signature = `${cls.name.trim().toLowerCase()}|${amounts.join(",")}`;
    const existing = rows.find((r) => r.key === signature);
    if (existing) {
      if (cls.section) existing.sections.push(cls.section);
      continue;
    }
    rows.push({
      key: signature,
      name: cls.name.trim(),
      sections: cls.section ? [cls.section] : [],
      amounts,
      perYear: amounts.reduce(
        (sum, amount, i) => sum + amount * timesPerYear(columns[i]!.group.frequency),
        0,
      ),
    });
  }
  const yearly = rows.map((r) => r.perYear).filter((v) => v > 0);
  const months = timesPerYear("Monthly") || 12;
  const rowLabel = (r: (typeof rows)[number]) => (
    <span className="block truncate font-semibold capitalize">{r.name}</span>
  );

  const [fullScreen, setFullScreen] = useState(false);

  function printChart() {
    const groupHeader = groupsUsed
      .map((g) => {
        const span = columns.filter((c) => c.group === g).length;
        const often =
          g.frequency === "One-Time" ? "once per student" : `${timesPerYear(g.frequency)}× a year`;
        return `<th colspan="${span}" class="grp grp-${g.frequency}">${escapeHtml(g.title.replace(/ Fees$/, ""))} <small>${often}</small></th>`;
      })
      .join("");
    const headRow = columns
      .map(
        ({ head, group }, i) =>
          `<th class="num band-${group.frequency}${i === 0 || columns[i - 1]!.group !== group ? " edge" : ""}">${escapeHtml(titleCase(head))}</th>`,
      )
      .join("");
    const bodyRows = rows
      .map(
        (r) =>
          `<tr><td class="cls">${escapeHtml(titleCase(r.name))}</td>${r.amounts
            .map(
              (amount, i) =>
                `<td class="num band-${columns[i]!.group.frequency}${i === 0 || columns[i - 1]!.group !== columns[i]!.group ? " edge" : ""}">${amount ? rupees(amount) : "—"}</td>`,
            )
            .join("")}<td class="num total">${r.perYear ? rupees(r.perYear) : "—"}${
            r.perYear ? `<small>≈ ${rupees(Math.round(r.perYear / months))}/mo</small>` : ""
          }</td></tr>`,
      )
      .join("");
    const legend = groupsUsed
      .map(
        (g) =>
          `<span class="chip grp-${g.frequency}"><b>${escapeHtml(g.title)}</b> — ${escapeHtml(
            columns
              .filter((c) => c.group === g)
              .map((c) => titleCase(c.head))
              .join(", "),
          )}</span>`,
      )
      .join("");
    const contact = [school.phone, school.email].filter(Boolean).map(escapeHtml).join(" · ");
    const printed = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    printHtml(
      `Fee Structure ${yearName}`,
      `<header>
        <div>
          <h1>${escapeHtml(school.name)}</h1>
          <p>${escapeHtml(school.address)}${contact ? `<br>${contact}` : ""}</p>
        </div>
        <div class="title">
          <h2>Class Fee Structure</h2>
          <p>Academic Year ${escapeHtml(yearName)}</p>
        </div>
      </header>
      <div class="legend">${legend}</div>
      <table>
        <thead>
          <tr><th rowspan="2" class="cls">Class</th>${groupHeader}<th rowspan="2" class="num total">Per Year</th></tr>
          <tr>${headRow}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <footer>
        <span>Per Year = monthly fees × ${months} + term fees × ${TERMS_PER_YEAR} + yearly fees${
          columns.some((c) => c.group.frequency === "One-Time")
            ? " + one-time fees (new students only)"
            : ""
        }.</span>
        <span>Printed ${printed}</span>
      </footer>`,
      FEE_CHART_PRINT_CSS,
    );
  }

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Fee
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          How is it charged?
        </DropdownMenuLabel>
        {BILLING_GROUPS.map((g) => {
          const Icon = GROUP_ICON[g.frequency];
          return (
            <DropdownMenuItem
              key={g.frequency}
              onClick={() => onAdd(g.frequency)}
              className="gap-2.5 py-2"
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                  GROUP_TONE[g.frequency],
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{g.title.replace(/s$/, "")}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {g.examples}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const summaryStrip = (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
      {[
        { label: "Classes", value: String(classes.length) },
        { label: "Fees", value: String(columns.length) },
        { label: "Lowest / year", value: yearly.length ? rupees(Math.min(...yearly)) : "—" },
        { label: "Highest / year", value: yearly.length ? rupees(Math.max(...yearly)) : "—" },
      ].map((stat) => (
        <div key={stat.label} className="bg-card px-4 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {stat.label}
          </p>
          <p className="font-display text-base font-bold tabular-nums">{stat.value}</p>
        </div>
      ))}
    </div>
  );
  const chartTable = (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th
            rowSpan={2}
            className="sticky left-0 z-10 border-b-2 border-border bg-card px-3 py-2.5 sm:px-4 sm:py-3 text-left align-bottom text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Class
          </th>
          {groupsUsed.map((g) => {
            const Icon = GROUP_ICON[g.frequency];
            return (
              <th
                key={g.frequency}
                colSpan={columns.filter((c) => c.group === g).length}
                className={cn(
                  "border-l border-border border-b-2 px-2.5 py-1.5 sm:px-3 sm:py-2 text-left",
                  GROUP_BAND[g.frequency],
                  GROUP_ACCENT[g.frequency],
                )}
              >
                <span className="flex items-center gap-1.5 whitespace-nowrap sm:gap-2">
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-lg",
                      GROUP_TONE[g.frequency],
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {g.title.replace(/ Fees$/, "")}
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {/* Short on phones so the header stays on one line. */}
                    <span className="sm:hidden">
                      {g.frequency === "One-Time" ? "once" : `${timesPerYear(g.frequency)}×`}
                    </span>
                    <span className="hidden sm:inline">
                      {g.frequency === "One-Time"
                        ? "once per student"
                        : `${timesPerYear(g.frequency)}× a year`}
                    </span>
                  </span>
                </span>
              </th>
            );
          })}
          <th
            rowSpan={2}
            className="border-b-2 border-l border-border bg-primary/[0.04] px-3 py-2.5 sm:px-4 sm:py-3 text-right align-bottom text-[11px] font-bold uppercase tracking-wider text-primary"
          >
            Per Year
          </th>
        </tr>
        <tr className="border-b-2 border-border">
          {columns.map(({ head, group }, i) => (
            <th
              key={head + group.frequency}
              className={cn(
                "px-2.5 py-1.5 sm:px-3 sm:py-2 text-right whitespace-nowrap",
                GROUP_BAND[group.frequency],
                (i === 0 || columns[i - 1]!.group !== group) && "border-l border-border",
              )}
            >
              <button
                type="button"
                onClick={() => onEditHead(head, group.frequency)}
                className="group/head inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-card hover:text-foreground"
                title={`Edit ${head} for all classes`}
              >
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover/head:opacity-100" />
                {titleCase(head)}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            className="group/row border-b border-border/60 last:border-0 hover:bg-muted/40"
          >
            <td className="sticky left-0 z-10 bg-card px-3 py-2 sm:px-4 sm:py-2.5 whitespace-nowrap group-hover/row:bg-muted">
              {rowLabel(r)}
            </td>
            {r.amounts.map((amount, i) => (
              <td
                key={columns[i]!.head + columns[i]!.group.frequency}
                className={cn(
                  "px-2.5 py-2 text-[13px] sm:px-3 sm:py-2.5 sm:text-sm text-right whitespace-nowrap tabular-nums",
                  GROUP_BAND[columns[i]!.group.frequency],
                  amount ? "text-foreground/85" : "text-muted-foreground/50",
                  (i === 0 || columns[i - 1]!.group !== columns[i]!.group) &&
                    "border-l border-border",
                )}
              >
                {amount ? rupees(amount) : "—"}
              </td>
            ))}
            <td className="border-l border-border px-3 py-1.5 sm:px-4 sm:py-2 text-right whitespace-nowrap tabular-nums">
              <p className="font-display font-bold text-primary">
                {r.perYear ? rupees(r.perYear) : "—"}
              </p>
              {r.perYear > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  ≈ {rupees(Math.round(r.perYear / months))}/mo
                </p>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <SectionCard
      title="Class Fee Structure"
      subtitle={`Every fee each class pays in ${yearName}`}
      bodyClassName="p-0"
      action={
        <div className="flex gap-2">
          {columns.length > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => setFullScreen(true)}
                title="View fee structure full screen"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Full Screen</span>
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={printChart}>
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            </>
          )}
          {addMenu}
        </div>
      }
    >
      <Dialog open={fullScreen} onOpenChange={setFullScreen}>
        <DialogContent className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none sm:p-0">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-4 py-3 pr-14 text-left sm:px-6">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base sm:text-lg">
                Class Fee Structure
              </DialogTitle>
              <DialogDescription className="truncate text-xs">
                {school.name} · Academic Year {yearName}
              </DialogDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 gap-1.5"
              onClick={printChart}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-surface">
            {summaryStrip}
            <div className="overflow-x-auto">{chartTable}</div>
            {columns.some((c) => c.group.frequency === "One-Time") && (
              <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                Per Year includes one-time fees, which only new students pay.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {!columns.length ? (
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {BILLING_GROUPS.map((g) => {
            const Icon = GROUP_ICON[g.frequency];
            return (
              <button
                key={g.frequency}
                type="button"
                onClick={() => onAdd(g.frequency)}
                className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    GROUP_TONE[g.frequency],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    Add {g.title.replace(/s$/, "").toLowerCase()}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {g.examples}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          {summaryStrip}

          <p className="flex items-center justify-end gap-1 border-b border-border px-3 py-1.5 text-[10px] font-medium text-muted-foreground md:hidden">
            Swipe to see all fees <ChevronRight className="h-3 w-3" />
          </p>
          <div className="overflow-x-auto">{chartTable}</div>
          {columns.some((c) => c.group.frequency === "One-Time") && (
            <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              Per Year includes one-time fees, which only new students pay.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}

/** Fee Structure tab: one section per way a fee is charged, billing, and the full fee-head list. */
export function FeeStructureTab() {
  const school = useSchoolBranding();
  const { data: years } = useAcademicYears();
  const { data: classes } = useClasses();
  const { data: structures } = useFeeStructures();
  const queryClient = useQueryClient();
  const [yearId, setYearId] = useState("");
  const [classWise, setClassWise] = useState<{
    head: string | null;
    frequency: BillingFrequency;
  } | null>(null);
  const [generating, setGenerating] = useState(false);

  const year =
    (years ?? []).find((y) => y.id === yearId) ??
    (years ?? []).find((y) => y.status === "ACTIVE") ??
    years?.[0];
  const months = useMemo(() => academicMonths(year), [year]);
  const terms = useMemo(() => academicTerms(months, year?.name ?? ""), [months, year?.name]);

  const yearClasses = useMemo(
    () =>
      (classes ?? [])
        .filter((c) => c.academic_year_id === year?.id && c.status === "ACTIVE")
        .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.section, b.section)),
    [classes, year?.id],
  );
  const yearStructures = useMemo(
    () => (structures ?? []).filter((s) => s.academic_year_id === year?.id),
    [structures, year?.id],
  );
  const billable = useMemo(
    () => yearStructures.filter((s) => isActive(s) && isBillable(s)),
    [yearStructures],
  );
  const timesPerYear = (frequency: BillingFrequency) =>
    frequency === "Monthly" ? months.length : frequency === "Term" ? terms.length : 1;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
    await queryClient.invalidateQueries({ queryKey: ["fees"] });
  }

  if (years && years.length === 0) {
    return (
      <SectionCard title="Fee Structure">
        <EmptyState
          title="No academic year yet"
          description="Create and activate an academic year first; fee structures are set per session."
          icon={CalendarRange}
        />
      </SectionCard>
    );
  }
  if (!year) return null;

  const span = months.length
    ? `${months[0]?.short} ${months[0]?.key.slice(0, 4)} – ${months.at(-1)?.short} ${months.at(-1)?.key.slice(0, 4)} · ${months.length} months`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={year.id} onValueChange={setYearId}>
          <SelectTrigger className="h-9 w-44 bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(years ?? []).map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
                {y.status === "ACTIVE" ? " (current)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {span && <span className="text-xs text-muted-foreground">{span}</span>}
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Button
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={!billable.length}
            onClick={() => setGenerating(true)}
          >
            <ReceiptText className="h-4 w-4" /> Generate Fees
          </Button>
        </div>
      </div>

      {!yearClasses.length ? (
        <SectionCard title="Class Fees">
          <EmptyState
            title="No classes in this session"
            description="Add classes for this academic year to set their fees."
            icon={Layers}
          />
        </SectionCard>
      ) : (
        <ClassFeesCard
          yearName={year.name}
          school={school}
          classes={yearClasses}
          billable={billable}
          timesPerYear={timesPerYear}
          onEditHead={(head, frequency) => setClassWise({ head, frequency })}
          onAdd={(frequency) => setClassWise({ head: null, frequency })}
        />
      )}

      <Dialog open={classWise !== null} onOpenChange={(open) => !open && setClassWise(null)}>
        {classWise !== null && (
          <ClassWiseFeesDialog
            key={`${classWise.frequency}:${classWise.head ?? "new"}`}
            head={classWise.head}
            headFrequency={classWise.head ? classWise.frequency : null}
            defaultFrequency={classWise.frequency}
            year={year}
            months={months}
            terms={terms}
            classes={yearClasses}
            billable={billable}
            onDone={async () => {
              setClassWise(null);
              await refresh();
            }}
          />
        )}
      </Dialog>
      <Dialog open={generating} onOpenChange={setGenerating}>
        {generating && (
          <GenerateFeesDialog
            year={year}
            months={months}
            terms={terms}
            classes={yearClasses}
            billable={billable}
            onDone={async () => {
              setGenerating(false);
              await refresh();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
