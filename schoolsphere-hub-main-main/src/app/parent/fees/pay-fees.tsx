"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, CreditCard, Printer, Wallet } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFeesFor, useStudent, useSchoolProfile, type ApiFee } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";
import { api, ApiError } from "@/lib/api";

function payable(f: ApiFee) {
  return Math.max(0, f.amount - f.discount + f.fine);
}

function PayNowDialog({ fee, onDone }: { fee: ApiFee; onDone: (receiptNo?: string, paidAmount?: number) => void }) {
  const [method, setMethod] = useState("Card");
  const [paying, setPaying] = useState(false);
  const [paymentType, setPaymentType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");

  const total = payable(fee);
  const alreadyPaid = fee.paid_amount ?? 0;
  const remaining = Math.max(0, total - alreadyPaid);

  const effectiveAmount = paymentType === "full" ? remaining : Math.min(Number(partialAmount) || 0, remaining);
  const willBeFullyPaid = (alreadyPaid + effectiveAmount) >= total;

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
      const label = result.status === "Paid" ? "Full payment successful" : "Partial payment successful";
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
      <div className="rounded-xl border border-border p-3 text-sm space-y-1.5 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Fee Amount</span>
          <span className="shrink-0">₹{fee.amount.toLocaleString()}</span>
        </div>
        {fee.discount > 0 && (
          <div className="flex items-center justify-between gap-2 text-success">
            <span className="shrink-0">Discount</span>
            <span className="shrink-0">-₹{fee.discount.toLocaleString()}</span>
          </div>
        )}
        {fee.fine > 0 && (
          <div className="flex items-center justify-between gap-2 text-destructive">
            <span className="shrink-0">Fine</span>
            <span className="shrink-0">+₹{fee.fine.toLocaleString()}</span>
          </div>
        )}
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Net Payable</span>
          <span className="font-medium shrink-0">₹{total.toLocaleString()}</span>
        </div>
        {alreadyPaid > 0 && (
          <div className="flex items-center justify-between gap-2 text-success">
            <span className="shrink-0">Already Paid</span>
            <span className="shrink-0">-₹{alreadyPaid.toLocaleString()}</span>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-2 font-semibold">
          <span className="shrink-0">Remaining</span>
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
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Full (₹{remaining.toLocaleString()})</span>
          </Button>
          <Button
            type="button"
            variant={paymentType === "partial" ? "default" : "outline"}
            className="flex-1 gap-1.5 text-xs sm:text-sm"
            onClick={() => setPaymentType("partial")}
          >
            <CreditCard className="h-3.5 w-3.5 shrink-0" />
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
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 font-semibold">
            <span className="shrink-0">Paying:</span>
            <span className="text-primary shrink-0">₹{effectiveAmount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs mt-0.5">
            <span className="shrink-0">Status after payment:</span>
            <span className={`shrink-0 ${willBeFullyPaid ? "text-success font-medium" : "text-warning font-medium"}`}>
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

export default function ParentPayFeesPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: fees, isLoading } = useFeesFor(selectedChildId ?? undefined);
  const { data: student } = useStudent(selectedChildId ?? undefined);
  const { data: school } = useSchoolProfile();
  const queryClient = useQueryClient();
  const [payingFor, setPayingFor] = useState<ApiFee | null>(null);
  const [receipt, setReceipt] = useState<{ fee: ApiFee; receiptNo: string; paidAmount?: number } | null>(null);

  const rows = (fees ?? []).filter((f) => f.status !== "Paid");

  function handlePaymentDone(receiptNo?: string, paidAmount?: number) {
    const fee = payingFor;
    setPayingFor(null);
    if (receiptNo && fee) {
      queryClient.invalidateQueries({ queryKey: [`fees-${selectedChildId}`] });
      setReceipt({ fee, receiptNo, paidAmount });
    }
  }

  return (
    <div>
      <PageHeader title="Pay Fees" description="Pending fees for this child." breadcrumb={["Dashboard", "Fees", "Pay Fees"]} />
      <ChildSwitcher />

      <div className="panel">
        {childrenLoading || isLoading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing pending" description="This child has no pending fees right now." icon={Wallet} />
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
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => {
                  const fPayable = payable(f);
                  const fPaid = f.paid_amount ?? 0;
                  const fRemaining = Math.max(0, fPayable - fPaid);
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.fee_type}</TableCell>
                      <TableCell className="font-mono">₹{fPayable.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-success">₹{fPaid.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-destructive">₹{fRemaining.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" /> {f.due_date ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={f.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" className="gap-1" onClick={() => setPayingFor(f)}>
                          <CreditCard className="h-3.5 w-3.5" />
                          {f.status === "Partial" ? "Pay Remaining" : "Pay Now"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={Boolean(payingFor)} onOpenChange={(o) => !o && setPayingFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay Fee — {payingFor?.fee_type}</DialogTitle>
            <DialogDescription>Choose to pay the full remaining amount or make a partial payment.</DialogDescription>
          </DialogHeader>
          {payingFor && <PayNowDialog fee={payingFor} onDone={handlePaymentDone} />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(receipt)} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-lg print:max-w-none">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          {receipt && (
            <SectionCard>
              <div className="space-y-2 p-2 text-sm">
                <div className="flex justify-between border-b border-dashed border-border pb-2">
                  <span className="font-display font-bold text-primary">{school?.name ?? "School"}</span>
                  <span className="text-xs text-muted-foreground">{receipt.receiptNo}</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Student</span><span>{student?.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fee Type</span><span>{receipt.fee.fee_type}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Payable</span><span>₹{payable(receipt.fee).toLocaleString()}</span></div>
                <div className="flex justify-between font-semibold">
                  <span>Amount Paid (this transaction)</span>
                  <span className="text-primary">₹{(receipt.paidAmount ?? payable(receipt.fee)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{receipt.fee.paid_on ?? new Date().toISOString().slice(0, 10)}</span></div>
              </div>
              <Button className="mt-4 w-full" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print / Download
              </Button>
            </SectionCard>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
