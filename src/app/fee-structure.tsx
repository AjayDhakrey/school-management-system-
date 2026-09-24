import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Layers, Pencil, Plus, ReceiptText, Trash2, Wallet } from "lucide-react";
import { EmptyState } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
  billingMonthOf,
  dueDayOf,
  monthlyDueDate,
  ordinal,
  DEFAULT_DUE_DAY,
  FEE_CATEGORIES,
  FEE_FREQUENCIES,
  type BillingMonth,
} from "@/lib/fees";

const ALL = "__all__";
const DUE_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
// Rows per bulk insert; each batch is written atomically.
const BILL_BATCH = 500;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const rupees = (n: number) => `₹${n.toLocaleString()}`;
const className = (c: Pick<ApiClass, "name" | "section">) =>
  c.section ? `${c.name}-${c.section}` : c.name;
const isActive = (s: ApiFeeStructure) => (s.status ?? "ACTIVE") === "ACTIVE";
const isMonthly = (s: ApiFeeStructure) => s.frequency === "Monthly";
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

function DueDaySelect({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="bg-surface">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {DUE_DAYS.map((d) => (
          <SelectItem key={d} value={String(d)}>
            {ordinal(d)} of every month
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One fee head with any frequency; monthly heads get a due day instead of a date. */
function FeeHeadDialog({
  initial,
  year,
  months,
  classes,
  onDone,
}: {
  initial: ApiFeeStructure | null;
  year: ApiAcademicYear;
  months: BillingMonth[];
  classes: ApiClass[];
  onDone: () => void;
}) {
  const [feeType, setFeeType] = useState(initial?.fee_type ?? "");
  const [category, setCategory] = useState(initial?.category ?? "Tuition");
  const [frequency, setFrequency] = useState(initial?.frequency ?? "Monthly");
  const [classId, setClassId] = useState(initial?.class_id ?? ALL);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [dueDay, setDueDay] = useState(initial ? dueDayOf(initial) : DEFAULT_DUE_DAY);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [submitting, setSubmitting] = useState(false);
  const monthly = frequency === "Monthly";
  const firstMonth = months[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!feeType.trim() || !(value > 0)) {
      toast.error("Fee head and an amount above ₹0 are required");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        feeType: feeType.trim(),
        category,
        frequency,
        amount: value,
        classId: classId === ALL ? null : classId,
        dueDate: monthly
          ? firstMonth
            ? monthlyDueDate(firstMonth.key, dueDay)
            : null
          : dueDate || null,
      };
      if (initial) await api.patch(`/fee-structures/${initial.id}`, body);
      else await api.post("/fee-structures", { ...body, academicYearId: year.id });
      toast.success(initial ? "Fee head updated" : "Fee head added");
      onDone();
    } catch (err) {
      toast.error(errorText(err, "Failed to save fee head"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit Fee Head" : "Add Fee Head"}</DialogTitle>
        <DialogDescription>
          {year.name} · monthly heads are billed every month of the session.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="feeHead">Fee Head</Label>
          <Input
            id="feeHead"
            value={feeType}
            onChange={(e) => {
              setFeeType(e.target.value);
              if (!initial) setCategory(guessCategory(e.target.value));
            }}
            placeholder="e.g. Tuition Fee"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEE_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Applies To</Label>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="feeAmount">{monthly ? "Amount per month (₹)" : "Amount (₹)"}</Label>
            <Input
              id="feeAmount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1500"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="feeDue">{monthly ? "Due Every Month On" : "Due Date"}</Label>
            {monthly ? (
              <DueDaySelect value={dueDay} onChange={setDueDay} />
            ) : (
              <Input
                id="feeDue"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : initial ? "Save Changes" : "Add Fee Head"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Sets one monthly fee head per standard and applies it to every section in that standard. */
function ClassWiseFeesDialog({
  head,
  year,
  months,
  classes,
  monthly,
  onDone,
}: {
  /** Existing head being edited; a new head when null. */
  head: string | null;
  year: ApiAcademicYear;
  months: BillingMonth[];
  classes: ApiClass[];
  /** Active monthly structures of this year. */
  monthly: ApiFeeStructure[];
  onDone: () => void;
}) {
  const [feeType, setFeeType] = useState(head ?? "");
  const headRows = monthly.filter((s) => s.class_id && sameHead(s.fee_type, feeType));
  const sample = headRows[0];
  const [category, setCategory] = useState(sample?.category ?? guessCategory(head ?? ""));
  const [dueDay, setDueDay] = useState(sample ? dueDayOf(sample) : DEFAULT_DUE_DAY);
  // Only what the user typed; untouched classes show the saved amount.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [fillAll, setFillAll] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const allClasses = monthly.find((s) => !s.class_id && sameHead(s.fee_type, feeType));

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
  const dueDate = firstMonth ? monthlyDueDate(firstMonth.key, dueDay) : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const name = feeType.trim();
    if (!name) {
      toast.error("Enter a fee head name");
      return;
    }
    const jobs: Promise<unknown>[] = [];
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
          jobs.push(api.patch(`/fee-structures/${existing.id}`, { status: "INACTIVE" }));
        } else if (existing) {
          const changed =
            existing.amount !== value ||
            dueDayOf(existing) !== dueDay ||
            existing.category !== category;
          if (changed) {
            jobs.push(
              api.patch(`/fee-structures/${existing.id}`, { amount: value, dueDate, category }),
            );
          }
        } else if (value > 0) {
          jobs.push(
            api.post("/fee-structures", {
              feeType: name,
              category,
              frequency: "Monthly",
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

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{head ? `Class-wise ${head}` : "Set Class-wise Monthly Fee"}</DialogTitle>
        <DialogDescription>
          Set one monthly amount per standard in {year.name}. It automatically applies to every
          section in that standard.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSave} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="classWiseHead">Fee Head</Label>
            <Input
              id="classWiseHead"
              value={feeType}
              disabled={Boolean(head)}
              onChange={(e) => {
                setFeeType(e.target.value);
                setCategory(guessCategory(e.target.value));
              }}
              placeholder="e.g. Tuition Fee"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Due Date</Label>
            <DueDaySelect value={dueDay} onChange={setDueDay} />
          </div>
        </div>

        <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/40 p-2.5">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="fillAll" className="text-xs">
              Same amount for every standard (₹)
            </Label>
            <Input
              id="fillAll"
              type="number"
              min={0}
              value={fillAll}
              onChange={(e) => setFillAll(e.target.value)}
              placeholder="1500"
              className="h-8 bg-surface"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fillAll === ""}
            onClick={() => setEdits(Object.fromEntries(standards.map((s) => [s.key, fillAll])))}
          >
            Apply to all
          </Button>
        </div>

        {allClasses && (
          <p className="rounded-lg bg-gold-soft/40 px-3 py-2 text-xs text-muted-foreground">
            An "All Classes" {allClasses.fee_type} of {rupees(allClasses.amount)}/month also
            applies; class amounts here are charged on top of it.
          </p>
        )}

        <div className="scrollbar-slim max-h-[42vh] overflow-y-auto rounded-xl border border-border">
          {standards.map((standard) => (
            <div
              key={standard.key}
              className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0"
            >
              <span className="flex-1 text-sm font-medium">
                {standard.name}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  ({standard.classes.length} section{standard.classes.length === 1 ? "" : "s"})
                </span>
              </span>
              <div className="relative w-36">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                  ₹
                </span>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label={`Monthly amount for ${standard.name}, applied to all sections`}
                  value={shownAmount(standard)}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [standard.key]: e.target.value }))
                  }
                  placeholder="0"
                  className="h-8 bg-surface pr-12 pl-6 text-right"
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-muted-foreground">
                  /month
                </span>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save Monthly Fees"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Bills every active student their monthly dues for one month (or the whole session). */
function GenerateFeesDialog({
  year,
  months,
  classes,
  monthly,
  onDone,
}: {
  year: ApiAcademicYear;
  months: BillingMonth[];
  classes: ApiClass[];
  monthly: ApiFeeStructure[];
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

  const plan = useMemo(() => {
    const targetMonths = monthKey === ALL ? months : months.filter((m) => m.key === monthKey);
    const keyForLabel = new Map(months.map((m) => [m.label, m.key]));
    // A fee counts as billed for a month by its stored month label, or failing that its due date.
    const billed = new Set<string>();
    for (const f of fees ?? []) {
      if (!f.fee_structure_id) continue;
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
    const billedStudents = new Set<string>();
    let skipped = 0;
    let total = 0;
    for (const s of students ?? []) {
      const enrolled =
        s.academic_year_id === year.id &&
        (s.status ?? "Active").toLowerCase() === "active" &&
        s.class_id !== null &&
        yearClassIds.has(s.class_id) &&
        (classId === ALL || s.class_id === classId);
      if (!enrolled) continue;
      for (const structure of monthly) {
        if (structure.class_id && structure.class_id !== s.class_id) continue;
        for (const m of targetMonths) {
          if (billed.has(`${structure.id}|${s.id}|${m.key}`)) {
            skipped += 1;
            continue;
          }
          items.push({
            studentId: s.id,
            feeStructureId: structure.id,
            amount: structure.amount,
            dueDate: monthlyDueDate(m.key, dueDayOf(structure)),
            description: m.label,
          });
          billedStudents.add(s.id);
          total += structure.amount;
        }
      }
    }
    return { items, skipped, total, students: billedStudents.size, months: targetMonths };
  }, [students, fees, monthly, months, classes, monthKey, classId, year.id]);

  const periodLabel =
    monthKey === ALL
      ? `${year.name} (all ${months.length} months)`
      : (months.find((m) => m.key === monthKey)?.label ?? "");

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
      toast.success(`Billed ${created} monthly dues for ${periodLabel}`);
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
        <DialogTitle>Generate Monthly Fees</DialogTitle>
        <DialogDescription>
          Creates each active student's monthly dues from the fee structure. Anything already billed
          for that month is skipped, so it's safe to run again.
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
        {plan.skipped > 0 && (
          <p className="text-xs text-muted-foreground">
            {plan.skipped} due{plan.skipped === 1 ? " is" : "s are"} already billed and will be
            skipped.
          </p>
        )}
        {!plan.items.length && !plan.skipped && (
          <p className="text-xs text-muted-foreground">
            No active students in this selection have a monthly fee to bill.
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

/** Fee Structure tab: class-wise monthly fees, monthly billing, and the full fee-head list. */
export function FeeStructureTab() {
  const { data: years } = useAcademicYears();
  const { data: classes } = useClasses();
  const { data: structures } = useFeeStructures();
  const queryClient = useQueryClient();
  const [yearId, setYearId] = useState("");
  const [editing, setEditing] = useState<ApiFeeStructure | "new" | null>(null);
  const [classWise, setClassWise] = useState<{ head: string | null } | null>(null);
  const [generating, setGenerating] = useState(false);

  const year =
    (years ?? []).find((y) => y.id === yearId) ??
    (years ?? []).find((y) => y.status === "ACTIVE") ??
    years?.[0];
  const months = useMemo(() => academicMonths(year), [year]);

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
  const monthly = useMemo(
    () => yearStructures.filter((s) => isActive(s) && isMonthly(s)),
    [yearStructures],
  );
  const heads = useMemo(
    () =>
      Array.from(new Map(monthly.map((s) => [s.fee_type.toLowerCase(), s.fee_type])).values()).sort(
        collator.compare,
      ),
    [monthly],
  );

  const matrix = yearClasses.map((c) => {
    const perHead = heads.map((head) =>
      monthly
        .filter((s) => sameHead(s.fee_type, head) && (!s.class_id || s.class_id === c.id))
        .reduce((sum, s) => sum + s.amount, 0),
    );
    return { cls: c, perHead, total: perHead.reduce((a, b) => a + b, 0) };
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
    await queryClient.invalidateQueries({ queryKey: ["fees"] });
  }

  async function remove(s: ApiFeeStructure) {
    try {
      await api.delete(`/fee-structures/${s.id}`);
      toast.success("Fee head removed");
      await refresh();
    } catch (err) {
      toast.error(errorText(err, "Failed to remove fee head"));
    }
  }

  async function setStatus(s: ApiFeeStructure, status: "ACTIVE" | "INACTIVE") {
    try {
      await api.patch(`/fee-structures/${s.id}`, { status });
      toast.success(status === "ACTIVE" ? "Fee head reactivated" : "Fee head deactivated");
      await refresh();
    } catch (err) {
      toast.error(errorText(err, "Failed to update fee head"));
    }
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
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => setClassWise({ head: null })}
          >
            <Layers className="h-4 w-4" /> Set Class-wise Fee
          </Button>
          <Button
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={!monthly.length}
            onClick={() => setGenerating(true)}
          >
            <ReceiptText className="h-4 w-4" /> Generate Monthly Fees
          </Button>
        </div>
      </div>

      <SectionCard
        title="Monthly Fee Structure"
        subtitle={`What each class pays every month in ${year.name}`}
        bodyClassName="p-0"
      >
        {!yearClasses.length ? (
          <EmptyState
            title="No classes in this session"
            description="Add classes for this academic year to set their monthly fees."
            icon={Layers}
          />
        ) : !heads.length ? (
          <EmptyState
            title="No monthly fees yet"
            description="Use “Set Class-wise Fee” to add a monthly fee such as Tuition Fee for every class."
            icon={Wallet}
            action={
              <Button size="sm" onClick={() => setClassWise({ head: null })}>
                <Plus className="h-4 w-4" /> Set Class-wise Fee
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Class</th>
                  {heads.map((head) => (
                    <th key={head} className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setClassWise({ head })}
                        className="inline-flex items-center gap-1 rounded-md hover:text-foreground"
                        title={`Edit ${head} for all classes`}
                      >
                        {head}
                        <Pencil className="h-3 w-3" />
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                    Per Month
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Per Year</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map(({ cls, perHead, total }) => (
                  <tr key={cls.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{className(cls)}</td>
                    {perHead.map((amount, i) => (
                      <td
                        key={heads[i]}
                        className="px-4 py-2.5 text-right font-mono whitespace-nowrap text-muted-foreground"
                      >
                        {amount ? rupees(amount) : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap">
                      {total ? rupees(total) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap text-muted-foreground">
                      {total ? rupees(total * months.length) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="All Fee Heads"
        subtitle="Monthly, quarterly, term, annual and one-time charges"
        bodyClassName="p-0"
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add Fee Head
          </Button>
        }
      >
        {!yearStructures.length ? (
          <EmptyState
            title="No fee heads configured"
            description="Add a fee head to start billing students."
            icon={Wallet}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Fee Head</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Frequency</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Applies To</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Due</th>
                  <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Amount</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {yearStructures.map((s) => {
                  const cls = s.class_id ? yearClasses.find((c) => c.id === s.class_id) : null;
                  const active = isActive(s);
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-border/60 hover:bg-muted/30 ${active ? "" : "opacity-60"}`}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <p className="font-medium">{s.fee_type}</p>
                        <p className="text-[11px] text-muted-foreground">{s.category ?? "—"}</p>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                        {s.frequency ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                        {s.class_id ? (cls ? className(cls) : "—") : "All Classes"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                        {isMonthly(s) ? `${ordinal(dueDayOf(s))} monthly` : (s.due_date ?? "—")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium whitespace-nowrap">
                        {rupees(s.amount)}
                        {isMonthly(s) && (
                          <span className="text-[11px] text-muted-foreground">/mo</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusBadge
                          status={active ? "Active" : "Inactive"}
                          tone={active ? "success" : "neutral"}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setStatus(s, active ? "INACTIVE" : "ACTIVE")}
                          >
                            {active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={`Edit ${s.fee_type}`}
                            onClick={() => setEditing(s)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            aria-label={`Delete ${s.fee_type}`}
                            onClick={() => remove(s)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing !== null && (
          <FeeHeadDialog
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            year={year}
            months={months}
            classes={yearClasses}
            onDone={async () => {
              setEditing(null);
              await refresh();
            }}
          />
        )}
      </Dialog>
      <Dialog open={classWise !== null} onOpenChange={(open) => !open && setClassWise(null)}>
        {classWise !== null && (
          <ClassWiseFeesDialog
            key={classWise.head ?? "new"}
            head={classWise.head}
            year={year}
            months={months}
            classes={yearClasses}
            monthly={monthly}
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
            classes={yearClasses}
            monthly={monthly}
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
