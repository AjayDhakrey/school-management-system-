"use client";

import { useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
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
import { feeTitle } from "@/lib/fees";
import { FeeReceipt } from "@/components/shared/FeeReceipt";

export default function ParentPaymentHistoryPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: fees, isLoading } = useFeesFor(selectedChildId ?? undefined);
  const { data: student } = useStudent(selectedChildId ?? undefined);
  const { data: school } = useSchoolProfile();
  const [receipt, setReceipt] = useState<ApiFee | null>(null);

  const rows = (fees ?? [])
    .filter((f) => f.status === "Paid")
    .sort((a, b) => (b.paid_on ?? "").localeCompare(a.paid_on ?? ""));

  return (
    <div>
      <PageHeader
        title="Payment History"
        description="Fees already paid for this child."
        breadcrumb={["Dashboard", "Fees", "Payment History"]}
      />
      <ChildSwitcher />

      <div className="panel">
        {childrenLoading || isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Payments you make for this child will show up here."
            icon={CheckCircle2}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Amount Paid</TableHead>
                  <TableHead>Paid On</TableHead>
                  <TableHead>Receipt No.</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{feeTitle(f)}</TableCell>
                    <TableCell>
                      ₹{(f.paid_amount ?? f.amount - f.discount + f.fine).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{f.paid_on ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{f.receipt_no ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setReceipt(f)}>
                        <Printer className="h-3.5 w-3.5" /> Receipt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
