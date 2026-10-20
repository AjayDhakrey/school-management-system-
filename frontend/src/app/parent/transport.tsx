"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FaBus } from "react-icons/fa";
import { toast } from "sonner";
import { Bus, MapPin, Phone, Clock, AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton, Initials } from "@/components/shared/ui-kit";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTransportFor,
  useStudent,
  useHolidays,
  type TransportComplaintCategory,
} from "@/hooks/useApi";
import { useSchoolTimings } from "@/lib/school-timings";
import { useParentChild } from "@/lib/parent-child-context";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

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
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the issue..."
          />
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

/** Converts "7:05 am", "07:05", "13:30" to minutes after midnight. */
function stopMinutes(time: string | null | undefined) {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?\s*$/i.exec(time ?? "");
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h * 60 + min;
}

/**
 * The route as a live timeline that tracks the bus position across all scheduled stops.
 */
function LiveRoute({
  stops,
  pickup,
  drop,
}: {
  stops: { name: string; time?: string | null }[];
  pickup: string | null | undefined;
  drop: string | null | undefined;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { days: workingDays } = useSchoolTimings();
  const { data: holidays } = useHolidays();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const holiday = (holidays ?? []).find((h) => (h.date ?? "").slice(0, 10) === todayIso);
  const offReason = holiday
    ? holiday.name
    : weekday === "Sunday" || !workingDays.includes(weekday)
      ? weekday
      : null;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const times = stops.map((st) => stopMinutes(st.time));

  let at = -1;
  if (!offReason) {
    times.forEach((t, i) => {
      if (t !== null && t <= minutesNow) at = i;
    });
  }
  const started = at >= 0;
  const finished = !offReason && at === stops.length - 1;
  const next = finished ? null : stops[at + 1];
  const nextIn = next ? (times[at + 1] ?? minutesNow) - minutesNow : 0;
  const key = (name: string | null | undefined) => (name ?? "").trim().toLowerCase();

  const status = offReason
    ? { text: `No bus today · ${offReason}`, tone: "bg-warning-soft text-warning" }
    : !started
      ? { text: `Bus starts at ${stops[0]?.time ?? "—"}`, tone: "bg-muted text-muted-foreground" }
      : finished
        ? {
            text: `Reached ${stops.at(-1)?.name ?? "school"}`,
            tone: "bg-success-soft text-success",
          }
        : {
            text: `Next: ${next?.name} ${nextIn > 0 ? `in ${nextIn} min` : "now"}`,
            tone: "bg-primary/10 text-primary",
          };

  return (
    <div className="border-t border-dashed border-border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Route · {stops.length} stop{stops.length === 1 ? "" : "s"}
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
            status.tone,
          )}
        >
          {started && !finished && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          )}
          {status.text}
        </span>
      </div>
      <ol>
        {stops.map((stop, i) => {
          const k = key(stop.name);
          const pKey = key(pickup);
          const dKey = key(drop);
          const isPickup = pKey && (k.includes(pKey) || pKey.includes(k));
          const isDrop = dKey && (k.includes(dKey) || dKey.includes(k));
          const mine = isPickup || isDrop;
          const passed = i <= at;
          const here = i === at && !finished;
          const last = i === stops.length - 1;
          return (
            <li
              key={`${stop.name}-${i}`}
              className="grid grid-cols-[56px_24px_minmax(0,1fr)] items-start gap-2 pb-3 last:pb-0"
            >
              <span
                className={cn(
                  "pt-0.5 text-right text-[11px] tabular-nums",
                  passed || mine ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {stop.time ?? "—"}
              </span>
              <span className="relative flex justify-center">
                {!last && (
                  <span
                    className={cn(
                      "absolute top-4 h-[calc(100%+0.5rem)] w-0.5 rounded",
                      i < at ? "bg-success" : "bg-border",
                    )}
                  />
                )}
                {here ? (
                  <span className="relative grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-primary/20">
                    <FaBus className="h-3 w-3" />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "relative mt-0.5 h-3.5 w-3.5 rounded-full border-2",
                      passed
                        ? "border-success bg-success"
                        : mine
                          ? "border-success bg-card"
                          : last
                            ? "border-primary bg-card"
                            : "border-border bg-card",
                    )}
                  />
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "truncate text-sm capitalize",
                    here || mine ? "font-bold" : passed ? "text-foreground" : "text-foreground/70",
                  )}
                >
                  {stop.name}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {here && (
                    <span className="rounded-full bg-primary px-2 py-px text-[10px] font-semibold text-primary-foreground">
                      Bus is here
                    </span>
                  )}
                  {mine && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-px text-[10px] font-semibold",
                        isPickup
                          ? "bg-success-soft text-success"
                          : "bg-destructive-soft text-destructive",
                      )}
                    >
                      {isPickup && isDrop
                        ? "Your child's stop"
                        : isPickup
                          ? "Pickup stop"
                          : "Drop stop"}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function ParentTransportPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: vehicle, isLoading } = useTransportFor(selectedChildId ?? undefined);
  const { data: student } = useStudent(selectedChildId ?? undefined);
  const [reportOpen, setReportOpen] = useState(false);

  // Standardize number plate for display
  const plate = (vehicle?.number ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/, "$1 $2 $3 $4")
    .replace(/\s+/g, " ")
    .trim();

  const isLive = vehicle?.status === "On Route";

  // Build the complete, proper route sequence with stop times
  const effectiveStops = useMemo(() => {
    const existing = Array.isArray(vehicle?.stops)
      ? vehicle.stops.filter((s) => s.name?.trim())
      : [];
    if (existing.length >= 2) {
      return existing;
    }

    // When stops list isn't populated, synthesize a structured route sequence based on route, pickup and drop
    const routeName = vehicle?.route?.trim() || "School Route";
    const pickup = vehicle?.pickup_point?.trim() || routeName;
    const drop = vehicle?.drop_point?.trim() || routeName;

    const list: { name: string; time: string }[] = [];
    list.push({
      name: `${pickup} (Pickup Point)`,
      time: vehicle?.pickup_time || "07:15 AM",
    });

    if (drop.toLowerCase() !== pickup.toLowerCase()) {
      list.push({
        name: `${drop} (Drop Point)`,
        time: vehicle?.drop_time || "07:35 AM",
      });
    } else {
      list.push({
        name: `${routeName} Main Circle`,
        time: "07:35 AM",
      });
    }

    list.push({
      name: "School Campus (Arrival)",
      time: "07:55 AM",
    });

    return list;
  }, [vehicle]);

  const timeAt = (place: string | null | undefined) => {
    if (!place) return null;
    const target = place.trim().toLowerCase();
    const match = effectiveStops.find(
      (st) =>
        st.name.trim().toLowerCase().includes(target) ||
        target.includes(st.name.trim().toLowerCase()),
    );
    return match?.time ?? null;
  };

  const pickupTime = vehicle?.pickup_time || timeAt(vehicle?.pickup_point) || "07:15 AM";
  const dropTime = vehicle?.drop_time || timeAt(vehicle?.drop_point) || "02:30 PM";
  const same =
    (vehicle?.pickup_point ?? "").trim().toLowerCase() ===
    (vehicle?.drop_point ?? "").trim().toLowerCase();

  return (
    <div>
      <PageHeader
        title="Transport"
        description="Assigned bus, live route timeline, and driver details for this child."
        breadcrumb={["Dashboard", "Transport"]}
        actions={
          vehicle ? (
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
          ) : undefined
        }
      />
      <ChildSwitcher />

      {childrenLoading || isLoading ? (
        <CardSkeleton count={2} />
      ) : !vehicle ? (
        <div className="panel">
          <EmptyState
            title="No transport assigned"
            description="This child isn't assigned to a school vehicle yet. Contact your school office."
            icon={Bus}
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left Column: Bus Details & Driver */}
          <div className="grid content-start gap-4">
            {/* Bus Card */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="relative p-4">
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <FaBus className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Assigned Bus
                      </p>
                      <p className="truncate font-display text-lg font-bold capitalize">
                        Route {vehicle.route ?? "—"}
                      </p>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground/80">
                    <span className="relative flex h-2 w-2">
                      {isLive && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      )}
                      <span
                        className={cn(
                          "relative inline-flex h-2 w-2 rounded-full",
                          isLive
                            ? "bg-success"
                            : vehicle.status === "Maintenance"
                              ? "bg-warning"
                              : "bg-muted-foreground/50",
                        )}
                      />
                    </span>
                    {vehicle.status || "Idle"}
                  </span>
                </div>

                {/* Indian Vehicle License Number Plate */}
                <div className="relative mt-3.5 flex w-fit items-stretch overflow-hidden rounded-md border-2 border-neutral-800 bg-[#facc15] shadow-xs">
                  <span className="flex flex-col items-center justify-center bg-blue-700 px-1.5 text-[8px] leading-tight font-bold text-white">
                    <span>●</span>
                    IND
                  </span>
                  <span className="px-3 py-1 font-mono text-base font-bold tracking-[0.15em] text-neutral-900 sm:text-lg">
                    {plate || "VEHICLE"}
                  </span>
                </div>
              </div>

              {/* Facts Bar */}
              <div className="grid grid-cols-3 divide-x divide-border border-t border-border text-center">
                <div className="px-2 py-2.5">
                  <p className="truncate text-sm font-bold capitalize">
                    {vehicle.vehicle_type || "Bus"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Type</p>
                </div>
                <div className="px-2 py-2.5">
                  <p className="truncate text-sm font-bold capitalize">
                    {vehicle.capacity ? String(vehicle.capacity) : "40"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Seats</p>
                </div>
                <div className="px-2 py-2.5">
                  <p className="truncate text-sm font-bold capitalize">
                    {effectiveStops.length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Stops</p>
                </div>
              </div>
            </div>

            {/* Driver Contact Card */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs">
              <Initials
                name={vehicle.driver ?? "Driver"}
                tone="gold"
                className="h-12 w-12 text-sm shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Driver
                </p>
                <p className="truncate text-[15px] font-bold capitalize">
                  {vehicle.driver?.toLowerCase() ?? "Not assigned"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {vehicle.driver_phone ?? "No contact number"}
                </p>
              </div>
              {vehicle.driver_phone && (
                <a
                  href={`tel:${vehicle.driver_phone}`}
                  aria-label="Call driver"
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white shadow-xs transition-transform hover:bg-emerald-700 active:scale-95"
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
              )}
            </div>
          </div>

          {/* Right Column: Journey & Proper Route Timeline */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
            {/* Journey Details */}
            <div className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {student?.name
                  ? `${student.name.split(" ")[0]}'s Journey`
                  : "Your Child's Journey"}
              </p>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> Pickup
                  </p>
                  <p className="mt-0.5 truncate font-display text-base font-bold capitalize">
                    {vehicle.pickup_point ?? "Not set"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" /> {pickupTime}
                  </p>
                </div>

                <span className="flex items-center gap-1 text-muted-foreground px-1">
                  <span className="h-px w-3 bg-border sm:w-4" />
                  <Bus className="h-4 w-4 text-primary" />
                  <span className="h-px w-3 bg-border sm:w-4" />
                </span>

                <div className="min-w-0 text-right">
                  <p className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                    Drop <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  </p>
                  <p className="mt-0.5 truncate font-display text-base font-bold capitalize">
                    {vehicle.drop_point ?? "Not set"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                    <Clock className="h-3 w-3" /> {dropTime}
                  </p>
                </div>
              </div>

              {same && vehicle.pickup_point && (
                <p className="mt-2.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-center text-[11px] text-muted-foreground">
                  Picked up and dropped at the same stop
                </p>
              )}
            </div>

            {/* Proper Route Timeline */}
            <LiveRoute
              stops={effectiveStops}
              pickup={vehicle.pickup_point}
              drop={vehicle.drop_point}
            />
          </div>
        </div>
      )}
    </div>
  );
}

