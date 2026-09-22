"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Wallet, CheckCircle2, Clock3, Printer, CreditCard } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard, ProgressBar } from "@/components/shared/InfoCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFees, useMyStudentProfile, useSchoolProfile, type ApiFee } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { feeTitle } from "@/lib/fees";
import { FeeReceipt } from "@/components/shared/FeeReceipt";

function payable(f: ApiFee) {
  return Math.max(0, f.amount - f.discount + f.fine);
}

function PayNowDialog({
  fee,
  onDone,
}: {
  fee: ApiFee;
  onDone: (receiptNo?: string, paidAmount?: number) => void;
}) {
  const [method, setMethod] = useState("Card");
  const [paying, setPaying] = useState(false);
  const [paymentType, setPaymentType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");

  const total = payable(fee);
  const alreadyPaid = fee.paid_amount ?? 0;
  const remaining = Math.max(0, total - alreadyPaid);

  const effectiveAmount =
    paymentType === "full" ? remaining : Math.min(Number(partialAmount) || 0, remaining);
  const willBeFullyPaid = alreadyPaid + effectiveAmount >= total;

  async function pay() {
    if (effectiveAmount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setPaying(true);
    try {
      const result = await api.post<{
        transactionId: string;
        receiptNo: string;
        paidAmount: number;
        totalPaid: number;
        remaining: number;
        status: string;
      }>(`/fees/${fee.id}/pay`, {
        method,
        payAmount: effectiveAmount,
        idempotencyKey: crypto.randomUUID(),
      });
      const label =
        result.status === "Paid" ? "Full payment successful" : "Partial payment successful";
      toast.success(`${label} — ${result.transactionId}`);
      onDone(result.receiptNo, result.paidAmount);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Payment failed. Please try again.";
      toast.error(message);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-border p-3 text-sm space-y-1.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fee Amount</span>
          <span>₹{fee.amount.toLocaleString()}</span>
        </div>
        {fee.discount > 0 && (
          <div className="flex justify-between text-success">
            <span>Discount</span>
            <span>-₹{fee.discount.toLocaleString()}</span>
          </div>
        )}
        {fee.fine > 0 && (
          <div className="flex justify-between text-destructive">
            <span>Fine</span>
            <span>+₹{fee.fine.toLocaleString()}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between">
          <span className="text-muted-foreground">Net Payable</span>
          <span className="font-medium">₹{total.toLocaleString()}</span>
        </div>
        {alreadyPaid > 0 && (
          <div className="flex justify-between text-success">
            <span>Already Paid</span>
            <span>-₹{alreadyPaid.toLocaleString()}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold">
          <span>Remaining</span>
          <span className="text-primary">₹{remaining.toLocaleString()}</span>
        </div>
      </div>

      {/* Payment type toggle */}
      <div className="grid gap-2">
        <Label>Payment Type</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={paymentType === "full" ? "default" : "outline"}
            className="flex-1 gap-1.5 text-xs sm:text-sm"
            onClick={() => setPaymentType("full")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Full (₹{remaining.toLocaleString()})
          </Button>
          <Button
            type="button"
            variant={paymentType === "partial" ? "default" : "outline"}
            className="flex-1 gap-1.5 text-xs sm:text-sm"
            onClick={() => setPaymentType("partial")}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Partial
          </Button>
        </div>
      </div>

      {paymentType === "partial" && (
        <div className="grid gap-1.5">
          <Label htmlFor="partialAmount">Amount to Pay (₹)</Label>
          <Input
            id="partialAmount"
            type="number"
            min={1}
            max={remaining}
            step="0.01"
            value={partialAmount}
            onChange={(e) => setPartialAmount(e.target.value)}
            placeholder={`Max ₹${remaining.toLocaleString()}`}
          />
          {Number(partialAmount) > 0 && Number(partialAmount) < remaining && (
            <p className="text-xs text-muted-foreground">
              Remaining after payment: ₹{(remaining - Number(partialAmount)).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <Select value={method} onValueChange={setMethod}>
        <SelectTrigger className="bg-surface">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["Card", "UPI", "Net Banking", "Wallet"].map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Summary */}
      {effectiveAmount > 0 && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-sm">
          <div className="flex justify-between font-semibold">
            <span>Paying:</span>
            <span className="text-primary">₹{effectiveAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-muted-foreground text-xs mt-0.5">
            <span>Status after payment:</span>
            <span
              className={willBeFullyPaid ? "text-success font-medium" : "text-warning font-medium"}
            >
              {willBeFullyPaid ? "Fully Paid" : "Partially Paid"}
            </span>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone()} disabled={paying}>
          Cancel
        </Button>
        <Button onClick={pay} disabled={paying || effectiveAmount <= 0}>
          {paying
            ? "Processing…"
            : willBeFullyPaid
              ? `Pay Full ₹${effectiveAmount.toLocaleString()}`
              : `Pay ₹${effectiveAmount.toLocaleString()}`}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function MyFeesPage() {
  const { data: fees, isLoading } = useFees();
  const { data: student } = useMyStudentProfile();
  const { data: school } = useSchoolProfile();
  const queryClient = useQueryClient();
  const [payingFor, setPayingFor] = useState<ApiFee | null>(null);
  const [receipt, setReceipt] = useState<{
    fee: ApiFee;
    receiptNo: string;
    paidAmount?: number | undefined;
  } | null>(null);

  const rows = useMemo(() => fees ?? [], [fees]);
  const total = rows.reduce((sum, f) => sum + payable(f), 0);
  const paid = rows.reduce((sum, f) => sum + (f.paid_amount ?? 0), 0);
  const pending = total - paid;
  const nextDue = useMemo(
    () =>
      rows
        .filter((f) => f.status !== "Paid")
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0],
    [rows],
  );

  function handlePaymentDone(receiptNo?: string, paidAmount?: number) {
    const fee = payingFor;
    setPayingFor(null);
    if (receiptNo && fee) {
      queryClient.invalidateQueries({ queryKey: ["fees"] });
      setReceipt({ fee, receiptNo, paidAmount });
    }
  }

  return (
    <div>
      <PageHeader
        title="Fees"
        description="View and pay your school fees."
        breadcrumb={["Dashboard", "Fees"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          label="Total Fees"
          value={`₹${total.toLocaleString()}`}
          icon={Wallet}
          tone="navy"
        />
        <InfoCard
          label="Paid"
          value={`₹${paid.toLocaleString()}`}
          icon={CheckCircle2}
          tone="success"
        />
        <InfoCard
          label="Pending"
          value={`₹${pending.toLocaleString()}`}
          icon={Clock3}
          tone="warning"
        />
        <InfoCard
          label="Next Due Date"
          value={nextDue?.due_date ?? "—"}
          icon={Clock3}
          tone="gold"
        />
      </div>

      <div className="panel">
        {isLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No fee records found"
            description="Your school hasn't added fee records yet."
            icon={Wallet}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => {
                  const fPayable = payable(f);
                  const fPaid = f.paid_amount ?? 0;
                  const fRemaining = Math.max(0, fPayable - fPaid);
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{feeTitle(f)}</TableCell>
                      <TableCell className="font-mono">₹{fPayable.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-success">
                        ₹{fPaid.toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono">
                        {fRemaining > 0 ? (
                          <span className="text-destructive">₹{fRemaining.toLocaleString()}</span>
                        ) : (
                          <span className="text-success">₹0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{f.due_date ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={f.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {f.status === "Paid" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setReceipt({ fee: f, receiptNo: f.receipt_no ?? "—" })}
                            >
                              <Printer className="h-3.5 w-3.5" /> Receipt
                            </Button>
                          ) : (
                            <Button size="sm" className="gap-1" onClick={() => setPayingFor(f)}>
                              <CreditCard className="h-3.5 w-3.5" />
                              {f.status === "Partial" ? "Pay Remaining" : "Pay Now"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Progress bar for total payment */}
      {rows.length > 0 && total > 0 && (
        <div className="mt-4 panel p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Overall Payment Progress</span>
            <span className="font-medium">{Math.round((paid / total) * 100)}%</span>
          </div>
          <ProgressBar value={(paid / total) * 100} tone="success" />
        </div>
      )}

      <Dialog open={Boolean(payingFor)} onOpenChange={(o) => !o && setPayingFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay Fee — {payingFor ? feeTitle(payingFor) : ""}</DialogTitle>
            <DialogDescription>
              Choose to pay the full remaining amount or make a partial payment.
            </DialogDescription>
          </DialogHeader>
          {payingFor && <PayNowDialog fee={payingFor} onDone={handlePaymentDone} />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(receipt)} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="receipt-print-dialog max-w-lg print:max-w-none">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          {receipt && (
            <FeeReceipt
              fee={receipt.fee}
              receiptNo={receipt.receiptNo}
              transactionAmount={receipt.paidAmount}
              student={student}
              school={school}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
