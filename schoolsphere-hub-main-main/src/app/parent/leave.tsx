"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Clock3, Plus, XCircle } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLeaveRequestsForChild } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";
import { api, ApiError } from "@/lib/api";

const LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Family Function", "Emergency", "Other"];

function ApplyLeaveForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState(LEAVE_TYPES[0]!);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromDate || !toDate) {
      toast.error("Select start and end dates");
      return;
    }
    if (new Date(toDate) < new Date(fromDate)) {
      toast.error("End date must be after start date");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/leave", { requesterType: "STUDENT", studentId, fromDate, toDate, reason: `${type}: ${reason}` });
      await queryClient.invalidateQueries({ queryKey: [`leave-child-${studentId}`] });
      toast.success("Leave request submitted");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label>Leave Type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAVE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="parent-leave-from">Start Date</Label>
          <Input id="parent-leave-from" type="date" required min={new Date().toISOString().slice(0, 10)} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="parent-leave-to">End Date</Label>
          <Input id="parent-leave-to" type="date" required min={fromDate || new Date().toISOString().slice(0, 10)} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="parent-leave-reason">Reason</Label>
        <Textarea id="parent-leave-reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Briefly describe the reason" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Submit Request
        </Button>
      </DialogFooter>
    </form>
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
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Apply for Leave</DialogTitle>
              </DialogHeader>
              {selectedChildId && <ApplyLeaveForm studentId={selectedChildId} onDone={() => setOpen(false)} />}
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="max-w-[240px] truncate font-medium">{l.reason ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.from_date}</TableCell>
                    <TableCell className="text-muted-foreground">{l.to_date}</TableCell>
                    <TableCell>
                      <StatusBadge status={l.status} />
                    </TableCell>
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
