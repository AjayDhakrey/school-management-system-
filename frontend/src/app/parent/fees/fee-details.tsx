"use client";

import { useMemo, useState } from "react";
import { Calendar, CheckCircle2, Clock3, FileCheck2, Printer, Receipt, Wallet } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFeesFor, useStudent, useSchoolProfile, type ApiFee } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";
import { feeTitle, sortStudentFees } from "@/lib/fees";
import { FeeReceipt } from "@/components/shared/FeeReceipt";
import { cn } from "@/lib/utils";

function formatFeeDate(value: string | null | undefined) {
  if (!value) return "—";

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ParentFeeDetailsPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: fees, isLoading } = useFeesFor(selectedChildId ?? undefined);
  const { data: student } = useStudent(selectedChildId ?? undefined);
  const { data: school } = useSchoolProfile();

  const [receipt, setReceipt] = useState<ApiFee | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");

  const rows = sortStudentFees(fees ?? []);
  const total = useMemo(
    () => rows.reduce((sum, f) => sum + f.amount - f.discount + f.fine, 0),
    [rows],
  );
  const paid = rows
    .filter((f) => f.status === "Paid")
    .reduce((sum, f) => sum + f.amount - f.discount + f.fine, 0);
  const pending = total - paid;

  const paidCount = rows.filter((f) => f.status === "Paid").length;
  const pendingCount = rows.filter((f) => f.status !== "Paid").length;

  const filteredRows = useMemo(() => {
    if (filter === "pending") return rows.filter((f) => f.status !== "Paid");
    if (filter === "paid") return rows.filter((f) => f.status === "Paid");
    return rows;
  }, [rows, filter]);

  return (
    <div>
      <PageHeader
        title="Fee Details"
        description="Full fee breakdown and payment records for this child."
        breadcrumb={["Dashboard", "Fees", "Fee Details"]}
      />
      <ChildSwitcher />

      {/* Summary stats: 3 columns fit mobile neatly */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
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
      </div>

      <div className="panel">
        {childrenLoading || isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No fee records found"
            description="Your school hasn't added fee records for this child yet."
            icon={Wallet}
          />
        ) : (
          <div>
            {/* Filter Pills */}
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 rounded-xl bg-muted/60 p-1">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    filter === "all"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  All ({rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("pending")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    filter === "pending"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Pending ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("paid")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    filter === "paid"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Paid ({paidCount})
                </button>
              </div>

              <span className="hidden text-xs text-muted-foreground sm:inline">
                Showing {filteredRows.length} of {rows.length} records
              </span>
            </div>

            {filteredRows.length === 0 ? (
              <div className="py-10 text-center">
                <FileCheck2 className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-2 text-sm font-medium text-foreground">No {filter} fees found</p>
                <p className="text-xs text-muted-foreground">
                  {filter === "pending"
                    ? "Great news! All fee dues are cleared."
                    : "No records match this filter."}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile View: Modern Native Mobile App Card Feed */}
                <div className="space-y-3 md:hidden">
                  {filteredRows.map((f) => {
                    const totalAmount = f.amount - f.discount + f.fine;
                    const isPaid = f.status === "Paid";
                    return (
                      <div
                        key={f.id}
                        className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs space-y-3 transition-all hover:border-primary/30"
                      >
                        {/* Top: Category Tag, Title, and Status Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              <Receipt className="h-2.5 w-2.5 text-primary" />
                              {f.fee_type || "Fee"}
                            </span>
                            <h4 className="text-sm font-semibold leading-snug text-foreground">
                              {feeTitle(f)}
                            </h4>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <StatusBadge status={f.status} />
                          </div>
                        </div>

                        {/* Middle: Amount & Dates */}
                        <div className="flex items-end justify-between border-t border-border/50 pt-2.5">
                          <div>
                            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Amount
                            </span>
                            <div className="mt-0.5 flex items-baseline gap-1.5">
                              <span className="text-base font-bold text-foreground sm:text-lg">
                                ₹{totalAmount.toLocaleString()}
                              </span>
                              {f.discount > 0 && (
                                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                  (-₹{f.discount})
                                </span>
                              )}
                              {f.fine > 0 && (
                                <span className="text-[11px] font-medium text-destructive">
                                  (+₹{f.fine} fine)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              {isPaid ? "Paid On" : "Due Date"}
                            </span>
                            <span className="mt-0.5 inline-flex items-center justify-end gap-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                              <Calendar className="h-3 w-3 shrink-0" />
                              {formatFeeDate(isPaid ? (f.paid_on ?? f.due_date) : f.due_date)}
                            </span>
                          </div>
                        </div>

                        {!isPaid && (
                          <div className="pt-0.5">
                            <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                              <span className="flex items-center gap-1.5">
                                <Clock3 className="h-3.5 w-3.5 shrink-0" /> Due:{" "}
                                {formatFeeDate(f.due_date)}
                              </span>
                              <span className="text-[11px] font-semibold">Pay at office</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View: Full Spacious Table */}
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fee Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Receipt / Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{feeTitle(f)}</TableCell>
                          <TableCell className="font-semibold">
                            ₹{(f.amount - f.discount + f.fine).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatFeeDate(f.due_date)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={f.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            {f.receipt_no || f.status === "Paid" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => setReceipt(f)}
                              >
                                <Printer className="h-3.5 w-3.5 text-primary" />
                                <span>{f.receipt_no ?? "Receipt"}</span>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Printable / Viewable Receipt Dialog */}
      <Dialog open={Boolean(receipt)} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="receipt-print-dialog max-w-lg print:max-w-none">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          {receipt && <FeeReceipt fee={receipt} student={student} school={school} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
