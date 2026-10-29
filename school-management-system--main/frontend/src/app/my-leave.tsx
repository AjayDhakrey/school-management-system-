"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Clock3, CheckCircle2, XCircle, Plus } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { ApplyLeaveForm } from "@/components/shared/ApplyLeaveForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { LeaveRequestList } from "@/components/shared/LeaveRequestList";
import { useLeaveRequests } from "@/hooks/useApi";
import { api } from "@/lib/api";

function StudentApplyLeave({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  return (
    <ApplyLeaveForm
      idPrefix="leave"
      onCancel={onDone}
      onSubmit={async (values) => {
        try {
          await api.post("/leave", values);
          await queryClient.invalidateQueries({ queryKey: ["leave-all"] });
          toast.success("Leave request submitted");
          onDone();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to submit leave request");
        }
      }}
    />
  );
}

export default function MyLeavePage() {
  const { data: leave, isLoading } = useLeaveRequests();
  const [open, setOpen] = useState(false);

  const rows = leave ?? [];
  const pending = rows.filter((l) => l.status === "Pending").length;
  const approved = rows.filter((l) => l.status === "Approved").length;
  const rejected = rows.filter((l) => l.status === "Rejected").length;

  return (
    <div>
      <PageHeader
        title="My Leave"
        description="Apply for leave and track your requests."
        breadcrumb={["Dashboard", "My Leave"]}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" /> Apply Leave
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto rounded-2xl">
              <DialogHeader className="text-left">
                <DialogTitle>Apply for Leave</DialogTitle>
                <DialogDescription>Submit a leave request for approval.</DialogDescription>
              </DialogHeader>
              <StudentApplyLeave onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Pending" value={pending} icon={Clock3} tone="warning" />
        <InfoCard label="Approved" value={approved} icon={CheckCircle2} tone="success" />
        <InfoCard label="Rejected" value={rejected} icon={XCircle} tone="danger" />
      </div>

      <div className="panel">
        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState title="No leave requests yet" description="Apply for leave to see it here." icon={ClipboardList} />
        ) : (
          <LeaveRequestList rows={rows} />
        )}
      </div>
    </div>
  );
}
