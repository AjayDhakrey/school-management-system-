"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FaBus } from "react-icons/fa";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bus,
  Clock,
  MapPin,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import {
  useMyTransport,
  useTransport,
  useStudents,
  type ApiVehicle,
  type TransportComplaintCategory,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/shared/PhoneInput";

const COMPLAINT_CATEGORIES: TransportComplaintCategory[] = [
  "Safety",
  "Delay",
  "Behavior",
  "Cleanliness",
  "Emergency",
  "Other",
];

function ReportIssueDialog({ vehicleId, onDone }: { vehicleId?: string; onDone: () => void }) {
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
        <DialogDescription>
          Let the transport office know about a safety concern, delay or complaint.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Category</Label>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as TransportComplaintCategory)}
          >
            <SelectTrigger className="bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPLAINT_CATEGORIES.map((c) => (
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

type VehiclePayload = {
  number: string;
  route: string;
  driver: string;
  driverPhone: string;
  capacity: number;
  status: ApiVehicle["status"];
  stops: { name: string; time: string }[];
  registrationNo: string | null;
  vehicleType: string | null;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  pollutionExpiry: string | null;
};

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentTransportView />;
  return <AdminTransportView />;
}

/** One end of the student's daily trip, drawn as a point on a vertical timeline. */
function JourneyStop({
  tone,
  label,
  place,
  time,
  last,
}: {
  tone: "success" | "destructive";
  label: string;
  place: string | null | undefined;
  time: string | null | undefined;
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-1">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full",
            tone === "success"
              ? "bg-success-soft text-success"
              : "bg-destructive-soft text-destructive",
          )}
        >
          <MapPin className="h-4 w-4" />
        </span>
        {!last && <span className="my-1 w-0.5 flex-1 border-l-2 border-dashed border-border" />}
      </div>
      <div className={cn("flex min-w-0 flex-1 items-start justify-between gap-2", !last && "pb-5")}>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="truncate text-[15px] font-bold">{place || "Not set"}</p>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            time ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Clock className="h-3 w-3" /> {time || "Time TBA"}
        </span>
      </div>
    </li>
  );
}

