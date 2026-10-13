"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  EmptyState,
  SearchInput,
  FilterSelect,
  Initials,
  Pager,
  usePaged,
} from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Wallet,
  Layers,
  BarChart3,
  Percent,
  Clock3,
  AlertOctagon,
  CalendarCheck2,
  Eye,
  Receipt,
  Printer,
  Plus,
  CheckCircle2,
  CreditCard,
  Users,
  Pencil,
} from "lucide-react";
import {
  useFees,
  useStudents,
  useClasses,
  useFeeStructures,
  useFinancialSettings,
  type ApiFee,
  type ApiStudent,
  type PaymentMethod,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import {
  billingMonthOf,
  billingTermOf,
  displayFeeName,
  feeName,
  feeTitle,
  sortStudentFees,
  isAnnualFee,
  ONE_TIME_LABEL,
  type FeeKind,
} from "@/lib/fees";
import { FeeStructureTab } from "@/app/fee-structure";
import {
  BILLING_GROUPS,
  GROUP_ACCENT,
  GROUP_BAND,
  GROUP_ICON,
  GROUP_TONE,
  type BillingFrequency,
} from "@/lib/fee-groups";
import { cn } from "@/lib/utils";
import { escapeHtml, printHtml } from "@/lib/print";
import { printFeeStatement, printPaymentSlip } from "@/lib/fee-statement";
import { useSchoolBranding } from "@/hooks/use-school-branding";

const NONE = "__none__";
const STATUS_OPTIONS = ["Pending", "Paid", "Overdue", "Partial"];
const OTHER_FEE = "__other__";
const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Cheque",
  "Online",
];

// The stored `status` column only ever becomes 'Paid'/'Partial' (set when a payment is
// collected) or stays 'Pending' — nothing ever writes 'Overdue' onto it. The backend already
// computes the real, date-aware status as `calculated_status`; use that everywhere so overdue
// dues actually show up instead of silently staying "Pending" forever.
function effectiveStatus(f: ApiFee) {
  return f.calculated_status ?? f.status;
}

function payable(f: ApiFee) {
  return Math.max(0, f.amount - f.discount + f.fine);
}

function amountInWords(n: number) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  function chunk(num: number): string {
    if (num === 0) return "";
    if (num < 10) return ones[num]!;
    if (num < 20) return teens[num - 10]!;
    if (num < 100) return `${tens[Math.floor(num / 10)]} ${ones[num % 10]}`.trim();
    return `${ones[Math.floor(num / 100)]} Hundred ${chunk(num % 100)}`.trim();
  }
  const rupees = Math.floor(n);
  const thousands = Math.floor(rupees / 1000);
  const rest = rupees % 1000;
  let text = "";
  if (thousands) text += `${chunk(thousands)} Thousand `;
  text += chunk(rest);
  text = text.trim() || "Zero";
  return `${text} Rupees Only`;
}

