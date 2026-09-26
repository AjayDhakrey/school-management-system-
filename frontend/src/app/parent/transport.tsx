"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Bus, MapPin, Phone, Clock3, AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
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
import { useTransportFor, type TransportComplaintCategory } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";
import { api, ApiError } from "@/lib/api";

const CATEGORIES: TransportComplaintCategory[] = [
  "Safety",
  "Delay",
  "Behavior",
  "Cleanliness",
  "Emergency",
  "Other",
];

function ReportIssueDialog({
  studentId,
  vehicleId,
  onDone,
}: {
  studentId: string;
  vehicleId?: string;
  onDone: () => void;
}) {
  const [category, setCategory] = useState<TransportComplaintCategory>("Other");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("Please describe the issue");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/transport-complaints", {
        studentId,
        vehicleId: vehicleId ?? null,
        category,
        description: description.trim(),
      });
      toast.success("Thanks — your report has been sent to the transport office");
      setDescription("");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to send report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Report a Transport Issue</DialogTitle>
        <DialogDescription>Let the transport office know about a safety concern, delay or complaint.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
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
          <Label>Details</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send Report"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Bus; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function ParentTransportPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: vehicle, isLoading } = useTransportFor(selectedChildId ?? undefined);
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div>
      <PageHeader title="Transport" description="Assigned bus and route for this child." breadcrumb={["Dashboard", "Transport"]} />
      <ChildSwitcher />

      {childrenLoading || isLoading ? (
        <CardSkeleton count={2} />
      ) : !vehicle ? (
        <div className="panel">
          <EmptyState title="No transport assigned" description="This child isn't assigned to a school vehicle yet." icon={Bus} />
        </div>
      ) : (
        <SectionCard
          title={`Vehicle ${vehicle.number ?? ""}`}
          subtitle={vehicle.route ?? ""}
          action={
            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Report Issue
                </Button>
              </DialogTrigger>
              {selectedChildId && (
                <ReportIssueDialog
                  studentId={selectedChildId}
                  vehicleId={vehicle.id}
                  onDone={() => setReportOpen(false)}
                />
              )}
            </Dialog>
          }
        >
          <Row icon={MapPin} label="Route" value={vehicle.route ?? "—"} />
          <Row icon={Bus} label="Driver" value={vehicle.driver ?? "—"} />
          <Row icon={Phone} label="Driver Phone" value={vehicle.driver_phone ?? "—"} />
          <Row icon={Clock3} label="Pickup" value={`${vehicle.pickup_point ?? "—"} · ${vehicle.pickup_time ?? "—"}`} />
          <Row icon={Clock3} label="Drop" value={`${vehicle.drop_point ?? "—"} · ${vehicle.drop_time ?? "—"}`} />
        </SectionCard>
      )}
    </div>
  );
}