function StudentTransportView() {
  const { data: assignment, isLoading } = useMyTransport();
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Transport"
        description="Your assigned bus and route details."
        breadcrumb={["Dashboard", "Transport"]}
        actions={
          assignment ? (
            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Report Issue
                </Button>
              </DialogTrigger>
              <ReportIssueDialog vehicleId={assignment.id} onDone={() => setReportOpen(false)} />
            </Dialog>
          ) : undefined
        }
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
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            {/* Bus */}
            {(() => {
              const plate = (assignment.number ?? "")
                .toUpperCase()
                .replace(/\s+/g, "")
                .replace(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/, "$1 $2 $3 $4")
                .replace(/\s+/g, " ")
                .trim();
              const live = assignment.status === "On Route";
              return (
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="relative px-4 pt-4 pb-4">
                    <div className="relative flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                          <FaBus className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Your school bus
                          </p>
                          <p className="truncate font-display text-lg font-bold capitalize">
                            Route {assignment.route ?? "—"}
                          </p>
                        </div>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground/80">
                        <span className="relative flex h-2 w-2">
                          {live && (
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                          )}
                          <span
                            className={cn(
                              "relative inline-flex h-2 w-2 rounded-full",
                              live
                                ? "bg-success"
                                : assignment.status === "Maintenance"
                                  ? "bg-warning"
                                  : "bg-muted-foreground/50",
                            )}
                          />
                        </span>
                        {assignment.status}
                      </span>
                    </div>

                    {/* Number plate */}
                    <div className="relative mt-4 flex w-fit items-stretch overflow-hidden rounded-md border-2 border-neutral-800 bg-[#facc15] shadow-sm">
                      <span className="flex flex-col items-center justify-center bg-blue-700 px-1.5 text-[8px] leading-tight font-bold text-white">
                        <span>●</span>
                        IND
                      </span>
                      <span className="px-3 py-1 font-mono text-lg font-bold tracking-[0.15em] text-neutral-900">
                        {plate || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Facts */}
                  <div className="grid grid-cols-3 divide-x divide-border border-t border-border text-center">
                    {[
                      { label: "Type", value: assignment.vehicle_type || "Bus" },
                      {
                        label: "Seats",
                        value: assignment.capacity ? String(assignment.capacity) : "—",
                      },
                      {
                        label: "Stops",
                        value: String((assignment.stops ?? []).length || "—"),
                      },
                    ].map((f) => (
                      <div key={f.label} className="px-2 py-2.5">
                        <p className="truncate text-sm font-bold capitalize">{f.value}</p>
                        <p className="text-[10px] text-muted-foreground">{f.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Driver */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
              <Initials
                name={assignment.driver ?? "Driver"}
                tone="gold"
                className="h-12 w-12 text-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Driver
                </p>
                <p className="truncate text-[15px] font-bold capitalize">
                  {assignment.driver?.toLowerCase() ?? "Not assigned"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {assignment.driver_phone ?? "No contact number"}
                </p>
              </div>
              {assignment.driver_phone && (
                <a
                  href={`tel:${assignment.driver_phone}`}
                  aria-label="Call driver"
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-success px-4 text-sm font-semibold text-white shadow-sm transition-transform active:scale-95"
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
              )}
            </div>
          </div>

          {/* Journey */}
          {(() => {
            const stops = assignment.stops ?? [];
            const timeAt = (place: string | null | undefined) =>
              stops.find(
                (st) => st.name.trim().toLowerCase() === (place ?? "").trim().toLowerCase(),
              )?.time ?? null;
            const pickupTime = assignment.pickup_time || timeAt(assignment.pickup_point);
            const dropTime = assignment.drop_time || timeAt(assignment.drop_point);
            const same =
              (assignment.pickup_point ?? "").trim().toLowerCase() ===
              (assignment.drop_point ?? "").trim().toLowerCase();
            return (
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                {/* Ticket: pickup → drop */}
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Your journey
                  </p>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" /> Pickup
                      </p>
                      <p className="mt-0.5 truncate font-display text-base font-bold capitalize">
                        {assignment.pickup_point ?? "Not set"}
                      </p>
                      <p className="text-xs text-muted-foreground">{pickupTime ?? "Time TBA"}</p>
                    </div>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <span className="h-px w-4 bg-border" />
                      <Bus className="h-4 w-4 text-primary" />
                      <span className="h-px w-4 bg-border" />
                    </span>
                    <div className="min-w-0 text-right">
                      <p className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                        Drop <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      </p>
                      <p className="mt-0.5 truncate font-display text-base font-bold capitalize">
                        {assignment.drop_point ?? "Not set"}
                      </p>
                      <p className="text-xs text-muted-foreground">{dropTime ?? "Time TBA"}</p>
                    </div>
                  </div>
                  {same && assignment.pickup_point && (
                    <p className="mt-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-center text-[11px] text-muted-foreground">
                      Picked up and dropped at the same stop
                    </p>
                  )}
                </div>

                {/* Route timeline */}
                {stops.length > 0 && (
                  <div className="border-t border-dashed border-border bg-muted/20 p-4">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Route · {stops.length} stop{stops.length === 1 ? "" : "s"}
                    </p>
                    <ol className="relative">
                      {stops.map((stop, i) => {
                        const key = stop.name.trim().toLowerCase();
                        const isPickup =
                          key === (assignment.pickup_point ?? "").trim().toLowerCase();
                        const isDrop = key === (assignment.drop_point ?? "").trim().toLowerCase();
                        const mine = isPickup || isDrop;
                        const last = i === stops.length - 1;
                        return (
                          <li
                            key={`${stop.name}-${i}`}
                            className="relative grid grid-cols-[56px_20px_minmax(0,1fr)] items-start gap-2 pb-3 last:pb-0"
                          >
                            <span
                              className={cn(
                                "pt-0.5 text-right text-[11px] tabular-nums",
                                mine ? "font-semibold text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {stop.time ?? "—"}
                            </span>
                            <span className="relative flex justify-center">
                              {!last && (
                                <span className="absolute top-4 h-[calc(100%+0.5rem)] w-0.5 rounded bg-border" />
                              )}
                              <span
                                className={cn(
                                  "relative mt-0.5 h-3.5 w-3.5 rounded-full border-2",
                                  isPickup
                                    ? "border-success bg-success"
                                    : isDrop
                                      ? "border-destructive bg-destructive"
                                      : last
                                        ? "border-primary bg-primary"
                                        : "border-border bg-card",
                                )}
                              />
                            </span>
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "truncate text-sm capitalize",
                                  mine ? "font-bold" : "text-foreground/80",
                                )}
                              >
                                {stop.name}
                              </p>
                              {mine && (
                                <span
                                  className={cn(
                                    "mt-0.5 inline-block rounded-full px-2 py-px text-[10px] font-semibold",
                                    isPickup
                                      ? "bg-success-soft text-success"
                                      : "bg-destructive-soft text-destructive",
                                  )}
                                >
                                  {isPickup && isDrop
                                    ? "Your stop"
                                    : isPickup
                                      ? "Your pickup"
                                      : "Your drop"}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            );
          })()}
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
          <>
            {/* Phones: one row per route. */}
            <ul className="-mx-1 divide-y divide-border md:hidden">
              {vehicles.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(v)}
                    className="flex w-full items-center gap-3 px-1 py-3 text-left active:bg-muted/50"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <RouteIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold capitalize">
                          {v.route ?? "Unnamed route"}
                        </p>
                        <StatusBadge status={v.status} />
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {v.number ?? "—"} ·{" "}
                        <span className="capitalize">
                          {(v.driver ?? "No driver").toLowerCase()}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-foreground/70">
                        <b>{v.stops.length}</b> stop{v.stops.length === 1 ? "" : "s"} ·{" "}
                        <b>{v.occupied}</b> student{v.occupied === 1 ? "" : "s"}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
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
          </>
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
  const [registrationNo, setRegistrationNo] = useState(vehicle?.registration_no ?? "");
  const [vehicleType, setVehicleType] = useState(vehicle?.vehicle_type ?? "");
  const [insuranceExpiry, setInsuranceExpiry] = useState(vehicle?.insurance_expiry ?? "");
  const [fitnessExpiry, setFitnessExpiry] = useState(vehicle?.fitness_expiry ?? "");
  const [pollutionExpiry, setPollutionExpiry] = useState(vehicle?.pollution_expiry ?? "");
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
        registrationNo: registrationNo.trim() || null,
        vehicleType: vehicleType.trim() || null,
        insuranceExpiry: insuranceExpiry || null,
        fitnessExpiry: fitnessExpiry || null,
        pollutionExpiry: pollutionExpiry || null,
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
              <PhoneInput
                required
                value={driverContact}
                onChange={(e) => setDriverContact(e.target.value)}
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

          <div className="space-y-1.5 rounded-xl border border-border p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Registration & Documents
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Registration No.</Label>
                <Input
                  value={registrationNo}
                  onChange={(e) => setRegistrationNo(e.target.value)}
                  placeholder="RC number"
                />
              </div>
              <div className="space-y-1">
                <Label>Vehicle Type</Label>
                <Input
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  placeholder="Bus, Van, Car…"
                />
              </div>
              <div className="space-y-1">
                <Label>Insurance Expiry</Label>
                <Input
                  type="date"
                  value={insuranceExpiry ?? ""}
                  onChange={(e) => setInsuranceExpiry(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Fitness Cert. Expiry</Label>
                <Input
                  type="date"
                  value={fitnessExpiry ?? ""}
                  onChange={(e) => setFitnessExpiry(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Pollution Cert. Expiry</Label>
                <Input
                  type="date"
                  value={pollutionExpiry ?? ""}
                  onChange={(e) => setPollutionExpiry(e.target.value)}
                />
              </div>
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
