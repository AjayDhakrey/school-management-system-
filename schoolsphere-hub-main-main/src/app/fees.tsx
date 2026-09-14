"use client";

import { useEffect, useMemo, useState } from "react";
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
import { InfoCard, ProgressBar } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Wallet,
  Clock3,
  AlertOctagon,
  CalendarCheck2,
  Eye,
  Receipt,
  Printer,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  CreditCard,
  Users,
} from "lucide-react";
import { useFees, useStudents, useClasses, useFeeStructures, useSchoolProfile, type ApiFee, type ApiFeeStructure } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const NONE = "__none__";
const STATUS_OPTIONS = ["Pending", "Paid", "Overdue", "Partial"];
const OTHER_FEE = "__other__";

function payable(f: ApiFee) {
  return Math.max(0, f.amount - f.discount + f.fine);
}

function amountInWords(n: number) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
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

/** Fee Structure — admin-managed fee-head catalog (create/edit/delete). */
function FeeStructureDialog({
  initial,
  onDone,
}: {
  initial?: ApiFeeStructure | undefined;
  onDone: () => void;
}) {
  const { data: classes } = useClasses();
  const isEdit = Boolean(initial);
  const [feeType, setFeeType] = useState(initial?.fee_type ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [classId, setClassId] = useState(initial?.class_id ?? NONE);
  const [session, setSession] = useState(initial?.session ?? "2026-2027");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feeType.trim() || !amount) {
      toast.error("Fee head and amount are required");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        feeType: feeType.trim(),
        amount: Number(amount),
        classId: classId !== NONE ? classId : null,
        session: session.trim() || null,
      };
      if (isEdit) {
        await api.patch(`/fee-structures/${initial!.id}`, body);
      } else {
        await api.post("/fee-structures", body);
      }
      toast.success(isEdit ? "Fee structure updated" : "Fee structure added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save fee structure");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Fee Structure" : "Add Fee Structure"}</DialogTitle>
        <DialogDescription>Define standard fee heads, amounts, and applicability.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="feeType">Fee Head</Label>
          <Input id="feeType" value={feeType} onChange={(e) => setFeeType(e.target.value)} placeholder="e.g. Tuition Fee" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="amount">Amount (₹)</Label>
          <Input id="amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
        </div>
        <div className="grid gap-1.5">
          <Label>Applies To</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="bg-surface">
              <SelectValue />
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
          <Label htmlFor="session">Academic Session</Label>
          <Input id="session" value={session} onChange={(e) => setSession(e.target.value)} placeholder="e.g. 2026-2027" />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Fee Structure"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
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
    () => (classId === NONE ? (students ?? []) : (students ?? []).filter((s) => s.class_id === classId)),
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
          <Label>Select Student ({classStudents.length} {classId === NONE ? "Enrolled" : "in this Class"})</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Choose a student" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {classStudents.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No students in this class & section.</div>
              )}
              {classStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {s.class_name ?? "—"}{s.section ? `-${s.section}` : ""}{s.admission_no ? ` (${s.admission_no})` : ""}
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
            <Input id="dueDate" type="date" min={new Date().toISOString().slice(0, 10)} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
  onDone,
}: {
  fee: ApiFee;
  studentName: string;
  onDone: () => void;
}) {
  const total = payable(fee);
  const alreadyPaid = fee.paid_amount ?? 0;
  const remaining = Math.max(0, total - alreadyPaid);

  const [paymentType, setPaymentType] = useState<"full" | "partial">(remaining > 0 ? "full" : "full");
  const [partialAmount, setPartialAmount] = useState("");
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptNo, setReceiptNo] = useState(() => `RCPT-${Date.now().toString().slice(-6)}`);
  const [submitting, setSubmitting] = useState(false);

  const effectiveAmount = paymentType === "full" ? remaining : Math.min(Number(partialAmount) || 0, remaining);
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
      await api.post(`/fees/${fee.id}/pay`, {
        payAmount: effectiveAmount,
        paymentDate: paidDate,
        method: "Cash",
        transactionReference: receiptNo.trim() || null,
        idempotencyKey: crypto.randomUUID(),
      });
      const label = willBeFullyPaid ? "full payment" : "partial payment";
      toast.success(`₹${effectiveAmount.toLocaleString()} ${label} recorded for ${studentName}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Record Fee Payment</DialogTitle>
        <DialogDescription>Record a full or partial fee payment and generate a receipt.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleCollect} className="space-y-4">
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-sm space-y-1.5 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Student:</span>
            <span className="font-medium truncate min-w-0">{studentName}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Fee Head:</span>
            <span className="font-medium truncate min-w-0">{fee.fee_type}</span>
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
                After this payment, remaining balance will be ₹{(remaining - Number(partialAmount)).toLocaleString()}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="paidDate">Payment Date</Label>
            <Input id="paidDate" type="date" min={new Date().toISOString().slice(0, 10)} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="receiptNo">Receipt Number</Label>
            <Input id="receiptNo" value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} />
          </div>
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
              <span className={`shrink-0 ${willBeFullyPaid ? "text-success font-medium" : "text-warning font-medium"}`}>
                {willBeFullyPaid ? "Fully Paid" : "Partially Paid"}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="submit" disabled={submitting || effectiveAmount <= 0} className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? "Saving…" : willBeFullyPaid ? "Mark as Fully Paid" : `Record ₹${effectiveAmount.toLocaleString()} Payment`}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Adjusts the discount on an unpaid fee record. */
function ApplyDiscountDialog({
  fees,
  studentName,
  onDone,
}: {
  fees: (ApiFee & { studentName: string })[];
  studentName: (id: string) => string;
  onDone: () => void;
}) {
  const [feeId, setFeeId] = useState("");
  const [discount, setDiscount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const unpaid = fees.filter((f) => f.status !== "Paid");

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
        <DialogDescription>Sets the concession or scholarship discount on an unpaid fee record.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Fee Record</Label>
          <Select value={feeId} onValueChange={setFeeId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select an unpaid fee" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {unpaid.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No unpaid fee records.</div>}
              {unpaid.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {studentName(f.student_id)} · {f.fee_type} · ₹{f.amount.toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="discount">Discount Amount (₹)</Label>
          <Input id="discount" type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="500" />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Applying…" : "Apply Discount"}
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
  school,
}: {
  fee: ApiFee;
  studentName: string;
  className: string;
  school: { name?: string; address?: string | null; phone?: string | null; email?: string | null } | undefined;
}) {
  const total = payable(fee);
  return (
    <div className="max-h-[75vh] overflow-y-auto rounded-xl border border-border bg-surface p-6 print:max-h-none print:overflow-visible">
      <div className="flex items-start justify-between border-b border-dashed border-border pb-4">
        <div>
          <p className="font-display text-lg font-bold text-primary">{school?.name ?? "Everbright International School"}</p>
          <p className="text-xs text-muted-foreground">{school?.address ?? "Academic Campus, Riverdale"}</p>
          <p className="text-xs text-muted-foreground">
            {school?.phone ?? "+1 (555) 234-5678"} {school?.email ? `· ${school.email}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Receipt No.</p>
          <p className="font-semibold font-mono">{fee.receipt_no ?? `RCPT-${fee.id.slice(0, 8).toUpperCase()}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Payment Date</p>
          <p className="font-semibold">{fee.paid_on ?? fee.due_date ?? "—"}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Student Name</p>
          <p className="font-medium text-base">{studentName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Class / Section</p>
          <p className="font-medium text-base">{className}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1.5 font-medium">Fee Description</th>
            <th className="py-1.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/60">
            <td className="py-2 font-medium">{fee.fee_type}</td>
            <td className="py-2 text-right font-mono">₹{fee.amount.toFixed(2)}</td>
          </tr>
          {fee.discount > 0 && (
            <tr className="border-b border-border/60 text-success">
              <td className="py-1.5">Concession / Discount Applied</td>
              <td className="py-1.5 text-right font-mono">-₹{fee.discount.toFixed(2)}</td>
            </tr>
          )}
          {fee.fine > 0 && (
            <tr className="border-b border-border/60 text-destructive">
              <td className="py-1.5">Late Fee / Penalty</td>
              <td className="py-1.5 text-right font-mono">+₹{fee.fine.toFixed(2)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-3 font-semibold text-base">Net Payable Total</td>
            <td className="pt-3 text-right font-bold text-base font-mono text-primary">₹{total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-3 text-xs text-muted-foreground italic">Amount in words: {amountInWords(total)}</p>

      <div className="mt-6 flex items-center justify-between">
        <div
          className={`rounded-lg border-2 px-4 py-2 text-sm font-bold tracking-wider rotate-[-3deg] ${
            fee.status === "Paid"
              ? "border-success/50 bg-success-soft text-success shadow-sm"
              : "border-warning/50 bg-warning-soft text-warning shadow-sm"
          }`}
        >
          {fee.status === "Paid" ? "PAID" : fee.status.toUpperCase()}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p className="mb-8">Authorized Signatory</p>
          <p className="w-44 border-t border-border pt-1 font-medium">Accounts & Finance Office</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 print:hidden">
        <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print Receipt
        </Button>
      </div>
    </div>
  );
}

type EnrichedFee = ApiFee & { studentName: string; className: string; admissionNo: string };

function FeesTable({
  rows,
  onCollect,
}: {
  rows: EnrichedFee[];
  onCollect?: (fee: EnrichedFee) => void;
}) {
  const { data: school } = useSchoolProfile();
  const [viewing, setViewing] = useState<EnrichedFee | null>(null);
  const [receiptFor, setReceiptFor] = useState<EnrichedFee | null>(null);

  if (rows.length === 0) return <EmptyState title="No fee records found" icon={Wallet} />;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">Class</th>
              <th className="px-4 py-2.5 font-medium">Fee Head</th>
              <th className="px-4 py-2.5 font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium">Payable</th>
              <th className="px-4 py-2.5 font-medium">Due Date</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Initials name={f.studentName} className="h-7 w-7 text-xs" />
                    <div className="truncate">
                      <span className="font-medium truncate block">{f.studentName}</span>
                      {f.admissionNo && <span className="text-[11px] text-muted-foreground">{f.admissionNo}</span>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{f.className}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{f.fee_type}</td>
                <td className="px-4 py-2.5 whitespace-nowrap font-mono">₹{f.amount.toLocaleString()}</td>
                <td className="px-4 py-2.5 whitespace-nowrap font-medium font-mono">₹{payable(f).toLocaleString()}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{f.due_date ?? "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <StatusBadge status={f.status} />
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {f.status !== "Paid" && onCollect && (
                      <Button size="sm" variant="default" className="h-7 px-2 text-xs gap-1" onClick={() => onCollect(f)}>
                        <CreditCard className="h-3 w-3" /> Collect
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setViewing(f)}>
                      <Eye className="h-3 w-3" /> View
                    </Button>
                    {f.status === "Paid" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setReceiptFor(f)}>
                        <Receipt className="h-3 w-3" /> Receipt
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                  <p className="font-medium">{viewing.fee_type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-medium">{viewing.due_date ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-medium font-mono">₹{viewing.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payable</p>
                  <p className="font-semibold text-primary font-mono">₹{payable(viewing).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Discount</p>
                  <p className="text-success font-mono">-₹{viewing.discount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge status={viewing.status} />
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
            <FeeReceipt fee={receiptFor} studentName={receiptFor.studentName} className={receiptFor.className} school={school} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Page({ tab = "collection" }: { tab?: "structure" | "collection" | "pending" | "reports" }) {
  const TAB_VALUE: Record<string, string> = {
    structure: "structure",
    collection: "recent",
    pending: "pending",
    reports: "reports",
  };
  const { data: fees, isLoading } = useFees();
  const { data: students } = useStudents();
  const { data: classes } = useClasses();
  const { data: feeStructures } = useFeeStructures();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [pendingPage, setPendingPage] = useState(1);
  const [structureDialogOpen, setStructureDialogOpen] = useState(false);
  const [editingStructure, setEditingStructure] = useState<ApiFeeStructure | null>(null);
  const [addFeeOpen, setAddFeeOpen] = useState(false);
  const [billingStudentId, setBillingStudentId] = useState<string | undefined>(undefined);
  const [collectingFee, setCollectingFee] = useState<EnrichedFee | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [recordsSearch, setRecordsSearch] = useState("");
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPageSize, setRecordsPageSize] = useState(10);

  const studentsById = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students]);

  const classNameFor = (studentId: string) => {
    const s = studentsById.get(studentId);
    if (!s) return "—";
    if (!s.class_name) return "—";
    return s.section ? `${s.class_name}-${s.section}` : s.class_name;
  };

  const studentNameFor = (studentId: string) => studentsById.get(studentId)?.name ?? "Unknown Student";
  const studentAdmissionFor = (studentId: string) => studentsById.get(studentId)?.admission_no ?? "";

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

  const filtered = useMemo(
    () =>
      enriched.filter(
        (f) =>
          (search === "" ||
            f.studentName.toLowerCase().includes(search.toLowerCase()) ||
            (f.admissionNo ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (f.receipt_no ?? "").toLowerCase().includes(search.toLowerCase()) ||
            f.fee_type.toLowerCase().includes(search.toLowerCase())) &&
          (classFilter === "all" || f.className.startsWith(classFilter)) &&
          (statusFilter === "all" || f.status === statusFilter),
      ),
    [enriched, search, classFilter, statusFilter],
  );

  const { rows, pageCount } = usePaged(filtered, page, pageSize);

  const pendingOverdue = useMemo(
    () => filtered.filter((f) => f.status === "Pending" || f.status === "Overdue"),
    [filtered],
  );
  const { rows: pendingRows, pageCount: pendingPageCount } = usePaged(pendingOverdue, pendingPage, pageSize);

  const recordsFiltered = useMemo(
    () =>
      (students ?? []).filter(
        (s) =>
          recordsSearch === "" ||
          s.name.toLowerCase().includes(recordsSearch.toLowerCase()) ||
          (s.admission_no ?? "").toLowerCase().includes(recordsSearch.toLowerCase()) ||
          (s.class_name ?? "").toLowerCase().includes(recordsSearch.toLowerCase()),
      ),
    [students, recordsSearch],
  );
  const { rows: recordsRows, pageCount: recordsPageCount } = usePaged(recordsFiltered, recordsPage, recordsPageSize);

  const totalCollection = enriched.filter((f) => f.status === "Paid").reduce((s, f) => s + payable(f), 0);
  const pendingFees = enriched.filter((f) => f.status === "Pending").reduce((s, f) => s + payable(f), 0);
  const overdueFees = enriched.filter((f) => f.status === "Overdue").reduce((s, f) => s + payable(f), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayCollection = enriched.filter((f) => f.paid_on === today).reduce((s, f) => s + payable(f), 0);

  const totalDiscounts = enriched.reduce((s, f) => s + f.discount, 0);
  const discountedFees = enriched.filter((f) => f.discount > 0);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["fees"] });
    await queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
    await queryClient.invalidateQueries({ queryKey: ["students"] });
  }

  async function deleteStructure(s: ApiFeeStructure) {
    try {
      await api.delete(`/fee-structures/${s.id}`);
      toast.success("Fee structure removed");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove fee structure");
    }
  }

  return (
    <div>
      <PageHeader
        title="Fees & Finance"
        description="Track collections, dues and student fee records across all enrolled students."
        breadcrumb={["Dashboard", "Fees & Finance"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Collection" value={`₹${totalCollection.toLocaleString()}`} icon={Wallet} tone="success" />
        <InfoCard label="Pending Fees" value={`₹${pendingFees.toLocaleString()}`} icon={Clock3} tone="warning" />
        <InfoCard label="Overdue Fees" value={`₹${overdueFees.toLocaleString()}`} icon={AlertOctagon} tone="danger" />
        <InfoCard label="Today's Collection" value={`₹${todayCollection.toLocaleString()}`} icon={CalendarCheck2} tone="navy" />
      </div>

      <Tabs defaultValue={TAB_VALUE[tab] ?? "recent"} className="w-full">
        <div className="scrollbar-slim mb-4 overflow-x-auto">
          <TabsList className="w-max flex-nowrap justify-start gap-1">
            <TabsTrigger value="structure">Fee Structure</TabsTrigger>
            <TabsTrigger value="recent">Fee Collection ({enriched.length})</TabsTrigger>
            <TabsTrigger value="pending">
              Pending Fees ({enriched.filter((f) => f.status === "Pending" || f.status === "Overdue").length})
            </TabsTrigger>
            <TabsTrigger value="reports">Fee Reports</TabsTrigger>
            <TabsTrigger value="records">Student Fee Records ({students?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="discounts">Discounts & Scholarships ({discountedFees.length})</TabsTrigger>
          </TabsList>
        </div>

        {/* Structure Tab */}
        <TabsContent value="structure">
          <SectionCard
            title="Fee Structure Catalog"
            subtitle="Standard fee heads and rates configured for the academic year"
            bodyClassName="p-0"
            action={
              <Dialog
                open={structureDialogOpen}
                onOpenChange={(o) => {
                  setStructureDialogOpen(o);
                  if (!o) setEditingStructure(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" onClick={() => setEditingStructure(null)}>
                    <Plus className="h-4 w-4" /> Add Fee Structure
                  </Button>
                </DialogTrigger>
                <FeeStructureDialog
                  initial={editingStructure ?? undefined}
                  onDone={async () => {
                    await invalidate();
                    setStructureDialogOpen(false);
                    setEditingStructure(null);
                  }}
                />
              </Dialog>
            }
          >
            {(feeStructures ?? []).length === 0 ? (
              <EmptyState title="No fee structures configured" description="Add a fee head to start billing students." icon={Wallet} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium whitespace-nowrap">Fee Head</th>
                      <th className="px-4 py-2.5 font-medium whitespace-nowrap">Applies To</th>
                      <th className="px-4 py-2.5 font-medium whitespace-nowrap">Session</th>
                      <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Amount</th>
                      <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(feeStructures ?? []).map((f) => (
                      <tr key={f.id} className="border-b border-border/60 hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">{f.fee_type}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {f.class_id ? (classes ?? []).find((c) => c.id === f.class_id)?.name ?? "—" : "All Classes"}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{f.session ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium whitespace-nowrap">₹{f.amount.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingStructure(f);
                                setStructureDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteStructure(f)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Fee Collection Tab */}
        <TabsContent value="recent">
          <SectionCard
            title="Fee Collections & Invoices"
            subtitle={`Showing ${filtered.length} total fee records across ${students?.length ?? 0} students`}
            bodyClassName="p-0"
            action={
              <Dialog
                open={addFeeOpen}
                onOpenChange={(o) => {
                  setAddFeeOpen(o);
                  if (!o) setBillingStudentId(undefined);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" onClick={() => setBillingStudentId(undefined)}>
                    <Plus className="h-4 w-4" /> Bill Fee
                  </Button>
                </DialogTrigger>
                <AddFeeDialog
                  defaultStudentId={billingStudentId}
                  onDone={async () => {
                    await invalidate();
                    setAddFeeOpen(false);
                    setBillingStudentId(undefined);
                  }}
                />
              </Dialog>
            }
          >
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading fee records…</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SearchInput value={search} onChange={setSearch} placeholder="Search student, admission, receipt…" />
                    <FilterSelect value={classFilter} onChange={setClassFilter} options={classNames} placeholder="Class" />
                    <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Status" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Page size:</span>
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
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
                <FeesTable rows={rows} onCollect={(f) => setCollectingFee(f)} />
                <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
              </>
            )}
          </SectionCard>
        </TabsContent>

        {/* Pending Fees Tab */}
        <TabsContent value="pending">
          <SectionCard
            title="Pending & Overdue Dues"
            subtitle={`${pendingOverdue.length} unpaid fee accounts requiring collection`}
            bodyClassName="p-0"
          >
            <FeesTable rows={pendingRows} onCollect={(f) => setCollectingFee(f)} />
            <Pager page={pendingPage} pageCount={pendingPageCount} onPage={setPendingPage} total={pendingOverdue.length} />
          </SectionCard>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCard title="Collection Summary">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-muted-foreground">Total Realized (Paid)</span>
                  <span className="font-semibold text-success">₹{totalCollection.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-muted-foreground">Pending Collection</span>
                  <span className="font-semibold text-warning">₹{pendingFees.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-muted-foreground">Overdue Collection</span>
                  <span className="font-semibold text-destructive">₹{overdueFees.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-muted-foreground">Total Scholarships / Discounts</span>
                  <span className="font-semibold text-primary">₹{totalDiscounts.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="font-medium">Total Billed Volume</span>
                  <span className="font-bold text-base font-mono">
                    ₹{(totalCollection + pendingFees + overdueFees).toLocaleString()}
                  </span>
                </div>
              </div>
            </SectionCard>
            <SectionCard
              title="Recent Paid Transactions"
              subtitle={`${enriched.filter((f) => f.status === "Paid").length} recorded successful payments`}
              bodyClassName="p-0"
            >
              <FeesTable
                rows={enriched
                  .filter((f) => f.status === "Paid")
                  .sort((a, b) => (b.paid_on ?? "").localeCompare(a.paid_on ?? ""))
                  .slice(0, 8)}
              />
            </SectionCard>
          </div>
        </TabsContent>

        {/* Student Fee Records Tab - Shows all 25 students */}
        <TabsContent value="records">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="w-full sm:w-80">
              <SearchInput
                value={recordsSearch}
                onChange={(v) => {
                  setRecordsSearch(v);
                  setRecordsPage(1);
                }}
                placeholder="Search by student name, roll or class…"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-4 w-4 text-primary" />
                <span>
                  <strong>{students?.length ?? 0}</strong> Enrolled Students
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

          <div className="space-y-3">
            {(students ?? []).length === 0 ? (
              <EmptyState title="No students found" icon={Wallet} />
            ) : recordsFiltered.length === 0 ? (
              <EmptyState title="No matching students" description="Try searching for another student name or class." icon={Wallet} />
            ) : (
              recordsRows.map((s) => {
                const studentFees = enriched.filter((f) => f.student_id === s.id);
                const total = studentFees.reduce((a, f) => a + f.amount, 0);
                const paid = studentFees.filter((f) => f.status === "Paid").reduce((a, f) => a + payable(f), 0);
                const balance = Math.max(0, total - paid);
                const isFullyPaid = studentFees.length > 0 && balance === 0;

                return (
                  <SectionCard
                    key={s.id}
                    title={s.name}
                    subtitle={`${s.class_name ?? "—"}${s.section ? `-${s.section}` : ""} · ${
                      s.admission_no ?? `ADM-${s.id.slice(0, 8)}`
                    } · Roll ${s.roll ?? "—"}`}
                    action={
                      <div className="flex items-center gap-2">
                        {isFullyPaid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success bg-success-soft px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Fully Cleared
                          </span>
                        ) : studentFees.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning bg-warning-soft px-2.5 py-1 rounded-full">
                            <Clock3 className="h-3.5 w-3.5" /> ₹{balance.toLocaleString()} Due
                          </span>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1"
                          onClick={() => {
                            setBillingStudentId(s.id);
                            setAddFeeOpen(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Bill Fee
                        </Button>
                      </div>
                    }
                  >
                    {studentFees.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                        <p className="text-sm text-muted-foreground">No fees billed to this student yet.</p>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setBillingStudentId(s.id);
                            setAddFeeOpen(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Fee Ledger
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                <th className="py-1.5 font-medium">Fee Head</th>
                                <th className="py-1.5 font-medium">Due Date</th>
                                <th className="py-1.5 font-medium">Status</th>
                                <th className="py-1.5 text-right font-medium">Amount</th>
                                <th className="py-1.5 text-right font-medium">Payable</th>
                                <th className="py-1.5 text-right font-medium">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {studentFees.map((f) => (
                                <tr key={f.id} className="border-b border-border/60 last:border-0">
                                  <td className="py-1.5 font-medium">{f.fee_type}</td>
                                  <td className="py-1.5 text-muted-foreground">{f.due_date ?? "—"}</td>
                                  <td className="py-1.5">
                                    <StatusBadge status={f.status} />
                                  </td>
                                  <td className="py-1.5 text-right font-mono">₹{f.amount.toLocaleString()}</td>
                                  <td className="py-1.5 text-right font-mono font-medium">₹{payable(f).toLocaleString()}</td>
                                  <td className="py-1.5 text-right">
                                    {f.status !== "Paid" ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => setCollectingFee(f)}
                                      >
                                        Record Payment
                                      </Button>
                                    ) : (
                                      <span className="text-xs text-success font-medium">Paid</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-3 text-sm rounded-lg bg-muted/20 p-2.5">
                          <div>
                            <p className="text-xs text-muted-foreground">Total Billed</p>
                            <p className="font-semibold font-mono">₹{total.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Paid</p>
                            <p className="font-semibold text-success font-mono">₹{paid.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                            <p className="font-semibold text-destructive font-mono">₹{balance.toLocaleString()}</p>
                          </div>
                        </div>
                        <ProgressBar value={total ? (paid / total) * 100 : 0} tone="success" className="mt-3" />
                      </>
                    )}
                  </SectionCard>
                );
              })
            )}
            <Pager page={recordsPage} pageCount={recordsPageCount} onPage={setRecordsPage} total={recordsFiltered.length} />
          </div>
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
                <FeesTable rows={discountedFees} onCollect={(f) => setCollectingFee(f)} />
              )}
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>

      {/* Collect Payment Dialog */}
      <Dialog open={!!collectingFee} onOpenChange={(o) => !o && setCollectingFee(null)}>
        {collectingFee && (
          <CollectPaymentDialog
            fee={collectingFee}
            studentName={collectingFee.studentName}
            onDone={async () => {
              await invalidate();
              setCollectingFee(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
