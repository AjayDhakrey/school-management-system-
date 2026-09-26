"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Printer, RefreshCw, Search } from "lucide-react";
import { PageHeader, EmptyState, Pager, usePaged } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useFeePayments, useStudents, type ApiFeePayment } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

function amountFor(p: ApiFeePayment) {
  return Math.max(0, p.amount - p.refunded_amount);
}

/** Reprint/view of one payment's receipt. */
function ReceiptDialog({ payment, studentName }: { payment: ApiFeePayment; studentName: string }) {
  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Receipt {payment.receipt_no}</DialogTitle>
        <DialogDescription>Recorded {new Date(payment.paid_on).toLocaleString()}</DialogDescription>
      </DialogHeader>
      <div id="receipt-print" className="space-y-2 rounded-xl border border-border p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Student</span>
          <span className="font-medium">{studentName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-semibold">₹{payment.amount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Method</span>
          <span>{payment.method}</span>
        </div>
        {payment.transaction_reference && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reference</span>
            <span>{payment.transaction_reference}</span>
          </div>
        )}
        {payment.refunded_amount > 0 && (
          <div className="flex justify-between text-destructive">
            <span>Refunded</span>
            <span>-₹{payment.refunded_amount.toLocaleString()}</span>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button className="gap-1.5" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RefundDialog({ payment, onDone }: { payment: ApiFeePayment; onDone: () => void }) {
  const refundable = amountFor(payment);
  const [amount, setAmount] = useState(String(refundable));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0 || value > refundable) {
      toast.error(`Enter an amount up to ₹${refundable.toLocaleString()}`);
      return;
    }
    if (!reason.trim()) {
      toast.error("A refund reason is required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/fee-refunds/issue", { feePaymentId: payment.id, amount: value, reason: reason.trim() });
      toast.success(`₹${value.toLocaleString()} refunded`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to issue refund");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Refund Payment {payment.receipt_no}</DialogTitle>
        <DialogDescription>
          Refundable up to ₹{refundable.toLocaleString()} of this payment.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="refund-amount">Refund Amount (₹)</Label>
          <Input
            id="refund-amount"
            type="number"
            min={1}
            max={refundable}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="refund-reason">Reason</Label>
          <Textarea
            id="refund-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being refunded?"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button type="submit" variant="destructive" disabled={submitting} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> {submitting ? "Refunding…" : "Issue Refund"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function PaymentsPage({ mode = "transactions" }: { mode?: "transactions" | "refunds" }) {
  const { data: payments, isLoading } = useFeePayments();
  const { data: students } = useStudents();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [receiptFor, setReceiptFor] = useState<ApiFeePayment | null>(null);
  const [refundFor, setRefundFor] = useState<ApiFeePayment | null>(null);

  const studentsById = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students]);
  const studentName = (id: string) => studentsById.get(id)?.name ?? "Unknown Student";

  const rows = payments ?? [];
  const refundable = rows.filter((p) => amountFor(p) > 0 && p.status !== "Refunded");
  const base = mode === "refunds" ? refundable : rows;

  const filtered = useMemo(
    () =>
      base.filter(
        (p) =>
          search === "" ||
          p.receipt_no.toLowerCase().includes(search.toLowerCase()) ||
          studentName(p.student_id).toLowerCase().includes(search.toLowerCase()) ||
          (p.transaction_reference ?? "").toLowerCase().includes(search.toLowerCase()),
      ),
    [base, search, students],
  );
  const { rows: paged, pageCount } = usePaged(filtered, page, 10);

  const totalCollected = rows.reduce((s, p) => s + p.amount, 0);
  const totalRefunded = rows.reduce((s, p) => s + p.refunded_amount, 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCollected = rows
    .filter((p) => p.paid_on.slice(0, 10) === todayStr)
    .reduce((s, p) => s + p.amount, 0);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["fee-payments-all"] });
    await queryClient.invalidateQueries({ queryKey: ["fees"] });
  }

  return (
    <div>
      <PageHeader
        title={mode === "refunds" ? "Refunds" : "Payments"}
        description={
          mode === "refunds"
            ? "Issue and review refunds against collected fee payments."
            : "Every fee payment collected, with receipts and refund history."
        }
        breadcrumb={["Dashboard", mode === "refunds" ? "Refunds" : "Payments"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Collected" value={`₹${totalCollected.toLocaleString()}`} icon={CreditCard} tone="success" />
        <InfoCard label="Today's Collection" value={`₹${todayCollected.toLocaleString()}`} icon={CreditCard} tone="navy" />
        <InfoCard label="Total Refunded" value={`₹${totalRefunded.toLocaleString()}`} icon={RefreshCw} tone="danger" />
        <InfoCard label="Transactions" value={rows.length} icon={CreditCard} tone="gold" />
      </div>

      <SectionCard
        title={mode === "refunds" ? "Refundable Payments" : "Transaction Ledger"}
        subtitle={`${filtered.length} of ${base.length} payments`}
        bodyClassName="p-0"
        action={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 bg-surface pl-9 text-sm"
              placeholder="Search receipt, student, reference…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        }
      >
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading payments…</p>
        ) : paged.length === 0 ? (
          <EmptyState
            title={mode === "refunds" ? "Nothing left to refund" : "No payments yet"}
            description={
              mode === "refunds"
                ? "Fully refunded or unpaid records won't show up here."
                : "Fee payments collected from students will appear here."
            }
            icon={CreditCard}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Receipt</th>
                    <th className="px-4 py-2.5 font-medium">Student</th>
                    <th className="px-4 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 font-medium">Paid On</th>
                    <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{p.receipt_no}</td>
                      <td className="px-4 py-2.5 font-medium">{studentName(p.student_id)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.method}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{new Date(p.paid_on).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">₹{p.amount.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Dialog open={receiptFor?.id === p.id} onOpenChange={(o) => !o && setReceiptFor(null)}>
                            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setReceiptFor(p)}>
                              <Printer className="h-3.5 w-3.5" /> Receipt
                            </Button>
                            {receiptFor?.id === p.id && (
                              <ReceiptDialog payment={p} studentName={studentName(p.student_id)} />
                            )}
                          </Dialog>
                          {amountFor(p) > 0 && (
                            <Dialog open={refundFor?.id === p.id} onOpenChange={(o) => !o && setRefundFor(null)}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 text-destructive hover:text-destructive"
                                onClick={() => setRefundFor(p)}
                              >
                                <RefreshCw className="h-3.5 w-3.5" /> Refund
                              </Button>
                              {refundFor?.id === p.id && (
                                <RefundDialog
                                  payment={p}
                                  onDone={async () => {
                                    await invalidate();
                                    setRefundFor(null);
                                  }}
                                />
                              )}
                            </Dialog>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-2.5 p-4 md:hidden">
              {paged.map((p) => (
                <div key={p.id} className="min-w-0 overflow-hidden rounded-xl border border-border p-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{studentName(p.student_id)}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{p.receipt_no}</p>
                    </div>
                    <StatusBadge status={p.status} className="shrink-0" />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.method} · {new Date(p.paid_on).toLocaleDateString()}</span>
                    <span className="font-semibold text-foreground">₹{p.amount.toLocaleString()}</span>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <Dialog open={receiptFor?.id === p.id} onOpenChange={(o) => !o && setReceiptFor(null)}>
                      <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => setReceiptFor(p)}>
                        <Printer className="h-3.5 w-3.5" /> Receipt
                      </Button>
                      {receiptFor?.id === p.id && (
                        <ReceiptDialog payment={p} studentName={studentName(p.student_id)} />
                      )}
                    </Dialog>
                    {amountFor(p) > 0 && (
                      <Dialog open={refundFor?.id === p.id} onOpenChange={(o) => !o && setRefundFor(null)}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-destructive hover:text-destructive"
                          onClick={() => setRefundFor(p)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Refund
                        </Button>
                        {refundFor?.id === p.id && (
                          <RefundDialog
                            payment={p}
                            onDone={async () => {
                              await invalidate();
                              setRefundFor(null);
                            }}
                          />
                        )}
                      </Dialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
