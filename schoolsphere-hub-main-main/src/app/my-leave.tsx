"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Clock3, CheckCircle2, XCircle, Plus } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLeaveRequests } from "@/hooks/useApi";
import { api } from "@/lib/api";

const LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Family Function", "Emergency", "Other"];

function ApplyLeaveForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState(LEAVE_TYPES[0]!);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromDate || !toDate) return toast.error("Select start and end dates");
    if (new Date(toDate) < new Date(fromDate)) return toast.error("End date must be after start date");
    setSubmitting(true);
    try {
      await api.post("/leave", { fromDate, toDate, reason: `${type}: ${reason}` });
      await queryClient.invalidateQueries({ queryKey: ["leave-all"] });
      toast.success("Leave request submitted");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit leave request");
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
          <Label htmlFor="leave-from">Start Date</Label>
          <Input id="leave-from" type="date" required min={new Date().toISOString().slice(0, 10)} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="leave-to">End Date</Label>
          <Input id="leave-to" type="date" required min={fromDate || new Date().toISOString().slice(0, 10)} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="leave-reason">Reason</Label>
        <Textarea id="leave-reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Briefly describe the reason" />
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
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Apply for Leave</DialogTitle>
              </DialogHeader>
              <ApplyLeaveForm onDone={() => setOpen(false)} />
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