/** Bills a fee record to any student. */
function AddFeeDialog({
  defaultStudentId,
  onDone,
}: {
  defaultStudentId?: string | undefined;
  onDone: () => void;
}) {
  const { data: students } = useStudents();
  const { data: classes } = useClasses();
  const { data: structures } = useFeeStructures();
  const [classId, setClassId] = useState(NONE);
  const [studentId, setStudentId] = useState(defaultStudentId ?? "");
  const [feeHeadSelection, setFeeHeadSelection] = useState("");
  const [feeType, setFeeType] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  });
  const [submitting, setSubmitting] = useState(false);

  // When opened for a specific student, preselect their class/section too
  useEffect(() => {
    if (defaultStudentId) {
      setStudentId(defaultStudentId);
      setClassId(students?.find((s) => s.id === defaultStudentId)?.class_id ?? NONE);
    } else {
      setStudentId("");
      setClassId(NONE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultStudentId]);

  const classStudents = useMemo(
    () =>
      classId === NONE ? (students ?? []) : (students ?? []).filter((s) => s.class_id === classId),
    [students, classId],
  );

  function handleClassChange(value: string) {
    setClassId(value);
    setStudentId((prev) => {
      if (!prev) return prev;
      const student = students?.find((s) => s.id === prev);
      const stillValid = value === NONE || student?.class_id === value;
      return stillValid ? prev : "";
    });
  }

  // Selecting a standard fee head fills its name + amount in (still freely editable); switching to
  // "Other / Custom Fee" clears the name so the custom-name field starts blank, but leaves amount as
  // typed since a custom fee still needs an amount either way.
  function handleFeeHeadSelect(value: string) {
    setFeeHeadSelection(value);
    if (value === OTHER_FEE) {
      setFeeType("");
      return;
    }
    setFeeType(value);
    const found = structures?.find((s) => s.fee_type === value);
    if (found) setAmount(String(found.amount));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId || !feeType.trim() || !amount) {
      toast.error("Student, fee head and amount are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/fees", {
        studentId,
        feeType: feeType.trim(),
        amount: Number(amount),
        dueDate: dueDate || null,
      });
      toast.success("Fee billed to student successfully");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to bill fee");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Bill a Student Fee</DialogTitle>
        <DialogDescription>Creates a new fee record for an enrolled student.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Class & Section</Label>
          <Select value={classId} onValueChange={handleClassChange}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All Classes</SelectItem>
              {(classes ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}-{c.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>
            Select Student ({classStudents.length} {classId === NONE ? "Enrolled" : "in this Class"}
            )
          </Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Choose a student" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {classStudents.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No students in this class & section.
                </div>
              )}
              {classStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {s.class_name ?? "—"}
                  {s.section ? `-${s.section}` : ""}
                  {s.admission_no ? ` (${s.admission_no})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Fee Head</Label>
          <Select value={feeHeadSelection} onValueChange={handleFeeHeadSelect}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select a fee head" />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set((structures ?? []).map((s) => s.fee_type))).map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_FEE}>Other / Custom Fee</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {feeHeadSelection === OTHER_FEE && (
          <div className="grid gap-1.5">
            <Label htmlFor="customFeeName">Custom Fee Name</Label>
            <Input
              id="customFeeName"
              autoFocus
              value={feeType}
              onChange={(e) => setFeeType(e.target.value)}
              placeholder="e.g. Late Admission Fee, Sports Fee"
            />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input
              id="amount"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="12000"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Billing…" : "Bill Fee"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Collects full or partial payment and marks a fee record accordingly. */
function CollectPaymentDialog({
  fee,
  studentName,
  classLabel,
  admissionNo,
  onSaved,
  onDone,
}: {
  fee: ApiFee;
  studentName: string;
  classLabel?: string;
  admissionNo?: string;
  /** Called right after the payment is stored, so lists refresh while the slip is shown. */
  onSaved?: () => void | Promise<void>;
  /** Close the dialog. */
  onDone: () => void;
}) {
  const school = useSchoolBranding();
  const [recorded, setRecorded] = useState<{
    receiptNo: string;
    amount: number;
    paidOn: string;
    method: string;
    reference: string | null;
    collectedBy: string | null;
    paidBefore: number;
    balance: number;
  } | null>(null);
  const total = payable(fee);
  const alreadyPaid = fee.paid_amount ?? 0;
  const remaining = Math.max(0, total - alreadyPaid);

  const { data: financialSettings } = useFinancialSettings();
  const paymentMethods = financialSettings?.accepted_payment_methods ?? DEFAULT_PAYMENT_METHODS;

  const [paymentType, setPaymentType] = useState<"full" | "partial">(
    remaining > 0 ? "full" : "full",
  );
  const [partialAmount, setPartialAmount] = useState("");
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Stable for the dialog's lifetime: a double-click or retried request reuses the same
  // key so the backend dedupes it into a single payment instead of collecting it twice.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const effectiveAmount =
    paymentType === "full" ? remaining : Math.min(Number(partialAmount) || 0, remaining);
  const newTotalPaid = alreadyPaid + effectiveAmount;
  const willBeFullyPaid = newTotalPaid >= total;

  async function handleCollect(e: React.FormEvent) {
    e.preventDefault();
    if (effectiveAmount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setSubmitting(true);
    try {
      const payment = await api.post<{
        receipt_no?: string;
        amount?: number;
        paid_on?: string;
        collected_by_name?: string | null;
      } | null>(`/fees/${fee.id}/pay`, {
        payAmount: effectiveAmount,
        paymentDate: paidDate,
        method,
        transactionReference: reference.trim() || null,
        idempotencyKey,
      });
      const label = willBeFullyPaid ? "full payment" : "partial payment";
      toast.success(`₹${effectiveAmount.toLocaleString()} ${label} recorded for ${studentName}`);
      const amount = Number(payment?.amount) || effectiveAmount;
      setRecorded({
        receiptNo: payment?.receipt_no ?? "—",
        amount,
        paidOn: paidDate || (payment?.paid_on ?? "").slice(0, 10),
        method,
        reference: reference.trim() || null,
        collectedBy: payment?.collected_by_name ?? null,
        paidBefore: alreadyPaid,
        balance: Math.max(0, total - alreadyPaid - amount),
      });
      await onSaved?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  if (recorded) {
    const printSlip = () =>
      printPaymentSlip(school, {
        receiptNo: recorded.receiptNo,
        paidOn: recorded.paidOn,
        studentName,
        classLabel: classLabel ?? "",
        admissionNo: admissionNo ?? "",
        feeLabel: feeTitle(fee),
        dueDate: fee.due_date,
        amount: fee.amount,
        discount: fee.discount,
        fine: fee.fine,
        netPayable: total,
        paidBefore: recorded.paidBefore,
        paidNow: recorded.amount,
        balance: recorded.balance,
        amountInWords: amountInWords(recorded.amount),
        method: recorded.method,
        reference: recorded.reference,
        collectedBy: recorded.collectedBy,
      });
    return (
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center text-center">
          <span className="mb-1 grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <DialogTitle>Payment recorded</DialogTitle>
          <DialogDescription>
            {studentName} · {feeTitle(fee)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-muted/30 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Amount received
            </p>
            <p className="font-display text-3xl font-bold text-success tabular-nums">
              ₹{recorded.amount.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {recorded.method}
              {recorded.reference ? ` · Ref ${recorded.reference}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm">
            <div className="bg-card px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Receipt no.
              </p>
              <p className="truncate font-mono font-semibold">{recorded.receiptNo}</p>
            </div>
            <div className="bg-card px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Balance left
              </p>
              <p
                className={`font-semibold ${recorded.balance ? "text-destructive" : "text-success"}`}
              >
                {recorded.balance ? `₹${recorded.balance.toLocaleString()}` : "Fully paid"}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid sm:space-x-0">
          <Button variant="outline" className="h-10" onClick={onDone}>
            Done
          </Button>
          <Button className="h-10 gap-1.5" onClick={printSlip}>
            <Printer className="h-4 w-4" /> Print Payment Slip
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Record Fee Payment</DialogTitle>
        <DialogDescription>
          Record a full or partial fee payment and generate a receipt.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleCollect} className="space-y-4">
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-sm space-y-1.5 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Student:</span>
            <span className="font-medium truncate min-w-0">{studentName}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Fee Head:</span>
            <span className="font-medium truncate min-w-0">{feeTitle(fee)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Total Fee:</span>
            <span className="shrink-0">₹{fee.amount.toLocaleString()}</span>
          </div>
          {fee.discount > 0 && (
            <div className="flex items-center justify-between gap-2 text-success">
              <span className="shrink-0">Discount:</span>
              <span className="shrink-0">-₹{fee.discount.toLocaleString()}</span>
            </div>
          )}
          {fee.fine > 0 && (
            <div className="flex items-center justify-between gap-2 text-destructive">
              <span className="shrink-0">Fine:</span>
              <span className="shrink-0">+₹{fee.fine.toLocaleString()}</span>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Net Payable:</span>
            <span className="font-medium shrink-0">₹{total.toLocaleString()}</span>
          </div>
          {alreadyPaid > 0 && (
            <div className="flex items-center justify-between gap-2 text-success">
              <span className="shrink-0">Already Paid:</span>
              <span className="shrink-0">-₹{alreadyPaid.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 font-semibold text-base pt-1">
            <span className="shrink-0">Remaining Balance:</span>
            <span className="text-primary shrink-0">₹{remaining.toLocaleString()}</span>
          </div>
        </div>

        {/* Payment type toggle */}
        <div className="grid gap-2">
          <Label>Payment Type</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant={paymentType === "full" ? "default" : "outline"}
              className="flex-1 gap-1.5 text-xs sm:text-sm"
              onClick={() => setPaymentType("full")}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="truncate">Pay Full (₹{remaining.toLocaleString()})</span>
            </Button>
            <Button
              type="button"
              variant={paymentType === "partial" ? "default" : "outline"}
              className="flex-1 gap-1.5 text-xs sm:text-sm"
              onClick={() => setPaymentType("partial")}
            >
              <CreditCard className="h-4 w-4 shrink-0" />
              Partial Payment
            </Button>
          </div>
        </div>

        {paymentType === "partial" && (
          <div className="grid gap-1.5">
            <Label htmlFor="partialAmount">Payment Amount (₹)</Label>
            <Input
              id="partialAmount"
              type="number"
              min={1}
              max={remaining}
              step="0.01"
              value={partialAmount}
              onChange={(e) => setPartialAmount(e.target.value)}
              placeholder={`Enter amount (max ₹${remaining.toLocaleString()})`}
            />
            {Number(partialAmount) > 0 && Number(partialAmount) < remaining && (
              <p className="text-xs text-muted-foreground">
                After this payment, remaining balance will be ₹
                {(remaining - Number(partialAmount)).toLocaleString()}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="paidDate">Payment Date</Label>
            <Input
              id="paidDate"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="method">Payment Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger id="method" className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="reference">Transaction / Reference No. (optional)</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="UPI ref, cheque no, transaction id…"
          />
          <p className="text-[11px] text-muted-foreground">
            The receipt number is generated automatically once the payment is recorded.
          </p>
        </div>

        {/* Summary */}
        {effectiveAmount > 0 && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 font-semibold">
              <span className="shrink-0">Collecting:</span>
              <span className="text-primary shrink-0">₹{effectiveAmount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs mt-1">
              <span className="shrink-0">New status:</span>
              <span
                className={`shrink-0 ${willBeFullyPaid ? "text-success font-medium" : "text-warning font-medium"}`}
              >
                {willBeFullyPaid ? "Fully Paid" : "Partially Paid"}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="submit" disabled={submitting || effectiveAmount <= 0} className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            {submitting
              ? "Saving…"
              : willBeFullyPaid
                ? "Mark as Fully Paid"
                : `Record ₹${effectiveAmount.toLocaleString()} Payment`}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

const DISCOUNT_PRESETS = [5, 10, 15, 20, 25, 50];

/**
 * Discount input that takes either rupees or a percentage of the fee. It always reports the
 * discount in rupees (what is saved); percentages are worked out from `base`.
 */
function DiscountField({
  id,
  base,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  /** The fee amount a percentage is taken of. */
  base: number;
  /** Discount in rupees, as typed. */
  value: string;
  onChange: (rupees: string) => void;
  autoFocus?: boolean;
}) {
  const [mode, setMode] = useState<"amount" | "percent">("amount");
  const [percent, setPercent] = useState("");
  const toRupees = (p: string) => (p === "" ? "" : String(Math.round((base * Number(p)) / 100)));

  // Keep a percentage discount in step when the chosen fee (and so its amount) changes.
  useEffect(() => {
    if (mode === "percent") onChange(toRupees(percent));
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickPercent = (p: string) => {
    setMode("percent");
    setPercent(p);
    onChange(toRupees(p));
  };
  const rupees = Number(value || 0);
  const shownPercent = base > 0 ? Math.round((rupees / base) * 1000) / 10 : 0;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>Discount</Label>
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
          {(["amount", "percent"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (m === mode) return;
                setMode(m);
                if (m === "percent") setPercent(value ? String(shownPercent) : "");
              }}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                mode === m ? "bg-card text-primary shadow-sm" : "text-muted-foreground",
              )}
            >
              {m === "amount" ? "₹ Amount" : "% Percent"}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={0}
          max={mode === "percent" ? 100 : undefined}
          step={mode === "percent" ? "0.1" : "1"}
          value={mode === "percent" ? percent : value}
          onChange={(e) =>
            mode === "percent" ? pickPercent(e.target.value) : onChange(e.target.value)
          }
          placeholder={mode === "percent" ? "10" : "500"}
          autoFocus={autoFocus}
          className="pr-20"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-muted-foreground tabular-nums">
          {mode === "percent"
            ? `= ${rupee(rupees)}`
            : base > 0 && rupees > 0
              ? `${shownPercent}%`
              : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DISCOUNT_PRESETS.map((p) => {
          const active = mode === "percent" && Number(percent) === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => pickPercent(String(p))}
              disabled={base <= 0}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-40",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground/80 hover:border-primary/40 hover:text-primary",
              )}
            >
              {p}%
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Adjusts the discount on an unpaid fee record. */
function ApplyDiscountDialog({
  fees,
  students,
  classes,
  studentName,
  onDone,
}: {
  fees: (ApiFee & { studentName: string })[];
  students: ApiStudent[];
  /** Active classes; only these are offered (bare numbers like "9" from old data are skipped). */
  classes: { name: string }[];
  studentName: (id: string) => string;
  onDone: () => void;
}) {
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [studentId, setStudentId] = useState("all");
  const [feeId, setFeeId] = useState("");
  const [discount, setDiscount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const byId = new Map(students.map((st) => [st.id, st]));
  const classOptions = Array.from(
    new Set(classes.map((c) => c.name.trim()).filter((name) => name && !/^\d+$/.test(name))),
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const sectionOptions =
    classFilter === "all"
      ? []
      : Array.from(
          new Set(
            students
              .filter((st) => st.class_name === classFilter)
              .map((st) => st.section)
              .filter((sec): sec is string => Boolean(sec)),
          ),
        ).sort();
  const inScope = (st: ApiStudent | undefined) =>
    Boolean(st) &&
    (classFilter === "all" || st!.class_name === classFilter) &&
    (sectionFilter === "all" || st!.section === sectionFilter);
  const studentOptions = students
    .filter((st) => inScope(st))
    .sort((a, b) => a.name.localeCompare(b.name));
  const unpaid = sortStudentFees(
    fees.filter(
      (f) =>
        f.status !== "Paid" &&
        (studentId === "all" ? inScope(byId.get(f.student_id)) : f.student_id === studentId),
    ),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feeId || !discount) {
      toast.error("Select a fee record and enter a discount amount");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/fees/${feeId}`, { discount: Number(discount) });
      toast.success("Discount applied");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to apply discount");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Apply Discount</DialogTitle>
        <DialogDescription>
          Pick a class, section and student, then the unpaid fee to discount.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="grid min-w-0 gap-1.5">
            <Label>Class</Label>
            <Select
              value={classFilter}
              onValueChange={(v) => {
                setClassFilter(v);
                setSectionFilter("all");
                setStudentId("all");
                setFeeId("");
              }}
            >
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="all">All classes</SelectItem>
                {classOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label>Section</Label>
            <Select
              value={sectionFilter}
              disabled={classFilter === "all"}
              onValueChange={(v) => {
                setSectionFilter(v);
                setStudentId("all");
                setFeeId("");
              }}
            >
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="all">All sections</SelectItem>
                {sectionOptions.map((sec) => (
                  <SelectItem key={sec} value={sec}>
                    Section {sec}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Student</Label>
          <Select
            value={studentId}
            onValueChange={(v) => {
              setStudentId(v);
              setFeeId("");
            }}
          >
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="All students" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="all">All students ({studentOptions.length})</SelectItem>
              {studentOptions.map((st) => (
                <SelectItem key={st.id} value={st.id}>
                  {st.name}
                  {st.roll ? ` · Roll ${st.roll}` : ""}
                  {classFilter === "all" && st.class_name
                    ? ` · ${st.class_name}${st.section ? `-${st.section}` : ""}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Fee Record</Label>
          <Select value={feeId} onValueChange={setFeeId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select an unpaid fee" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {unpaid.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No unpaid fee records.
                </div>
              )}
              {unpaid.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {studentId === "all" ? `${studentName(f.student_id)} · ` : ""}
                  {feeTitle(f)} · ₹{f.amount.toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DiscountField
          id="discount"
          base={unpaid.find((f) => f.id === feeId)?.amount ?? 0}
          value={discount}
          onChange={setDiscount}
        />
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Applying…" : "Apply Discount"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Changes (or removes) the discount already given on a fee record. */
function EditDiscountDialog({ fee, onDone }: { fee: EnrichedFee; onDone: () => void }) {
  const [discount, setDiscount] = useState(String(fee.discount));
  const [submitting, setSubmitting] = useState(false);
  const paid = paidOn(fee);
  // The discount can never bring the bill below what has already been paid.
  const maxDiscount = Math.max(0, fee.amount + fee.fine - paid);
  const value = Number(discount || 0);
  const newPayable = Math.max(0, fee.amount - value + fee.fine);

  async function save(next: number) {
    if (!Number.isFinite(next) || next < 0) {
      toast.error("Enter a valid discount amount");
      return;
    }
    if (next > maxDiscount) {
      toast.error(`Discount can be at most ${rupee(maxDiscount)}`);
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/fees/${fee.id}`, { discount: next });
      toast.success(next ? "Discount updated" : "Discount removed");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update discount");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Discount</DialogTitle>
        <DialogDescription>
          {fee.studentName} · {feeTitle(fee)}
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(value);
        }}
        className="grid gap-3"
      >
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border text-center">
          {[
            { label: "Fee", value: rupee(fee.amount + fee.fine) },
            { label: "Paid", value: rupee(paid) },
            { label: "New total", value: rupee(newPayable) },
          ].map((stat) => (
            <div key={stat.label} className="bg-card px-2 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p className="text-sm font-bold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-1.5">
          <DiscountField
            id="edit-discount"
            base={fee.amount}
            value={discount}
            onChange={setDiscount}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Up to {rupee(maxDiscount)}. Balance after discount:{" "}
            <span className="font-semibold text-foreground">
              {rupee(Math.max(0, newPayable - paid))}
            </span>
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="text-destructive"
            disabled={submitting || fee.discount === 0}
            onClick={() => void save(0)}
          >
            Remove discount
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save Discount"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function FeeReceipt({
  fee,
  studentName,
  className,
  admissionNo,
}: {
  fee: ApiFee;
  studentName: string;
  className: string;
  admissionNo?: string;
}) {
  const school = useSchoolBranding();
  const total = payable(fee);
  const paid = Math.min(fee.paid_amount ?? (fee.status === "Paid" ? total : 0), total);
  const balance = Math.max(0, total - paid);
  const receiptNo = fee.receipt_no ?? `RCPT-${fee.id.slice(0, 8).toUpperCase()}`;
  const paidOn = (fee.paid_on ?? fee.due_date ?? "").slice(0, 10);
  const contact = [school.phone, school.email].filter(Boolean).join(" · ");

  function print() {
    printPaymentSlip(school, {
      receiptNo,
      paidOn,
      studentName,
      classLabel: className,
      admissionNo: admissionNo ?? "",
      feeLabel: feeTitle(fee),
      dueDate: fee.due_date,
      amount: fee.amount,
      discount: fee.discount,
      fine: fee.fine,
      netPayable: total,
      paidBefore: 0,
      paidNow: paid,
      balance,
      amountInWords: amountInWords(paid),
      method: "",
      reference: null,
      collectedBy: null,
    });
  }

  const line = (label: string, value: string, tone = "") => (
    <div className={cn("flex items-center justify-between gap-3 px-3 py-2 text-sm", tone)}>
      <span>{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="max-h-[75vh] overflow-y-auto">
      <div className="overflow-hidden rounded-2xl border-2 border-primary/25 bg-card">
        <div className="bg-primary/[0.06] px-5 py-4 text-center">
          <p className="font-display text-lg font-bold capitalize text-primary">{school.name}</p>
          {school.address && <p className="text-xs text-muted-foreground">{school.address}</p>}
          {contact && <p className="text-xs text-muted-foreground">{contact}</p>}
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-primary-foreground">
              Payment Receipt
            </span>
            <div className="text-right text-xs">
              <p className="text-muted-foreground">
                Receipt No.{" "}
                <span className="font-mono font-semibold text-foreground">{receiptNo}</span>
              </p>
              <p className="text-muted-foreground">
                Date <span className="font-semibold text-foreground">{readableDate(paidOn)}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-muted/40 p-3 text-sm">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Student
              </p>
              <p className="truncate font-semibold capitalize">{studentName}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Class
              </p>
              <p className="truncate font-semibold capitalize">{className || "—"}</p>
            </div>
            {admissionNo && (
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Admission No.
                </p>
                <p className="truncate font-mono text-[13px] font-semibold">{admissionNo}</p>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Due date
              </p>
              <p className="truncate font-semibold">{readableDate(fee.due_date)}</p>
            </div>
            <div className="col-span-2 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Fee
              </p>
              <p className="truncate font-semibold capitalize">{feeTitle(fee)}</p>
            </div>
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {line("Fee amount", rupee(fee.amount))}
            {fee.discount > 0 &&
              line("Discount / scholarship", `− ${rupee(fee.discount)}`, "text-success")}
            {fee.fine > 0 && line("Late fine", `+ ${rupee(fee.fine)}`, "text-destructive")}
            {line("Net payable", rupee(total))}
            <div className="flex items-center justify-between gap-3 bg-success-soft/60 px-3 py-2.5 text-success">
              <span className="text-sm font-semibold">Amount paid</span>
              <span className="font-display text-lg font-bold tabular-nums">{rupee(paid)}</span>
            </div>
            {line(
              "Balance remaining",
              balance ? rupee(balance) : "Nil",
              balance ? "font-semibold text-destructive" : "font-semibold",
            )}
          </div>

          <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs">
            <span className="text-muted-foreground">Amount in words: </span>
            <span className="font-semibold">{amountInWords(paid)}</span>
          </p>

          <div className="flex items-end justify-between pt-2">
            <span
              className={cn(
                "-rotate-6 rounded-md border-2 px-3 py-1 text-sm font-extrabold tracking-[0.2em]",
                balance ? "border-warning text-warning" : "border-success text-success",
              )}
            >
              {balance ? "PART PAID" : "PAID"}
            </span>
            <span className="min-w-40 border-t border-border pt-1 text-center text-xs text-muted-foreground">
              Authorised Signatory
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button className="h-10 gap-1.5" onClick={print}>
          <Printer className="h-4 w-4" /> Print Receipt
        </Button>
      </div>
    </div>
  );
}

type EnrichedFee = ApiFee & { studentName: string; className: string; admissionNo: string };

const rupee = (n: number) => `₹${n.toLocaleString()}`;

/** "2026-09-10" → "10 Sep 2026". */
function readableDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type PeriodKind = "month" | "term" | "year" | "once";
/** Same colours as the fee structure chart: monthly blue, term gold, yearly green, one-time sky. */
const PERIOD_TONE: Record<PeriodKind, string> = {
  month: "bg-primary/10 text-primary",
  term: "bg-gold-soft text-gold-foreground",
  year: "bg-success-soft text-success",
  once: "bg-info-soft text-info",
};

/** Whole days an overdue fee is past its due date (0 when it isn't overdue). */
function daysLate(f: ApiFee, today: string) {
  if (effectiveStatus(f) !== "Overdue" || !f.due_date || f.due_date >= today) return 0;
  return Math.round((new Date(today).getTime() - new Date(f.due_date).getTime()) / 86_400_000);
}

/** Which billing period a generated fee covers, for the coloured chip under its name. */
function feePeriod(f: ApiFee): { kind: PeriodKind; label: string } | null {
  if (f.description === ONE_TIME_LABEL) return { kind: "once", label: "One-time" };
  if (isAnnualFee(f)) return { kind: "year", label: f.description! };
  const term = billingTermOf(f);
  if (term) return { kind: "term", label: term };
  const month = billingMonthOf(f);
  if (month) return { kind: "month", label: month };
  return null;
}

function FeesTable({
  rows,
  summaryRows,
  onCollect,
  onEditDiscount,
}: {
  rows: EnrichedFee[];
  /** Every record matching the filters (not just this page), for the summary strip. */
  summaryRows?: EnrichedFee[];
  onCollect?: (fee: EnrichedFee) => void;
  /** Shows an Edit discount button on each row. */
  onEditDiscount?: (fee: EnrichedFee) => void;
}) {
  const [viewing, setViewing] = useState<EnrichedFee | null>(null);
  const [receiptFor, setReceiptFor] = useState<EnrichedFee | null>(null);

  const all = summaryRows ?? rows;
  const billed = all.reduce((sum, f) => sum + payable(f), 0);
  const collected = all.reduce((sum, f) => sum + Math.min(f.paid_amount ?? 0, payable(f)), 0);
  const overdueCount = all.filter((f) => effectiveStatus(f) === "Overdue").length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
        {[
          { label: "Records", value: all.length.toLocaleString(), tone: "" },
          { label: "Billed", value: rupee(billed), tone: "" },
          { label: "Collected", value: rupee(collected), tone: "text-success" },
          {
            label: "Outstanding",
            value: rupee(Math.max(0, billed - collected)),
            tone: billed - collected > 0 ? "text-destructive" : "text-success",
            note: overdueCount ? `${overdueCount.toLocaleString()} overdue` : undefined,
          },
        ].map((stat) => (
          <div key={stat.label} className="min-w-0 bg-card px-3 py-2.5 sm:px-4">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <p className={cn("truncate font-display text-base font-bold tabular-nums", stat.tone)}>
              {stat.value}
            </p>
            {"note" in stat && stat.note && (
              <p className="truncate text-[10px] font-medium text-destructive">{stat.note}</p>
            )}
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No fee records found" icon={Wallet} />
      ) : (
        <>
          {/* Phones: one card per bill. */}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 p-3 md:hidden">
            {rows.map((f) => {
              const status = effectiveStatus(f);
              const due = payable(f);
              const paid = f.paid_amount ?? 0;
              const period = feePeriod(f);
              const lateDays = daysLate(f, today);
              return (
                <li
                  key={f.id}
                  className={cn(
                    "min-w-0 overflow-hidden rounded-2xl border bg-card p-3 shadow-sm",
                    status === "Overdue" ? "border-destructive/25" : "border-border",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <Initials name={f.studentName} className="h-9 w-9 text-[11px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold capitalize">{f.studentName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        <span className="capitalize">{f.className}</span>
                        {f.admissionNo ? ` · ${f.admissionNo}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="font-display text-base font-bold leading-tight">{rupee(due)}</p>
                      {due !== f.amount && (
                        <p className="text-[10px] text-muted-foreground line-through">
                          {rupee(f.amount)}
                        </p>
                      )}
                      {paid > 0 && paid < due && (
                        <p className="text-[10px] font-medium text-success">Paid {rupee(paid)}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/50 px-2.5 py-2">
                    <span className="min-w-0 truncate text-xs font-medium capitalize">
                      {feeName(f)}
                    </span>
                    {period && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          PERIOD_TONE[period.kind],
                        )}
                      >
                        {period.label}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">
                        Due{" "}
                        <span className="font-medium text-foreground/80">
                          {readableDate(f.due_date)}
                        </span>
                      </p>
                      {lateDays > 0 && (
                        <p className="text-[10px] font-semibold text-destructive">
                          {lateDays} day{lateDays === 1 ? "" : "s"} late
                        </p>
                      )}
                    </div>
                    <StatusBadge status={status} />
                  </div>

                  <div className="mt-2.5 flex gap-2">
                    {f.status !== "Paid" && onCollect && (
                      <Button size="sm" className="h-9 flex-1 gap-1.5" onClick={() => onCollect(f)}>
                        <CreditCard className="h-4 w-4" /> Collect
                      </Button>
                    )}
                    {onEditDiscount && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 flex-1 gap-1.5"
                        onClick={() => onEditDiscount(f)}
                      >
                        <Pencil className="h-4 w-4" /> Discount
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 flex-1 gap-1.5"
                      onClick={() => setViewing(f)}
                    >
                      <Eye className="h-4 w-4" /> View
                    </Button>
                    {f.status === "Paid" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 flex-1 gap-1.5 text-success"
                        onClick={() => setReceiptFor(f)}
                      >
                        <Receipt className="h-4 w-4" /> Receipt
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Tablets & desktop: the table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-muted px-3 py-2.5 sm:px-4">Student</th>
                  <th className="px-3 py-2.5 sm:px-4">Fee</th>
                  <th className="px-3 py-2.5 text-right sm:px-4">Amount</th>
                  <th className="px-3 py-2.5 sm:px-4">Due</th>
                  <th className="px-3 py-2.5 sm:px-4">Status</th>
                  <th className="px-3 py-2.5 text-right sm:px-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const status = effectiveStatus(f);
                  const due = payable(f);
                  const paid = f.paid_amount ?? 0;
                  const period = feePeriod(f);
                  const lateDays = daysLate(f, today);
                  return (
                    <tr
                      key={f.id}
                      className={cn(
                        "group/row border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40",
                        status === "Overdue" && "bg-destructive/[0.025]",
                      )}
                    >
                      <td className="sticky left-0 z-10 bg-card px-3 py-2.5 group-hover/row:bg-muted sm:px-4">
                        <div className="flex min-w-[170px] items-center gap-2.5">
                          <Initials name={f.studentName} className="h-8 w-8 text-[11px]" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold capitalize">{f.studentName}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              <span className="capitalize">{f.className}</span>
                              {f.admissionNo ? ` · ${f.admissionNo}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap sm:px-4">
                        <p className="font-medium capitalize">{feeName(f)}</p>
                        {period && (
                          <span
                            className={cn(
                              "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              PERIOD_TONE[period.kind],
                            )}
                          >
                            {period.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums sm:px-4">
                        <p className="font-semibold">{rupee(due)}</p>
                        {due !== f.amount && (
                          <p className="text-[10px] text-muted-foreground line-through">
                            {rupee(f.amount)}
                          </p>
                        )}
                        {paid > 0 && paid < due && (
                          <p className="text-[10px] font-medium text-success">Paid {rupee(paid)}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap sm:px-4">
                        <p className="text-foreground/80">{readableDate(f.due_date)}</p>
                        {lateDays > 0 && (
                          <p className="text-[10px] font-semibold text-destructive">
                            {lateDays} day{lateDays === 1 ? "" : "s"} late
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap sm:px-4">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap sm:px-4">
                        <div className="flex items-center justify-end gap-1">
                          {f.status !== "Paid" && onCollect && (
                            <Button
                              size="sm"
                              className="h-8 gap-1 px-2.5 text-xs"
                              onClick={() => onCollect(f)}
                            >
                              <CreditCard className="h-3.5 w-3.5" /> Collect
                            </Button>
                          )}
                          {onEditDiscount && (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              title="Edit discount"
                              aria-label={`Edit discount for ${f.studentName}`}
                              onClick={() => onEditDiscount(f)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            title="View details"
                            aria-label={`View fee details for ${f.studentName}`}
                            onClick={() => setViewing(f)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {f.status === "Paid" && (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-success"
                              title="Receipt"
                              aria-label={`Receipt for ${f.studentName}`}
                              onClick={() => setReceiptFor(f)}
                            >
                              <Receipt className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fee Details</DialogTitle>
            <DialogDescription>Detailed ledger breakdown for this fee record.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Student</p>
                  <p className="font-medium">{viewing.studentName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Class</p>
                  <p className="font-medium">{viewing.className}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fee Head</p>
                  <p className="font-medium">{feeTitle(viewing)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-medium">{readableDate(viewing.due_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-medium font-mono">₹{viewing.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payable</p>
                  <p className="font-semibold text-primary font-mono">
                    ₹{payable(viewing).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Discount</p>
                  <p className="text-success font-mono">-₹{viewing.discount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge status={effectiveStatus(viewing)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="w-full gap-1.5" onClick={() => setReceiptFor(viewing)}>
                  <Receipt className="h-4 w-4" /> View Full Receipt
                </Button>
                {viewing.status !== "Paid" && onCollect && (
                  <Button
                    variant="secondary"
                    className="w-full gap-1.5"
                    onClick={() => {
                      const target = viewing;
                      setViewing(null);
                      onCollect(target);
                    }}
                  >
                    <CreditCard className="h-4 w-4" /> Collect Payment
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiptFor} onOpenChange={(o) => !o && setReceiptFor(null)}>
        <DialogContent className="max-w-lg print:max-w-none">
          <DialogHeader>
            <DialogTitle>Fee Receipt</DialogTitle>
          </DialogHeader>
          {receiptFor && (
            <FeeReceipt
              fee={receiptFor}
              studentName={receiptFor.studentName}
              className={receiptFor.className}
              admissionNo={receiptFor.admissionNo}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type RecordGroup = BillingFrequency | "Other";
const RECORD_GROUPS: RecordGroup[] = [...BILLING_GROUPS.map((g) => g.frequency), "Other"];
const KIND_GROUP: Record<PeriodKind, BillingFrequency> = {
  month: "Monthly",
  term: "Term",
  year: "Annual",
  once: "One-Time",
};
/** Which fee-chart group (Monthly / Term / Yearly / One-Time) a bill belongs to; hand-made bills are "Other". */
const recordGroupOf = (f: ApiFee): RecordGroup => {
  const period = feePeriod(f);
  return period ? KIND_GROUP[period.kind] : "Other";
};
const GROUP_KIND: Record<RecordGroup, FeeKind | null> = {
  Monthly: "month",
  Term: "term",
  Annual: "year",
  "One-Time": "once",
  Other: null,
};
const groupLabel = (g: RecordGroup) =>
  g === "Other"
    ? "Other"
    : (BILLING_GROUPS.find((b) => b.frequency === g)?.title.replace(/ Fees$/, "") ?? g);
const paidOn = (f: ApiFee) =>
  Math.min(f.paid_amount ?? (f.status === "Paid" ? payable(f) : 0), payable(f));

/** "September 2026" → "Sep ’26". */
const shortMonth = (label: string) => {
  const [month = "", year = ""] = label.split(" ");
  return `${month.slice(0, 3)} ’${year.slice(-2)}`;
};

/** One state for a group of bills: all paid, some paid, nothing paid yet, or late. */
function standingOf(list: ApiFee[]) {
  const billed = list.reduce((sum, f) => sum + payable(f), 0);
  const paid = list.reduce((sum, f) => sum + paidOn(f), 0);
  const due = Math.max(0, billed - paid);
  const overdue = list.some((f) => effectiveStatus(f) === "Overdue" && paidOn(f) < payable(f));
  const status = due === 0 ? "Paid" : overdue ? "Overdue" : paid > 0 ? "Partial" : "Pending";
  return { billed, paid, due, overdue, status };
}

const STANDING_STYLE: Record<string, { card: string; dot: string; label: string }> = {
  Paid: { card: "border-success/30 bg-success-soft/40", dot: "bg-success", label: "Paid" },
  Partial: { card: "border-warning/30 bg-warning-soft/40", dot: "bg-warning", label: "Part-paid" },
  Pending: { card: "border-border bg-card", dot: "bg-muted-foreground/40", label: "Due" },
  Overdue: {
    card: "border-destructive/30 bg-destructive-soft/40",
    dot: "bg-destructive",
    label: "Overdue",
  },
};

/** Full picture of one student's fees: totals, a month-by-month grid, and every other bill. */
function StudentFeeOverview({
  student,
  fees,
  onClose,
  onCollect,
}: {
  student: ApiStudent | null;
  fees: EnrichedFee[];
  onClose: () => void;
  onCollect: (fee: EnrichedFee) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const school = useSchoolBranding();
  const own = useMemo(
    () =>
      student
        ? fees
            .filter((f) => f.student_id === student.id)
            .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
        : [],
    [fees, student],
  );
  const totals = standingOf(own);
  const percent = totals.billed ? Math.round((totals.paid / totals.billed) * 100) : 0;

  // Monthly bills grouped by the month they cover ("September 2026"), in date order.
  const months = useMemo(() => {
    const map = new Map<string, EnrichedFee[]>();
    for (const f of own) {
      const month = billingMonthOf(f);
      if (!month) continue;
      map.set(month, [...(map.get(month) ?? []), f]);
    }
    return Array.from(map, ([label, list]) => ({ label, list, ...standingOf(list) }));
  }, [own]);
  const monthsPaid = months.filter((m) => m.status === "Paid").length;
  const monthsOverdue = months.filter((m) => m.status === "Overdue").length;
  const monthsPending = months.length - monthsPaid - monthsOverdue;

  const billRow = (f: EnrichedFee) => {
    const status = effectiveStatus(f);
    const period = feePeriod(f);
    const late =
      status === "Overdue" && f.due_date && f.due_date < today
        ? Math.round((new Date(today).getTime() - new Date(f.due_date).getTime()) / 86_400_000)
        : 0;
    return (
      <li key={f.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[13px] font-semibold capitalize sm:text-sm">{feeName(f)}</p>
            <p className="shrink-0 font-display text-sm font-bold tabular-nums">
              {rupee(payable(f))}
            </p>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              {period && (
                <span
                  className={cn(
                    "inline-block max-w-full truncate rounded-full px-1.5 py-px text-[10px] font-semibold align-middle",
                    PERIOD_TONE[period.kind],
                  )}
                >
                  {period.label}
                </span>
              )}
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">
                <span
                  className={cn(
                    "font-semibold",
                    status === "Overdue"
                      ? "text-destructive"
                      : status === "Partial"
                        ? "text-warning"
                        : "text-foreground/70",
                  )}
                >
                  {late > 0 ? `${late}d late` : status}
                </span>
                {" · "}Due {readableDate(f.due_date)}
              </p>
            </div>
            {f.status !== "Paid" ? (
              <Button
                size="sm"
                className="h-7 shrink-0 gap-1 rounded-full px-3 text-[11px]"
                onClick={() => onCollect(f)}
              >
                <CreditCard className="h-3.5 w-3.5" /> Collect
              </Button>
            ) : (
              <span className="shrink-0 text-xs font-semibold text-success">✓ Paid</span>
            )}
          </div>
        </div>
      </li>
    );
  };

  const unpaid = sortStudentFees(own.filter((f) => f.status !== "Paid"));

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[94dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-t-[28px] max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 sm:p-0">
        <span
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden"
        />
        {student && (
          <>
            <DialogHeader className="flex-row items-center gap-2.5 space-y-0 px-4 py-3 pr-11 text-left sm:border-b sm:border-border sm:gap-3 sm:px-5 sm:py-4 sm:pr-12">
              <Initials
                name={student.name}
                className="h-10 w-10 text-xs sm:h-12 sm:w-12 sm:text-sm"
              />
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-base capitalize sm:text-lg">
                  {student.name}
                </DialogTitle>
                <DialogDescription className="truncate text-xs">
                  <span className="capitalize">
                    {student.class_name ?? "—"}
                    {student.section ? `-${student.section}` : ""}
                  </span>
                  {student.roll ? ` · Roll ${student.roll}` : ""}
                  {student.admission_no ? ` · ${student.admission_no}` : ""}
                </DialogDescription>
              </div>
              {own.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 shrink-0 gap-1.5 px-0 sm:w-auto sm:px-3"
                  title="Print statement"
                  onClick={() => printFeeStatement(school, student, own)}
                >
                  <Printer className="h-4 w-4" />
                  <span className="hidden sm:inline">Print statement</span>
                </Button>
              )}
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3.5 py-3.5 sm:space-y-5 sm:px-5 sm:py-4">
              {/* Totals: amount due up front, then billed / paid / progress. */}
              <section className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Amount due
                    </p>
                    <p className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
                      {rupee(totals.due)}
                    </p>
                  </div>
                  <p className="shrink-0 pt-1 text-xs font-semibold text-muted-foreground">
                    {percent}% paid
                  </p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/60"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Billed
                    </p>
                    <p className="font-semibold tabular-nums">{rupee(totals.billed)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Paid
                    </p>
                    <p className="font-semibold tabular-nums">{rupee(totals.paid)}</p>
                  </div>
                </div>
                {months.length > 0 && (
                  <p className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
                    <b className="text-foreground">{monthsPaid}</b> months paid ·{" "}
                    <b className="text-foreground">{monthsPending}</b> due ·{" "}
                    <b className="text-foreground">{monthsOverdue}</b> overdue
                  </p>
                )}
              </section>

              {!own.length && (
                <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  No fees billed to this student yet.
                </div>
              )}

              {/* Month by month */}
              {months.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <CalendarCheck2 className="h-4 w-4 text-primary" /> Month by month
                  </h3>
                  <div className="-mx-3.5 flex snap-x gap-2.5 overflow-x-auto px-3.5 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6">
                    {months.map((m) => {
                      const [monthName = "", year = ""] = m.label.split(" ");
                      const pill =
                        m.status === "Paid"
                          ? {
                              text: "Paid",
                              icon: CheckCircle2,
                              cls: "bg-success-soft text-success",
                            }
                          : m.status === "Overdue"
                            ? {
                                text: "Overdue",
                                icon: AlertOctagon,
                                cls: "bg-destructive-soft text-destructive",
                              }
                            : m.status === "Partial"
                              ? {
                                  text: "Part-paid",
                                  icon: Clock3,
                                  cls: "bg-warning-soft text-warning",
                                }
                              : {
                                  text: "Due",
                                  icon: Clock3,
                                  cls: "bg-muted text-muted-foreground",
                                };
                      const PillIcon = pill.icon;
                      return (
                        <div
                          key={m.label}
                          title={m.list
                            .map((f) => `${feeName(f)}: ${rupee(payable(f))}`)
                            .join("\n")}
                          className="w-[104px] shrink-0 snap-start rounded-2xl border border-border bg-card p-2.5 shadow-sm sm:w-auto"
                        >
                          <div className="flex items-baseline justify-between gap-1">
                            <p className="text-sm font-bold uppercase tracking-wide">
                              {monthName.slice(0, 3)}
                            </p>
                            <p className="text-[10px] font-medium text-muted-foreground">{year}</p>
                          </div>
                          <p className="mt-1.5 font-display text-[15px] font-bold tabular-nums">
                            {rupee(m.due || m.billed)}
                          </p>
                          <span
                            className={cn(
                              "mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              pill.cls,
                            )}
                          >
                            <PillIcon className="h-3 w-3" />
                            {pill.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* What's still to pay */}
              {own.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Receipt className="h-4 w-4 text-primary" /> Still to pay
                    <span className="text-xs font-normal text-muted-foreground">
                      ({unpaid.length})
                    </span>
                  </h3>
                  {unpaid.length ? (
                    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                      {unpaid.map(billRow)}
                    </ul>
                  ) : (
                    <p className="flex items-center gap-2 rounded-2xl bg-success-soft/50 px-4 py-3 text-sm font-medium text-success">
                      <CheckCircle2 className="h-4 w-4" /> All fees are paid — nothing due.
                    </p>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Stylesheet for the printed student fee records chart (landscape A4). */
const RECORDS_PRINT_CSS = `
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 10.5px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
    border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }
  h1 { font-size: 19px; margin: 0 0 3px; color: #1e3a8a; }
  header p { margin: 0; color: #475569; line-height: 1.5; }
  .title { text-align: right; }
  h2 { font-size: 15px; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .06em; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #cbd5e1; margin-bottom: 10px; }
  .stats div { padding: 6px 10px; border-left: 1px solid #cbd5e1; }
  .stats div:first-child { border-left: 0; }
  .stats span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .stats b { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 7px; }
  thead th { font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
  th.grp { font-size: 10.5px; color: #0f172a; text-align: center; }
  td.stu b { display: block; font-size: 11px; }
  td small, td.stu small { display: block; font-size: 9px; color: #64748b; font-weight: 400; }
  .stu { text-align: left; white-space: nowrap; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ctr { text-align: center; white-space: nowrap; }
  .edge { border-left: 2px solid #94a3b8; }
  .g-Monthly { background: #eff6ff; }
  .g-Term { background: #fef9e7; }
  .g-Annual { background: #ecfdf5; }
  .g-One-Time { background: #f0f9ff; }
  .g-Other { background: #f8fafc; }
  th.g-Monthly.grp { border-bottom: 2px solid #3b82f6; }
  th.g-Term.grp { border-bottom: 2px solid #d4a017; }
  th.g-Annual.grp { border-bottom: 2px solid #16a34a; }
  th.g-One-Time.grp { border-bottom: 2px solid #0ea5e9; }
  .total { background: #eef2ff; color: #1e3a8a; font-weight: 700; }
  .late { color: #dc2626; font-weight: 600; }
  .warn { color: #b45309; }
  .paid { color: #15803d; font-weight: 600; }
  .muted { color: #94a3b8; }
  tbody tr:nth-child(even) td.stu { background: #f8fafc; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  footer { display: flex; justify-content: space-between; margin-top: 8px; color: #64748b; font-size: 9px; }
`;

/**
 * Student fee records in the same chart layout as the Class Fee Structure: one row per student,
 * one column per fee grouped into coloured bands, and a balance column. A row opens to show that
 * student's individual bills with Collect buttons.
 */
function StudentFeeRecords({
  students,
  summaryStudents,
  fees,
  pager,
  onCollect,
}: {
  /** Students on this page. */
  students: ApiStudent[];
  /** Every student matching the search, for the summary strip. */
  summaryStudents: ApiStudent[];
  fees: EnrichedFee[];
  pager: ReactNode;
  onCollect: (fee: EnrichedFee) => void;
}) {
  const [selected, setSelected] = useState<ApiStudent | null>(null);
  const feesByStudent = useMemo(() => {
    const map = new Map<string, EnrichedFee[]>();
    for (const fee of fees) {
      const list = map.get(fee.student_id) ?? [];
      list.push(fee);
      map.set(fee.student_id, list);
    }
    return map;
  }, [fees]);

  const visibleFees = students.flatMap((st) => feesByStudent.get(st.id) ?? []);
  const columns = RECORD_GROUPS.flatMap((group) =>
    Array.from(
      new Map(
        visibleFees
          .filter((fee) => recordGroupOf(fee) === group)
          .map((fee) => [fee.fee_type.trim().toLowerCase(), fee.fee_type.trim()]),
      ).values(),
    )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((head) => ({ head, group })),
  );
  const groupsUsed = RECORD_GROUPS.filter((g) => columns.some((c) => c.group === g));
  const band = (g: RecordGroup) => (g === "Other" ? "bg-muted/40" : GROUP_BAND[g]);
  const edge = (i: number) => i === 0 || columns[i - 1]!.group !== columns[i]!.group;

  const summaryFees = summaryStudents.flatMap((st) => feesByStudent.get(st.id) ?? []);
  const billed = summaryFees.reduce((sum, fee) => sum + payable(fee), 0);
  const collected = summaryFees.reduce((sum, fee) => sum + paidOn(fee), 0);

  const school = useSchoolBranding();

  /** Prints every student matching the filters (all pages) as a landscape fee chart. */
  function printRecords() {
    const list = summaryStudents;
    const listFees = list.flatMap((st) => feesByStudent.get(st.id) ?? []);
    const cols = RECORD_GROUPS.flatMap((group) =>
      Array.from(
        new Map(
          listFees
            .filter((fee) => recordGroupOf(fee) === group)
            .map((fee) => [fee.fee_type.trim().toLowerCase(), fee.fee_type.trim()]),
        ).values(),
      )
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((head) => ({ head, group })),
    );
    const used = RECORD_GROUPS.filter((g) => cols.some((col) => col.group === g));
    const isEdge = (i: number) => i === 0 || cols[i - 1]!.group !== cols[i]!.group;

    const groupRow = used
      .map(
        (g) =>
          `<th colspan="${cols.filter((col) => col.group === g).length}" class="grp g-${g}">${escapeHtml(groupLabel(g))}</th>`,
      )
      .join("");
    const headRow = cols
      .map(
        ({ head, group }, i) =>
          `<th class="num g-${group}${isEdge(i) ? " edge" : ""}">${escapeHtml(displayFeeName(head, GROUP_KIND[group]))}</th>`,
      )
      .join("");

    const body = list
      .map((st) => {
        const own = feesByStudent.get(st.id) ?? [];
        const totalBilled = own.reduce((sum, fee) => sum + payable(fee), 0);
        const totalPaid = own.reduce((sum, fee) => sum + paidOn(fee), 0);
        const balance = Math.max(0, totalBilled - totalPaid);
        const percent = totalBilled ? Math.round((totalPaid / totalBilled) * 100) : 0;
        const byMonth = new Map<string, EnrichedFee[]>();
        for (const fee of own) {
          const month = billingMonthOf(fee);
          if (month) byMonth.set(month, [...(byMonth.get(month) ?? []), fee]);
        }
        const unpaid = Array.from(byMonth).filter(([, l]) =>
          l.some((fee) => paidOn(fee) < payable(fee)),
        );
        const late = unpaid.filter(([, l]) =>
          l.some((fee) => paidOn(fee) < payable(fee) && effectiveStatus(fee) === "Overdue"),
        ).length;

        const cells = cols
          .map(({ head, group }, i) => {
            const cell = own.filter(
              (fee) =>
                recordGroupOf(fee) === group &&
                fee.fee_type.trim().toLowerCase() === head.toLowerCase(),
            );
            const billed = cell.reduce((sum, fee) => sum + payable(fee), 0);
            const due = Math.max(0, billed - cell.reduce((sum, fee) => sum + paidOn(fee), 0));
            const overdue = cell.some((fee) => effectiveStatus(fee) === "Overdue");
            const text = !billed ? "—" : due === 0 ? "Paid" : rupee(due);
            const cls = !billed ? "muted" : due === 0 ? "paid" : overdue ? "late" : "";
            return `<td class="num g-${group}${isEdge(i) ? " edge" : ""} ${cls}">${text}</td>`;
          })
          .join("");
        const monthsCell = !byMonth.size
          ? `<td class="ctr muted">—</td>`
          : unpaid.length === 0
            ? `<td class="ctr paid">All paid</td>`
            : `<td class="ctr ${late ? "late" : "warn"}"><b>${unpaid.length} month${unpaid.length === 1 ? "" : "s"}</b>${
                late ? `<small>${late} overdue</small>` : ""
              }</td>`;
        const balanceCell = !own.length
          ? `<td class="num total muted">No bills</td>`
          : balance === 0
            ? `<td class="num total paid">Cleared</td>`
            : `<td class="num total">${rupee(balance)}<small>${percent}% paid</small></td>`;
        const cls = `${st.class_name ?? "—"}${st.section ? `-${st.section}` : ""}`;
        return `<tr><td class="stu"><b>${escapeHtml(st.name)}</b><small>${escapeHtml(cls)}${
          st.roll ? ` · Roll ${st.roll}` : ""
        }</small></td>${cells}${monthsCell}${balanceCell}</tr>`;
      })
      .join("");

    const billedAll = listFees.reduce((sum, fee) => sum + payable(fee), 0);
    const collectedAll = listFees.reduce((sum, fee) => sum + paidOn(fee), 0);
    const printed = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const contact = [school.phone, school.email].filter(Boolean).map(escapeHtml).join(" · ");

    printHtml(
      "Student Fee Records",
      `<header>
        <div>
          <h1>${escapeHtml(school.name)}</h1>
          <p>${escapeHtml(school.address)}${contact ? `<br>${contact}` : ""}</p>
        </div>
        <div class="title">
          <h2>Student Fee Records</h2>
          <p>Session ${escapeHtml(school.session)} · Printed ${printed}</p>
        </div>
      </header>
      <div class="stats">
        <div><span>Students</span><b>${list.length.toLocaleString()}</b></div>
        <div><span>Billed</span><b>${rupee(billedAll)}</b></div>
        <div><span>Collected</span><b class="paid">${rupee(collectedAll)}</b></div>
        <div><span>Outstanding</span><b class="late">${rupee(Math.max(0, billedAll - collectedAll))}</b></div>
      </div>
      <table>
        <thead>
          <tr><th rowspan="2" class="stu">Student</th>${groupRow}<th rowspan="2" class="ctr">Months Unpaid</th><th rowspan="2" class="num total">Balance</th></tr>
          <tr>${headRow}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      <footer>
        <span>Amounts in fee columns are what is still due. Red = overdue.</span>
        <span>${list.length} student${list.length === 1 ? "" : "s"}</span>
      </footer>`,
      RECORDS_PRINT_CSS,
    );
  }

  return (
    <SectionCard
      title="Student Fee Records"
      subtitle="What each student still owes, fee by fee — use View for the full month-by-month overview"
      bodyClassName="p-0"
      action={
        summaryStudents.length > 0 ? (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={printRecords}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
        {[
          { label: "Students", value: summaryStudents.length.toLocaleString(), tone: "" },
          { label: "Billed", value: rupee(billed), tone: "" },
          { label: "Collected", value: rupee(collected), tone: "text-success" },
          {
            label: "Outstanding",
            value: rupee(Math.max(0, billed - collected)),
            tone: billed - collected > 0 ? "text-destructive" : "text-success",
          },
        ].map((stat) => (
          <div key={stat.label} className="min-w-0 bg-card px-4 py-2.5">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <p className={cn("truncate font-display text-base font-bold tabular-nums", stat.tone)}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {students.length === 0 ? (
        <EmptyState
          title="No matching students"
          description="Try another name or class."
          icon={Wallet}
        />
      ) : (
        <>
          {/* Phones: one card per student. */}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 p-3 md:hidden">
            {students.map((st) => {
              const own = feesByStudent.get(st.id) ?? [];
              const totalBilled = own.reduce((sum, fee) => sum + payable(fee), 0);
              const totalPaid = own.reduce((sum, fee) => sum + paidOn(fee), 0);
              const balance = Math.max(0, totalBilled - totalPaid);
              const percent = totalBilled ? Math.round((totalPaid / totalBilled) * 100) : 0;
              const months = new Map<string, EnrichedFee[]>();
              for (const fee of own) {
                const month = billingMonthOf(fee);
                if (month) months.set(month, [...(months.get(month) ?? []), fee]);
              }
              const unpaidMonths = Array.from(months).filter(([, list]) =>
                list.some((fee) => paidOn(fee) < payable(fee)),
              );
              const lateMonths = unpaidMonths.filter(([, list]) =>
                list.some(
                  (fee) => paidOn(fee) < payable(fee) && effectiveStatus(fee) === "Overdue",
                ),
              ).length;
              const chips = columns
                .map(({ head, group }) => {
                  const cell = own.filter(
                    (fee) =>
                      recordGroupOf(fee) === group &&
                      fee.fee_type.trim().toLowerCase() === head.toLowerCase(),
                  );
                  const billedHere = cell.reduce((sum, fee) => sum + payable(fee), 0);
                  const dueHere = Math.max(
                    0,
                    billedHere - cell.reduce((sum, fee) => sum + paidOn(fee), 0),
                  );
                  return {
                    key: group + head,
                    head,
                    label: displayFeeName(head, GROUP_KIND[group]),
                    billedHere,
                    dueHere,
                    late: cell.some((fee) => effectiveStatus(fee) === "Overdue"),
                  };
                })
                .filter((chip) => chip.billedHere > 0);
              return (
                <li
                  key={st.id}
                  className={cn(
                    "min-w-0 overflow-hidden rounded-2xl border bg-card p-3 shadow-sm",
                    lateMonths ? "border-destructive/25" : "border-border",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <Initials name={st.name} className="h-10 w-10 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold capitalize">{st.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        <span className="capitalize">
                          {st.class_name ?? "—"}
                          {st.section ? `-${st.section}` : ""}
                        </span>
                        {st.roll ? ` · Roll ${st.roll}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {!own.length ? (
                        <p className="text-xs text-muted-foreground">No bills</p>
                      ) : balance === 0 ? (
                        <p className="inline-flex items-center gap-1 text-sm font-bold text-success">
                          <CheckCircle2 className="h-4 w-4" /> Cleared
                        </p>
                      ) : (
                        <>
                          <p className="font-display text-base font-bold leading-tight text-primary tabular-nums">
                            {rupee(balance)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">due · {percent}% paid</p>
                        </>
                      )}
                    </div>
                  </div>

                  {own.length > 0 && (
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border">
                      <div
                        className={cn("h-full rounded-full", balance ? "bg-primary" : "bg-success")}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}

                  {chips.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {chips.map((chip) => (
                        <span
                          key={chip.key}
                          className={cn(
                            "inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-[11px]",
                            chip.dueHere === 0
                              ? "bg-success-soft text-success"
                              : chip.late
                                ? "bg-destructive-soft text-destructive"
                                : "bg-muted text-foreground/80",
                          )}
                        >
                          <span className="truncate capitalize opacity-80">{chip.label}</span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {chip.dueHere === 0 ? "✓" : rupee(chip.dueHere)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2">
                    {!months.size ? (
                      <span />
                    ) : unpaidMonths.length === 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" /> All months paid
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                          lateMonths
                            ? "bg-destructive-soft text-destructive"
                            : "bg-warning-soft text-warning",
                        )}
                      >
                        {unpaidMonths.length} month{unpaidMonths.length === 1 ? "" : "s"} unpaid
                        {lateMonths > 0 && (
                          <span className="font-medium">· {lateMonths} overdue</span>
                        )}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 shrink-0 gap-1.5"
                      onClick={() => setSelected(st)}
                    >
                      <Eye className="h-4 w-4" /> View
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Tablets & desktop: the chart. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-10 border-b-2 border-border bg-card px-3 py-2.5 text-left align-bottom text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:px-4 sm:py-3"
                  >
                    Student
                  </th>
                  {groupsUsed.map((g) => {
                    const Icon = g === "Other" ? Receipt : GROUP_ICON[g];
                    return (
                      <th
                        key={g}
                        colSpan={columns.filter((c) => c.group === g).length}
                        className={cn(
                          "border-b-2 border-l border-border px-2.5 py-1.5 text-left sm:px-3 sm:py-2",
                          band(g),
                          g === "Other" ? "border-b-border" : GROUP_ACCENT[g],
                        )}
                      >
                        <span className="flex items-center gap-1.5 whitespace-nowrap sm:gap-2">
                          <span
                            className={cn(
                              "grid h-6 w-6 shrink-0 place-items-center rounded-lg",
                              g === "Other" ? "bg-muted text-muted-foreground" : GROUP_TONE[g],
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-xs font-bold text-foreground">{groupLabel(g)}</span>
                        </span>
                      </th>
                    );
                  })}
                  <th
                    rowSpan={2}
                    className="border-b-2 border-l border-border bg-card px-3 py-2.5 text-center align-bottom text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap text-muted-foreground sm:px-4 sm:py-3"
                  >
                    Months Unpaid
                  </th>
                  <th
                    rowSpan={2}
                    className="border-b-2 border-l border-border bg-primary/[0.04] px-3 py-2.5 text-right align-bottom text-[11px] font-bold uppercase tracking-wider text-primary sm:px-4 sm:py-3"
                  >
                    Balance
                  </th>
                  <th rowSpan={2} className="border-b-2 border-border bg-card px-3 sm:px-4">
                    <span className="sr-only">View</span>
                  </th>
                </tr>
                <tr className="border-b-2 border-border">
                  {columns.map(({ head, group }, i) => (
                    <th
                      key={group + head}
                      className={cn(
                        "px-2.5 py-1.5 text-right text-xs font-semibold whitespace-nowrap capitalize text-foreground/80 sm:px-3 sm:py-2",
                        band(group),
                        edge(i) && "border-l border-border",
                      )}
                    >
                      {displayFeeName(head, GROUP_KIND[group])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((st) => {
                  const own = feesByStudent.get(st.id) ?? [];
                  const totalBilled = own.reduce((sum, fee) => sum + payable(fee), 0);
                  const totalPaid = own.reduce((sum, fee) => sum + paidOn(fee), 0);
                  const balance = Math.max(0, totalBilled - totalPaid);
                  const percent = totalBilled ? Math.round((totalPaid / totalBilled) * 100) : 0;
                  // Months whose monthly bills aren't fully paid yet, and how many of those are late.
                  const byMonth = new Map<string, EnrichedFee[]>();
                  for (const fee of own) {
                    const month = billingMonthOf(fee);
                    if (month) byMonth.set(month, [...(byMonth.get(month) ?? []), fee]);
                  }
                  const unpaidMonths = Array.from(byMonth)
                    .filter(([, list]) => list.some((fee) => paidOn(fee) < payable(fee)))
                    .map(([month, list]) => ({
                      month,
                      late: list.some(
                        (fee) => paidOn(fee) < payable(fee) && effectiveStatus(fee) === "Overdue",
                      ),
                    }));
                  const lateMonths = unpaidMonths.filter((m) => m.late).length;
                  return (
                    <tr
                      key={st.id}
                      className="group/row border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                    >
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 group-hover/row:bg-muted sm:px-4 sm:py-2.5">
                        <div className="flex min-w-[160px] items-center gap-2.5">
                          <Initials name={st.name} className="h-8 w-8 text-[11px]" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold capitalize">{st.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              <span className="capitalize">
                                {st.class_name ?? "—"}
                                {st.section ? `-${st.section}` : ""}
                              </span>
                              {st.roll ? ` · Roll ${st.roll}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      {columns.map(({ head, group }, i) => {
                        const cell = own.filter(
                          (fee) =>
                            recordGroupOf(fee) === group &&
                            fee.fee_type.trim().toLowerCase() === head.toLowerCase(),
                        );
                        const cellBilled = cell.reduce((sum, fee) => sum + payable(fee), 0);
                        const cellDue = Math.max(
                          0,
                          cellBilled - cell.reduce((sum, fee) => sum + paidOn(fee), 0),
                        );
                        const late = cell.some((fee) => effectiveStatus(fee) === "Overdue");
                        return (
                          <td
                            key={group + head}
                            title={
                              cellBilled
                                ? `${displayFeeName(head, GROUP_KIND[group])}: ${cell.length} bill${cell.length === 1 ? "" : "s"} · ${rupee(cellBilled)} billed · ${rupee(cellDue)} due`
                                : undefined
                            }
                            className={cn(
                              "px-2.5 py-2 text-right whitespace-nowrap tabular-nums sm:px-3 sm:py-2.5",
                              band(group),
                              edge(i) && "border-l border-border",
                            )}
                          >
                            {!cellBilled ? (
                              <span className="text-muted-foreground/50">—</span>
                            ) : cellDue === 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "font-semibold",
                                  late ? "text-destructive" : "text-foreground/85",
                                )}
                              >
                                {rupee(cellDue)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td
                        className="border-l border-border px-3 py-2 text-center whitespace-nowrap sm:px-4"
                        title={
                          unpaidMonths.length
                            ? `Unpaid: ${unpaidMonths.map((m) => m.month).join(", ")}`
                            : undefined
                        }
                      >
                        {!byMonth.size ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : unpaidMonths.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" /> All paid
                          </span>
                        ) : (
                          <>
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums",
                                lateMonths
                                  ? "bg-destructive-soft text-destructive"
                                  : "bg-warning-soft text-warning",
                              )}
                            >
                              {unpaidMonths.length} month{unpaidMonths.length === 1 ? "" : "s"}
                            </span>
                            {lateMonths > 0 && (
                              <p className="mt-0.5 text-[10px] font-semibold text-destructive">
                                {lateMonths} overdue
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="border-l border-border px-3 py-2 text-right whitespace-nowrap tabular-nums sm:px-4">
                        {!own.length ? (
                          <span className="text-xs text-muted-foreground">No bills</span>
                        ) : balance === 0 ? (
                          <span className="inline-flex items-center gap-1 font-display font-bold text-success">
                            <CheckCircle2 className="h-4 w-4" /> Cleared
                          </span>
                        ) : (
                          <>
                            <p className="font-display font-bold text-primary">{rupee(balance)}</p>
                            <p className="text-[10px] text-muted-foreground">{percent}% paid</p>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right sm:px-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                          aria-label={`View fee overview for ${st.name}`}
                          onClick={() => setSelected(st)}
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {pager}
      <StudentFeeOverview
        student={selected}
        fees={fees}
        onClose={() => setSelected(null)}
        onCollect={(fee) => {
          setSelected(null);
          onCollect(fee);
        }}
      />
    </SectionCard>
  );
}

export default function Page({
  tab = "collection",
}: {
  tab?: "structure" | "collection" | "pending" | "reports" | "discounts";
}) {
  const TAB_VALUE: Record<string, string> = {
    structure: "structure",
    collection: "records",
    pending: "records",
    reports: "reports",
    discounts: "discounts",
  };
  const { data: fees, isLoading } = useFees();
  const { data: students } = useStudents();
  const { data: classes } = useClasses();
  const queryClient = useQueryClient();

  const [addFeeOpen, setAddFeeOpen] = useState(false);
  const [billingStudentId, setBillingStudentId] = useState<string | undefined>(undefined);
  const [collectingFee, setCollectingFee] = useState<EnrichedFee | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<EnrichedFee | null>(null);
  const [recordsSearch, setRecordsSearch] = useState("");
  const [recordsClass, setRecordsClass] = useState("all");
  const [recordsSection, setRecordsSection] = useState("all");
  const [recordsStatus, setRecordsStatus] = useState("all");
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPageSize, setRecordsPageSize] = useState(10);

  const studentsById = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students]);

  const classNameFor = (studentId: string) => {
    const s = studentsById.get(studentId);
    if (!s) return "—";
    if (!s.class_name) return "—";
    return s.section ? `${s.class_name}-${s.section}` : s.class_name;
  };

  const studentNameFor = (studentId: string) =>
    studentsById.get(studentId)?.name ?? "Unknown Student";
  const studentAdmissionFor = (studentId: string) =>
    studentsById.get(studentId)?.admission_no ?? "";

  const enriched: EnrichedFee[] = useMemo(
    () =>
      (fees ?? []).map((f) => ({
        ...f,
        studentName: studentNameFor(f.student_id),
        className: classNameFor(f.student_id),
        admissionNo: studentAdmissionFor(f.student_id),
      })),
    [fees, students],
  );

  const classNames = useMemo(
    () => Array.from(new Set((classes ?? []).map((c) => c.name))).filter(Boolean),
    [classes],
  );

  // Where each student stands, for the payment-status filter.
  const recordStanding = useMemo(() => {
    const map = new Map<string, { billed: number; paid: number; overdue: boolean }>();
    for (const f of enriched) {
      const entry = map.get(f.student_id) ?? { billed: 0, paid: 0, overdue: false };
      entry.billed += payable(f);
      entry.paid += Math.min(f.paid_amount ?? (f.status === "Paid" ? payable(f) : 0), payable(f));
      if (effectiveStatus(f) === "Overdue") entry.overdue = true;
      map.set(f.student_id, entry);
    }
    return map;
  }, [enriched]);
  const recordSections = useMemo(
    () =>
      recordsClass === "all"
        ? []
        : Array.from(
            new Set(
              (classes ?? [])
                .filter((c) => c.name === recordsClass)
                .map((c) => c.section)
                .filter(Boolean),
            ),
          ).sort(),
    [classes, recordsClass],
  );
  const recordsFiltered = useMemo(() => {
    const q = recordsSearch.trim().toLowerCase();
    return (students ?? []).filter((s) => {
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !(s.admission_no ?? "").toLowerCase().includes(q) &&
        !(s.class_name ?? "").toLowerCase().includes(q) &&
        String(s.roll ?? "") !== q
      ) {
        return false;
      }
      if (recordsClass !== "all" && s.class_name !== recordsClass) return false;
      if (recordsSection !== "all" && s.section !== recordsSection) return false;
      if (recordsStatus !== "all") {
        const standing = recordStanding.get(s.id);
        const due = standing ? standing.billed - standing.paid : 0;
        if (recordsStatus === "Has dues" && !(due > 0)) return false;
        if (recordsStatus === "Overdue" && !standing?.overdue) return false;
        if (recordsStatus === "Fully cleared" && !(standing && standing.billed > 0 && due <= 0))
          return false;
        if (recordsStatus === "Not billed" && standing && standing.billed > 0) return false;
      }
      return true;
    });
  }, [students, recordsSearch, recordsClass, recordsSection, recordsStatus, recordStanding]);
  const { rows: recordsRows, pageCount: recordsPageCount } = usePaged(
    recordsFiltered,
    recordsPage,
    recordsPageSize,
  );

  const totalCollection = enriched
    .filter((f) => f.status === "Paid")
    .reduce((s, f) => s + payable(f), 0);
  const pendingFees = enriched
    .filter((f) => effectiveStatus(f) === "Pending")
    .reduce((s, f) => s + payable(f), 0);
  const overdueFees = enriched
    .filter((f) => effectiveStatus(f) === "Overdue")
    .reduce((s, f) => s + payable(f), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayCollection = enriched
    .filter((f) => f.paid_on === today)
    .reduce((s, f) => s + payable(f), 0);

  const totalDiscounts = enriched.reduce((s, f) => s + f.discount, 0);
  const report = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let overdue = 0;
    let pending = 0;
    for (const f of enriched) {
      const bill = payable(f);
      const got = paidOn(f);
      billed += bill;
      collected += got;
      if (effectiveStatus(f) === "Overdue") overdue += bill - got;
      else pending += bill - got;
    }
    const paid = enriched.filter((f) => paidOn(f) > 0);
    return {
      billed,
      collected,
      collectedPct: billed ? Math.round((collected / billed) * 1000) / 10 : 0,
      parts: [
        {
          label: "Collected",
          value: collected,
          note: "Payments received",
          bar: "bg-success",
          text: "text-success",
        },
        {
          label: "Pending",
          value: pending,
          note: "Due, not late yet",
          bar: "bg-warning",
          text: "text-warning",
        },
        {
          label: "Overdue",
          value: overdue,
          note: "Past the due date",
          bar: "bg-destructive",
          text: "text-destructive",
        },
      ],
      paidCount: paid.length,
      recent: [...paid]
        .sort((a, b) => (b.paid_on ?? "").localeCompare(a.paid_on ?? ""))
        .slice(0, 8),
    };
  }, [enriched]);
  const discountedFees = enriched.filter((f) => f.discount > 0);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["fees"] });
    await queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
    await queryClient.invalidateQueries({ queryKey: ["students"] });
  }

  const [activeTab, setActiveTab] = useState(TAB_VALUE[tab] ?? "records");
  useEffect(() => setActiveTab(TAB_VALUE[tab] ?? "records"), [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const feeTabs: {
    value: string;
    label: string;
    short: string;
    icon: typeof Wallet;
    count?: number;
  }[] = [
    { value: "structure", label: "Fee Structure", short: "Fee Structure", icon: Layers },
    {
      value: "records",
      label: "Student Fee Records",
      short: "Fees Record",
      icon: Users,
      count: students?.length ?? 0,
    },
    { value: "reports", label: "Fee Reports", short: "Reports", icon: BarChart3 },
    {
      value: "discounts",
      label: "Discounts & Scholarships",
      short: "Discounts",
      icon: Percent,
      count: discountedFees.length,
    },
  ];
  return (
    <div>
      <PageHeader
        title="Fees & Finance"
        description="Track collections, dues and student fee records across all enrolled students."
        breadcrumb={["Dashboard", "Fees & Finance"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          label="Total Collection"
          value={`₹${totalCollection.toLocaleString()}`}
          icon={Wallet}
          tone="success"
        />
        <InfoCard
          label="Pending Fees"
          value={`₹${pendingFees.toLocaleString()}`}
          icon={Clock3}
          tone="warning"
        />
        <InfoCard
          label="Overdue Fees"
          value={`₹${overdueFees.toLocaleString()}`}
          icon={AlertOctagon}
          tone="danger"
        />
        <InfoCard
          label="Today's Collection"
          value={`₹${todayCollection.toLocaleString()}`}
          icon={CalendarCheck2}
          tone="navy"
        />
      </div>

      <Tabs key={tab} value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Phones: every section visible at once as a compact icon menu. */}
        <div className="mb-4 grid grid-cols-4 gap-y-1 rounded-2xl border border-border bg-card p-1.5 shadow-sm sm:hidden">
          {feeTabs.map(({ value, short, icon: Icon }) => {
            const active = activeTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value)}
                aria-pressed={active}
                className="flex flex-col items-center gap-1 rounded-xl py-1.5 transition-transform active:scale-95"
              >
                <span
                  className={cn(
                    "relative grid h-8 w-8 place-items-center rounded-full transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={cn(
                    "w-full truncate px-0.5 text-center text-[10px] leading-none",
                    active ? "font-semibold text-primary" : "font-medium text-muted-foreground",
                  )}
                >
                  {short}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mb-4 hidden overflow-x-auto sm:block">
          <TabsList className="h-auto w-max flex-nowrap justify-start gap-0.5 rounded-xl p-1">
            {feeTabs.map(({ value, label, short, icon: Icon, count }) => (
              <TabsTrigger
                key={value}
                value={value}
                title={label}
                className="group h-8 gap-1.5 rounded-lg px-3 text-[13px] data-[state=active]:shadow-sm"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70 group-data-[state=active]:text-primary group-data-[state=active]:opacity-100" />
                {short}
                {count !== undefined && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-muted-foreground group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary">
                    {count > 9999 ? "9999+" : count.toLocaleString()}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Structure Tab */}
        <TabsContent value="structure">
          <FeeStructureTab />
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <div className="grid gap-4 lg:grid-cols-5">
            <SectionCard
              title="Collection Summary"
              subtitle="Where this year's billed fees stand"
              className="lg:col-span-2"
            >
              <div className="space-y-4">
                <div>
                  <p className="font-display text-3xl font-bold text-success tabular-nums">
                    {rupee(report.collected)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    collected ·{" "}
                    <span className="font-semibold text-foreground">{report.collectedPct}%</span> of{" "}
                    {rupee(report.billed)} billed
                  </p>
                </div>

                <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                  {report.parts.map((part) =>
                    part.value > 0 ? (
                      <div
                        key={part.label}
                        className={part.bar}
                        style={{ width: `${(part.value / (report.billed || 1)) * 100}%` }}
                        title={`${part.label}: ${rupee(part.value)}`}
                      />
                    ) : null,
                  )}
                </div>

                <ul className="divide-y divide-border rounded-xl border border-border">
                  {report.parts.map((part) => (
                    <li key={part.label} className="flex items-center gap-3 px-3 py-2.5">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", part.bar)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{part.label}</p>
                        <p className="text-[11px] text-muted-foreground">{part.note}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm font-bold tabular-nums", part.text)}>
                          {rupee(part.value)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {report.billed ? Math.round((part.value / report.billed) * 100) : 0}%
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-3 rounded-xl bg-info-soft/50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-info" />
                    <div>
                      <p className="text-sm font-medium">Scholarships & discounts</p>
                      <p className="text-[11px] text-muted-foreground">
                        Given on {discountedFees.length} bill
                        {discountedFees.length === 1 ? "" : "s"} — already taken off the billed
                        total
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-info tabular-nums">
                    {rupee(totalDiscounts)}
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Recent Payments"
              subtitle={`Latest of ${report.paidCount.toLocaleString()} payments received`}
              bodyClassName="p-0"
              className="lg:col-span-3"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    setRecordsStatus("Fully cleared");
                    setActiveTab("records");
                  }}
                >
                  View all paid
                </Button>
              }
            >
              {report.recent.length === 0 ? (
                <EmptyState title="No payments yet" icon={Wallet} />
              ) : (
                <ul className="divide-y divide-border">
                  {report.recent.map((f) => {
                    const period = feePeriod(f);
                    return (
                      <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                        <Initials name={f.studentName} className="h-9 w-9 text-[11px]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold capitalize">
                            {f.studentName}
                          </p>
                          <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="capitalize">{f.className}</span>·
                            <span className="truncate capitalize">{feeName(f)}</span>
                            {period && (
                              <span
                                className={cn(
                                  "rounded-full px-1.5 py-px text-[10px] font-semibold",
                                  PERIOD_TONE[period.kind],
                                )}
                              >
                                {period.label}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-success tabular-nums">
                            +{rupee(paidOn(f))}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {f.paid_on ? `Paid ${readableDate(f.paid_on)}` : "Paid"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* Student Fee Records Tab - Shows all 25 students */}
        <TabsContent value="records">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <SearchInput
                value={recordsSearch}
                onChange={(v) => {
                  setRecordsSearch(v);
                  setRecordsPage(1);
                }}
                placeholder="Search name, admission no. or roll…"
                className="col-span-2 sm:w-72"
              />
              <FilterSelect
                value={recordsClass}
                onChange={(v) => {
                  setRecordsClass(v);
                  setRecordsSection("all");
                  setRecordsPage(1);
                }}
                options={classNames}
                placeholder="All classes"
              />
              <FilterSelect
                value={recordsSection}
                onChange={(v) => {
                  setRecordsSection(v);
                  setRecordsPage(1);
                }}
                options={recordSections}
                placeholder="All sections"
                className={recordsClass === "all" ? "pointer-events-none opacity-50" : ""}
              />
              <FilterSelect
                value={recordsStatus}
                onChange={(v) => {
                  setRecordsStatus(v);
                  setRecordsPage(1);
                }}
                options={["Has dues", "Overdue", "Fully cleared", "Not billed"]}
                placeholder="Any payment status"
                className="col-span-2 sm:w-[170px]"
              />
              {(recordsSearch ||
                recordsClass !== "all" ||
                recordsSection !== "all" ||
                recordsStatus !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-span-2 h-9 text-xs text-muted-foreground sm:col-span-1"
                  onClick={() => {
                    setRecordsSearch("");
                    setRecordsClass("all");
                    setRecordsSection("all");
                    setRecordsStatus("all");
                    setRecordsPage(1);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-4 w-4 text-primary" />
                <span>
                  <strong>{recordsFiltered.length}</strong> of {students?.length ?? 0} students
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Per page:</span>
                <Select
                  value={String(recordsPageSize)}
                  onValueChange={(v) => {
                    setRecordsPageSize(Number(v));
                    setRecordsPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-16 bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <StudentFeeRecords
            students={recordsRows}
            summaryStudents={recordsFiltered}
            fees={enriched}
            onCollect={(fee) => setCollectingFee(fee)}
            pager={
              <Pager
                page={recordsPage}
                pageCount={recordsPageCount}
                onPage={setRecordsPage}
                total={recordsFiltered.length}
              />
            }
          />
        </TabsContent>

        {/* Discounts Tab */}
        <TabsContent value="discounts">
          <div className="space-y-3">
            <SectionCard
              title="Discounts & Fee Concessions"
              subtitle={`₹${totalDiscounts.toLocaleString()} in concessions across ${discountedFees.length} fee record${
                discountedFees.length === 1 ? "" : "s"
              }`}
              action={
                <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" /> Apply Concession / Discount
                    </Button>
                  </DialogTrigger>
                  <ApplyDiscountDialog
                    fees={enriched}
                    students={students ?? []}
                    classes={classes ?? []}
                    studentName={studentNameFor}
                    onDone={async () => {
                      await invalidate();
                      setDiscountOpen(false);
                    }}
                  />
                </Dialog>
              }
              bodyClassName="p-0"
            >
              {discountedFees.length === 0 ? (
                <EmptyState
                  title="No concessions applied yet"
                  description="Apply a scholarship or fee waiver to any student's unpaid fee to see it listed here."
                />
              ) : (
                <FeesTable
                  rows={discountedFees}
                  onCollect={(f) => setCollectingFee(f)}
                  onEditDiscount={setEditingDiscount}
                />
              )}
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>

      {/* Bill Fee dialog lives outside the tabs so any tab (e.g. a student's fee overview) can open it. */}
      <Dialog
        open={addFeeOpen}
        onOpenChange={(o) => {
          setAddFeeOpen(o);
          if (!o) setBillingStudentId(undefined);
        }}
      >
        <Dialog open={!!editingDiscount} onOpenChange={(o) => !o && setEditingDiscount(null)}>
          {editingDiscount && (
            <EditDiscountDialog
              key={editingDiscount.id}
              fee={editingDiscount}
              onDone={async () => {
                await invalidate();
                setEditingDiscount(null);
              }}
            />
          )}
        </Dialog>
        {addFeeOpen && (
          <AddFeeDialog
            key={billingStudentId ?? "any"}
            defaultStudentId={billingStudentId}
            onDone={async () => {
              await invalidate();
              setAddFeeOpen(false);
              setBillingStudentId(undefined);
            }}
          />
        )}
      </Dialog>

      {/* Collect Payment Dialog */}
      <Dialog open={!!collectingFee} onOpenChange={(o) => !o && setCollectingFee(null)}>
        {collectingFee && (
          <CollectPaymentDialog
            key={collectingFee.id}
            fee={collectingFee}
            studentName={collectingFee.studentName}
            classLabel={collectingFee.className}
            admissionNo={collectingFee.admissionNo}
            onSaved={invalidate}
            onDone={() => setCollectingFee(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
