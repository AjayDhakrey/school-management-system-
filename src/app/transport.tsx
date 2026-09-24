"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bus,
  Route as RouteIcon,
  Users,
  Wrench,
  Plus,
  Phone,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  EmptyState,
  Initials,
} from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard, ProgressBar } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useMyTransport, useTransport, useStudents, type ApiVehicle } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

type VehiclePayload = {
  number: string;
  route: string;
  driver: string;
  driverPhone: string;
  capacity: number;
  status: ApiVehicle["status"];
  stops: { name: string; time: string }[];
};

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentTransportView />;
  return <AdminTransportView />;
}

function StudentTransportView() {
  const { data: assignment, isLoading } = useMyTransport();

  return (
    <div>
      <PageHeader
        title="Transport"
        description="Your assigned bus and route details."
        breadcrumb={["Dashboard", "Transport"]}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !assignment ? (
        <EmptyState
          title="No transport assigned"
          description="You haven't been assigned a bus/route yet. Contact your school office."
          icon={Bus}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <SectionCard title="Vehicle" subtitle={assignment.number ?? "—"}>
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Route</dt>
                <dd className="font-medium">{assignment.route ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Driver</dt>
                <dd className="font-medium">{assignment.driver ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Driver Contact</dt>
                <dd className="font-medium">{assignment.driver_phone ?? "—"}</dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="Pickup & Drop">
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pickup Point</dt>
                <dd className="font-medium">{assignment.pickup_point ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pickup Time</dt>
                <dd className="font-medium">{assignment.pickup_time ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Drop Point</dt>
                <dd className="font-medium">{assignment.drop_point ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Drop Time</dt>
                <dd className="font-medium">{assignment.drop_time ?? "—"}</dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function AdminTransportView() {
  const { data: vehiclesData, isLoading } = useTransport();
  const { data: studentsData } = useStudents();
  const queryClient = useQueryClient();
  const vehicles = vehiclesData ?? [];

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<ApiVehicle | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiVehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiVehicle | null>(null);

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (v.number ?? "").toLowerCase().includes(q) ||
        (v.route ?? "").toLowerCase().includes(q) ||
        (v.driver ?? "").toLowerCase().includes(q);
      const matchesStatus = status === "all" || v.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [vehicles, search, status]);

  const totalVehicles = vehicles.length;
  const onRoute = vehicles.filter((v) => v.status === "On Route").length;
  const totalStudents = vehicles.reduce((s, v) => s + v.occupied, 0);
  const maintenanceDue = vehicles.filter((v) => v.status === "Maintenance").length;

  const assignedStudents = (v: ApiVehicle) =>
    (studentsData ?? []).filter((s) => s.vehicle_id === v.id);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["transport"] });
  }

  async function handleAdd(payload: VehiclePayload) {
    await api.post("/transport", payload);
    await invalidate();
    toast.success("Vehicle added to fleet");
  }

  async function handleEdit(id: string, payload: VehiclePayload) {
    await api.patch(`/transport/${id}`, payload);
    await invalidate();
    toast.success("Route details updated");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/transport/${deleteTarget.id}`);
      await invalidate();
      toast.success("Vehicle removed from fleet");
      setDeleteTarget(null);
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove vehicle");
    }
  }

  return (
    <div>
      <PageHeader
        title="Transport Management"
        description="Monitor fleet vehicles, routes and student transportation."
        breadcrumb={["Dashboard", "Transport"]}
        actions={
          <Button size="sm" className="h-9" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Vehicle
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Vehicles" value={totalVehicles} icon={Bus} tone="navy" />
        <InfoCard label="On Route" value={onRoute} icon={RouteIcon} tone="success" />
        <InfoCard label="Students Transported" value={totalStudents} icon={Users} tone="info" />
        <InfoCard label="Maintenance Due" value={maintenanceDue} icon={Wrench} tone="danger" />
      </div>

      <SectionCard className="mt-4" title="Fleet" subtitle="Vehicles and their current routes">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search vehicle, route, driver…"
          />
          <FilterSelect
            value={status}
            onChange={setStatus}
            options={["On Route", "Idle", "Maintenance"]}
            placeholder="Status"
          />
        </div>
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading fleet…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No vehicles found"
            description="Add a vehicle to start assigning bus routes to students."
            icon={Bus}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((v) => (
              <div key={v.id} className="panel flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-bold">{v.number ?? "—"}</p>
                  <StatusBadge status={v.status} />
                </div>
                <p className="text-xs text-muted-foreground">{v.route ?? "—"}</p>
                <div className="flex items-center gap-2">
                  <Initials name={v.driver ?? "—"} tone="gold" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.driver ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.driver_phone ?? "—"}
                    </p>
                  </div>
                </div>
                <ProgressBar
                  value={v.capacity ? (v.occupied / v.capacity) * 100 : 0}
                  label={
                    <span>
                      {v.occupied}/{v.capacity} students
                    </span>
                  }
                  tone={v.occupied / v.capacity > 0.9 ? "danger" : "navy"}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full"
                  onClick={() => setSelected(v)}
                >
                  View Route
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        className="mt-4"
        title="Routes Overview"
        subtitle="Summary of all school transport routes"
      >
        {vehicles.length === 0 ? (
          <EmptyState title="No routes yet" icon={RouteIcon} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2">Route</th>
                  <th className="px-2 py-2">Vehicle</th>
                  <th className="px-2 py-2">Driver</th>
                  <th className="px-2 py-2">Stops</th>
                  <th className="px-2 py-2">Students</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-b border-border/60">
                    <td className="px-2 py-2 font-medium">{v.route ?? "—"}</td>
                    <td className="px-2 py-2">{v.number ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{v.driver ?? "—"}</td>
                    <td className="px-2 py-2">{v.stops.length}</td>
                    <td className="px-2 py-2">{v.occupied}</td>
                    <td className="px-2 py-2">
                      <StatusBadge status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.route ?? "Unnamed Route"}</DialogTitle>
                <DialogDescription>
                  {selected.number ?? "—"} · {selected.driver ?? "—"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Vehicle</p>
                  <p className="font-medium">{selected.number ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Driver</p>
                  <p className="font-medium">{selected.driver ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Contact</p>
                  <p className="font-medium">{selected.driver_phone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Occupancy</p>
                  <p className="font-medium">
                    {selected.occupied}/{selected.capacity}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                  Route Timeline
                </p>
                {selected.stops.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No stops added yet.</p>
                ) : (
                  <div className="space-y-0">
                    {selected.stops.map((s, i) => (
                      <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                        {i < selected.stops.length - 1 && (
                          <span className="absolute top-3 left-[5px] h-full w-px bg-border" />
                        )}
                        <span className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-primary bg-surface" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                  Assigned Students
                </p>
                {assignedStudents(selected).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No students assigned to this route yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {assignedStudents(selected).map((s) => (
                      <span
                        key={s.id}
                        className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs"
                      >
                        <Initials name={s.name} className="h-6 w-6 text-[10px]" /> {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(selected)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Remove Vehicle
                </Button>
                <Button variant="outline" asChild disabled={!selected.driver_phone}>
                  <a href={selected.driver_phone ? `tel:${selected.driver_phone}` : undefined}>
                    <Phone className="mr-1.5 h-4 w-4" /> Call Driver
                  </a>
                </Button>
                <Button
                  onClick={() => {
                    setEditTarget(selected);
                    setSelected(null);
                  }}
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Edit Route
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Vehicle</DialogTitle>
            <DialogDescription>
              Remove {deleteTarget?.number ?? "this vehicle"} from the fleet? Students assigned to
              it will be unassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VehicleDialog
        key={addOpen ? "add-open" : "add-closed"}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSave={handleAdd}
      />

      <VehicleDialog
        key={editTarget?.id ?? "edit-empty"}
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        vehicle={editTarget}
        onSave={(payload) => handleEdit(editTarget!.id, payload)}
      />
    </div>
  );
}

function VehicleDialog({
  open,
  onOpenChange,
  vehicle,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: ApiVehicle | null;
  onSave: (payload: VehiclePayload) => Promise<void>;
}) {
  const isEdit = !!vehicle;
  const [number, setNumber] = useState(vehicle?.number ?? "");
  const [route, setRoute] = useState(vehicle?.route ?? "");
  const [driver, setDriver] = useState(vehicle?.driver ?? "");
  const [driverContact, setDriverContact] = useState(vehicle?.driver_phone ?? "");
  const [capacity, setCapacity] = useState(vehicle?.capacity ?? 40);
  const [status, setStatus] = useState<ApiVehicle["status"]>(vehicle?.status ?? "Idle");
  const [stops, setStops] = useState<ApiVehicle["stops"]>(vehicle?.stops ?? []);
  const [saving, setSaving] = useState(false);

  function addStop() {
    setStops((prev) => [...prev, { name: "", time: "" }]);
  }
  function updateStop(i: number, field: "name" | "time", value: string) {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }
  function removeStop(i: number) {
    setStops((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        number,
        route,
        driver,
        driverPhone: driverContact,
        capacity,
        status,
        stops: stops.filter((s) => s.name.trim()),
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save vehicle");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Route" : "Add Vehicle"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the vehicle, driver and stop details for this route."
              : "Register a new vehicle to the transport fleet."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Vehicle Number</Label>
              <Input
                required
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="SPR-1200"
              />
            </div>
            <div className="space-y-1">
              <Label>Route Name</Label>
              <Input
                required
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="Route 7 · Downtown"
              />
            </div>
            <div className="space-y-1">
              <Label>Driver</Label>
              <Input
                required
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
                placeholder="Driver name"
              />
            </div>
            <div className="space-y-1">
              <Label>Driver Contact</Label>
              <Input
                required
                value={driverContact}
                onChange={(e) => setDriverContact(e.target.value)}
                placeholder="+1 (555) ..."
              />
            </div>
            <div className="space-y-1">
              <Label>Capacity</Label>
              <Input
                required
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ApiVehicle["status"])}>
                <SelectTrigger className="h-9 bg-surface text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="On Route">On Route</SelectItem>
                  <SelectItem value="Idle">Idle</SelectItem>
                  <SelectItem value="Maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>Route Stops</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={addStop}
              >
                <Plus className="mr-1 h-3 w-3" /> Add Stop
              </Button>
            </div>
            <div className="space-y-2">
              {stops.length === 0 && (
                <p className="text-xs text-muted-foreground">No stops added yet.</p>
              )}
              {stops.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={s.name}
                    onChange={(e) => updateStop(i, "name", e.target.value)}
                    placeholder="Stop name"
                    className="flex-1"
                  />
                  <Input
                    value={s.time}
                    onChange={(e) => updateStop(i, "time", e.target.value)}
                    placeholder="07:05 AM"
                    className="w-28"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground"
                    onClick={() => removeStop(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Vehicle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
