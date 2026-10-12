"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Clock3, Plus, XCircle } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { Button } from "@/components/ui/button";
import { ApplyLeaveForm } from "@/components/shared/ApplyLeaveForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { LeaveRequestList } from "@/components/shared/LeaveRequestList";
import { useLeaveRequestsForChild } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";
import { api, ApiError } from "@/lib/api";

function ParentApplyLeave({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  return (
    <ApplyLeaveForm
      idPrefix="parent-leave"
      onCancel={onDone}
      onSubmit={async (values) => {
        try {
          await api.post("/leave", { requesterType: "STUDENT", studentId, ...values });
          await queryClient.invalidateQueries({ queryKey: [`leave-child-${studentId}`] });
          toast.success("Leave request submitted");
          onDone();
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Failed to submit leave request");
        }
      }}
    />
  );
}

export default function ParentLeavePage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: leave, isLoading } = useLeaveRequestsForChild(selectedChildId ?? undefined);
  const [open, setOpen] = useState(false);

  const rows = leave ?? [];
  const pending = rows.filter((l) => l.status === "Pending").length;
  const approved = rows.filter((l) => l.status === "Approved").length;
  const rejected = rows.filter((l) => l.status === "Rejected").length;

  return (
    <div>
      <PageHeader
        title="Leave Requests"
        description="Apply for leave on behalf of your child and track status."
        breadcrumb={["Dashboard", "Leave Requests"]}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!selectedChildId}>
                <Plus className="h-4 w-4" /> Apply Leave
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto rounded-2xl">
              <DialogHeader className="text-left">
                <DialogTitle>Apply for Leave</DialogTitle>
                <DialogDescription>Request leave on behalf of your child.</DialogDescription>
              </DialogHeader>
              {selectedChildId && <ParentApplyLeave studentId={selectedChildId} onDone={() => setOpen(false)} />}
            </DialogContent>
          </Dialog>
        }
      />
      <ChildSwitcher />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Pending" value={pending} icon={Clock3} tone="warning" />
        <InfoCard label="Approved" value={approved} icon={CheckCircle2} tone="success" />
        <InfoCard label="Rejected" value={rejected} icon={XCircle} tone="danger" />
      </div>

      <div className="panel">
        {childrenLoading || isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState title="No leave requests yet" description="Apply for leave on behalf of your child to see it here." icon={ClipboardList} />
        ) : (
          <LeaveRequestList rows={rows} />
        )}
      </div>
    </div>
  );
}
