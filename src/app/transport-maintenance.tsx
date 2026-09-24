"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Wrench } from "lucide-react";
import { PageHeader, EmptyState, Pager, usePaged } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { InfoCard } from "@/components/shared/InfoCard";
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
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTransport, useTransportMaintenance, type ApiTransportMaintenance } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

function AddRecordDialog({
  vehicles,
  onDone,
}: {
  vehicles: { id: string; number: string | null }[];
  onDone: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [odometer, setOdometer] = useState("");
  const [nextServiceDate, setNextServiceDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vehicleId) {
      toast.error("Select a vehicle");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/transport-maintenance", {
        vehicleId,
        serviceDate,
        serviceType: serviceType.trim() || null,
        description: description.trim() || null,
        cost: Number(cost) || 0,
        vendor: vendor.trim() || null,
        odometerReading: odometer ? Number(odometer) : null,
        nextServiceDate: nextServiceDate || null,
      });
      toast.success("Maintenance record added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add record");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Add Maintenance Record</DialogTitle>
        <DialogDescription>Log a service, repair or inspection for a vehicle.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.number ?? v.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Service Date</Label>
            <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Service Type</Label>
          <Input value={serviceType} onChange={(e) => setServiceType(e.target.value)} placeholder="e.g. Oil change, Brake service" />
        </div>
        <div className="grid gap-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Cost (₹)</Label>
            <Input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Vendor</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Odometer Reading</Label>
            <Input type="number" min={0} value={odometer} onChange={(e) => setOdometer(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Next Service Date</Label>
            <Input type="date" value={nextServiceDate} onChange={(e) => setNextServiceDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Add Record"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function TransportMaintenancePage() {
  const { data: vehicles } = useTransport();
  const { data: records, isLoading } = useTransportMaintenance();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const vehiclesById = useMemo(() => new Map((vehicles ?? []).map((v) => [v.id, v.number])), [vehicles]);
  const rowsAll = records ?? [];
  const { rows, pageCount } = usePaged(rowsAll, page, 10);

  const totalCost = rowsAll.reduce((s, r) => s + r.cost, 0);
  const monthStr = new Date().toISOString().slice(0, 7);
  const thisMonthCost = rowsAll
    .filter((r) => r.service_date.slice(0, 7) === monthStr)
    .reduce((s, r) => s + r.cost, 0);
  const upcoming = rowsAll.filter(
    (r) => r.next_service_date && r.next_service_date >= new Date().toISOString().slice(0, 10),
  ).length;

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["transport-maintenance-all"] });
  }

  async function handleDelete(r: ApiTransportMaintenance) {
    if (!confirm("Remove this maintenance record?")) return;
    try {
      await api.delete(`/transport-maintenance/${r.id}`);
      toast.success("Record removed");
      await invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove record");
    }
  }

  return (
    <div>
      <PageHeader
        title="Vehicle Maintenance"
        description="Service history, costs and upcoming maintenance."
        breadcrumb={["Dashboard", "Transport", "Maintenance"]}
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Record
              </Button>
            </DialogTrigger>
            <AddRecordDialog
              vehicles={vehicles ?? []}
              onDone={async () => {
                await invalidate();
                setAddOpen(false);
              }}
            />
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <InfoCard label="Total Cost" value={`₹${totalCost.toLocaleString()}`} icon={Wrench} tone="navy" />
        <InfoCard label="This Month" value={`₹${thisMonthCost.toLocaleString()}`} icon={Wrench} tone="info" />
        <InfoCard label="Upcoming Services" value={upcoming} icon={Wrench} tone="warning" />
      </div>

      <SectionCard bodyClassName="p-0">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading records…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No maintenance records yet" description="Records you add will appear here." icon={Wrench} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Vehicle</th>
                    <th className="px-4 py-2.5 font-medium">Service</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Next Service</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{vehiclesById.get(r.vehicle_id) ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <p>{r.service_type ?? "—"}</p>
                        {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.service_date}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.next_service_date ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">₹{r.cost.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2.5 p-4 md:hidden">
              {rows.map((r) => (
                <div key={r.id} className="min-w-0 overflow-hidden rounded-xl border border-border p-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{vehiclesById.get(r.vehicle_id) ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.service_type ?? "—"} · {r.service_date}</p>
                    </div>
                    <span className="shrink-0 font-semibold">₹{r.cost.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
            <Pager page={page} pageCount={pageCount} onPage={setPage} total={rowsAll.length} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
