"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, ShieldCheck } from "lucide-react";
import { PageHeader, EmptyState, FilterSelect } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useStudents,
  useTransport,
  useTransportComplaints,
  type ApiTransportComplaint,
  type TransportComplaintCategory,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const CATEGORIES: TransportComplaintCategory[] = [
  "Safety",
  "Delay",
  "Behavior",
  "Cleanliness",
  "Emergency",
  "Other",
];
const NONE = "__none__";

function ReportDialog({
  vehicles,
  onDone,
}: {
  vehicles: { id: string; number: string | null }[];
  onDone: () => void;
}) {
  const [category, setCategory] = useState<TransportComplaintCategory>("Other");
  const [vehicleId, setVehicleId] = useState(NONE);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("A description is required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/transport-complaints", {
        category,
        vehicleId: vehicleId === NONE ? null : vehicleId,
        description: description.trim(),
      });
      toast.success("Complaint logged");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to log complaint");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Log Complaint / Incident</DialogTitle>
        <DialogDescription>Record a safety issue, complaint or emergency for the transport team.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TransportComplaintCategory)}>
              <SelectTrigger className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Vehicle (optional)</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Not linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not linked</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.number ?? v.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Log Complaint"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ResolveDialog({
  complaint,
  onOpenChange,
  onDone,
}: {
  complaint: ApiTransportComplaint | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState(complaint?.status ?? "Open");
  const [notes, setNotes] = useState(complaint?.resolution_notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!complaint) return;
    setSaving(true);
    try {
      await api.patch(`/transport-complaints/${complaint.id}`, { status, resolutionNotes: notes.trim() || null });
      toast.success("Complaint updated");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update complaint");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!complaint} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Complaint</DialogTitle>
          <DialogDescription>{complaint?.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Resolution Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TransportComplaintsPage() {
  const { data: complaints, isLoading } = useTransportComplaints();
  const { data: vehicles } = useTransport();
  const { data: students } = useStudents();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<ApiTransportComplaint | null>(null);

  const vehiclesById = useMemo(() => new Map((vehicles ?? []).map((v) => [v.id, v.number])), [vehicles]);
  const studentsById = useMemo(() => new Map((students ?? []).map((s) => [s.id, s.name])), [students]);

  const filtered = (complaints ?? []).filter((c) => statusFilter === "all" || c.status === statusFilter);
  const openCount = (complaints ?? []).filter((c) => c.status === "Open").length;

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["transport-complaints"] });
  }

  return (
    <div>
      <PageHeader
        title="Safety & Complaints"
        description="Incidents, complaints and emergency records for the transport fleet."
        breadcrumb={["Dashboard", "Transport", "Complaints"]}
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Log Complaint
              </Button>
            </DialogTrigger>
            <ReportDialog
              vehicles={vehicles ?? []}
              onDone={async () => {
                await invalidate();
                setAddOpen(false);
              }}
            />
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="panel p-3.5">
          <p className="text-xs text-muted-foreground">Total Records</p>
          <p className="mt-0.5 font-display text-xl font-bold">{(complaints ?? []).length}</p>
        </div>
        <div className="panel p-3.5">
          <p className="text-xs text-muted-foreground">Open</p>
          <p className="mt-0.5 font-display text-xl font-bold text-destructive">{openCount}</p>
        </div>
      </div>

      <SectionCard
        bodyClassName="p-0"
        action={
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={["Open", "In Progress", "Resolved", "Closed"]}
            placeholder="All Statuses"
          />
        }
      >
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="No complaints or incidents" description="Reports raised by staff, parents or students appear here." icon={ShieldCheck} />
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((c) => (
              <div key={c.id} className="flex items-start gap-3 p-3.5">
                <span
                  className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    c.category === "Emergency" || c.category === "Safety"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{c.category}</p>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{c.description}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {c.raised_by_role} · {c.student_id ? (studentsById.get(c.student_id) ?? "Student") : "General"}
                    {c.vehicle_id ? ` · ${vehiclesById.get(c.vehicle_id) ?? "Vehicle"}` : ""} ·{" "}
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                  {c.resolution_notes && (
                    <p className="mt-1 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                      {c.resolution_notes}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setResolveTarget(c)}>
                  Update
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <ResolveDialog
        complaint={resolveTarget}
        onOpenChange={(o) => !o && setResolveTarget(null)}
        onDone={async () => {
          await invalidate();
          setResolveTarget(null);
        }}
      />
    </div>
  );
}
