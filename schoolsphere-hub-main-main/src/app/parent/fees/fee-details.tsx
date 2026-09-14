"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock3, Wallet } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFeesFor } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

export default function ParentFeeDetailsPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: fees, isLoading } = useFeesFor(selectedChildId ?? undefined);

  const rows = fees ?? [];
  const total = useMemo(() => rows.reduce((sum, f) => sum + f.amount - f.discount + f.fine, 0), [rows]);
  const paid = rows.filter((f) => f.status === "Paid").reduce((sum, f) => sum + f.amount - f.discount + f.fine, 0);
  const pending = total - paid;

  return (
    <div>
      <PageHeader title="Fee Details" description="Full fee breakdown for this child." breadcrumb={["Dashboard", "Fees", "Fee Details"]} />
      <ChildSwitcher />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Fees" value={`₹${total.toLocaleString()}`} icon={Wallet} tone="navy" />
        <InfoCard label="Paid" value={`₹${paid.toLocaleString()}`} icon={CheckCircle2} tone="success" />
        <InfoCard label="Pending" value={`₹${pending.toLocaleString()}`} icon={Clock3} tone="warning" />
      </div>

      <div className="panel">
        {childrenLoading || isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState title="No fee records found" description="Your school hasn't added fee records for this child yet." icon={Wallet} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.fee_type}</TableCell>
                    <TableCell>₹{(f.amount - f.discount + f.fine).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{f.due_date ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={f.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{f.receipt_no ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
