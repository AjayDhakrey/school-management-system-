"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Bus, MapPin } from "lucide-react";
import { PageHeader, EmptyState, SearchInput, Initials, Pager, usePaged } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { FilterSelect } from "@/components/shared/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStudents, useTransport, type ApiStudent } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const NONE = "__none__";

function AssignDialog({
  student,
  vehicles,
  open,
  onOpenChange,
  onDone,
}: {
  student: ApiStudent | null;
  vehicles: { id: string; number: string | null; route: string | null }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(student?.vehicle_id ?? NONE);
  const [pickupPoint, setPickupPoint] = useState(student?.pickup_point ?? "");
  const [dropPoint, setDropPoint] = useState(student?.drop_point ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    setSaving(true);
    try {
      await api.post("/transport-assign", {
        studentId: student.id,
        vehicleId: vehicleId === NONE ? null : vehicleId,
        pickupPoint: pickupPoint.trim() || null,
        dropPoint: dropPoint.trim() || null,
      });
      toast.success(vehicleId === NONE ? "Transport unassigned" : "Transport assigned");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update transport assignment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Transport</DialogTitle>
          <DialogDescription>
            {student?.name ?? "Student"} · {student?.class_name ?? "—"} {student?.section ?? ""}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <Label>Vehicle / Route</Label>
            <Select value={vehicleId ?? NONE} onValueChange={setVehicleId}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Not assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not assigned</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.number ?? v.id} {v.route ? `· ${v.route}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Pickup Point</Label>
              <Input value={pickupPoint} onChange={(e) => setPickupPoint(e.target.value)} placeholder="e.g. Main Gate" />
            </div>
            <div className="grid gap-1.5">
              <Label>Drop Point</Label>
              <Input value={dropPoint} onChange={(e) => setDropPoint(e.target.value)} placeholder="e.g. Main Gate" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Assignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TransportStudentsPage() {
  const { data: students, isLoading } = useStudents();
  const { data: vehicles } = useTransport();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<ApiStudent | null>(null);

  const vehiclesById = useMemo(() => new Map((vehicles ?? []).map((v) => [v.id, v])), [vehicles]);

  const filtered = useMemo(() => {
    return (students ?? []).filter((s) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.admission_no ?? "").toLowerCase().includes(q) ||
        (s.class_name ?? "").toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "assigned" && !!s.vehicle_id) ||
        (filter === "unassigned" && !s.vehicle_id);
      return matchesSearch && matchesFilter;
    });
  }, [students, search, filter]);
  const { rows, pageCount } = usePaged(filtered, page, 15);

  const assignedCount = (students ?? []).filter((s) => s.vehicle_id).length;

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["students"] });
    await queryClient.invalidateQueries({ queryKey: ["transport"] });
  }

  return (
    <div>
      <PageHeader
        title="Student Transport"
        description="Assign students to a vehicle/route, pickup and drop points."
        breadcrumb={["Dashboard", "Transport", "Student Transport"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="panel p-3.5">
          <p className="text-xs text-muted-foreground">Students on Transport</p>
          <p className="mt-0.5 font-display text-xl font-bold">{assignedCount}</p>
        </div>
        <div className="panel p-3.5">
          <p className="text-xs text-muted-foreground">Not Assigned</p>
          <p className="mt-0.5 font-display text-xl font-bold">{(students ?? []).length - assignedCount}</p>
        </div>
      </div>

      <SectionCard
        bodyClassName="p-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search students…"
            />
            <FilterSelect
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setPage(1);
              }}
              options={["assigned", "unassigned"]}
              placeholder="All Students"
            />
          </div>
        }
      >
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading students…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No students found" icon={Bus} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Student</th>
                    <th className="px-4 py-2.5 font-medium">Class</th>
                    <th className="px-4 py-2.5 font-medium">Vehicle / Route</th>
                    <th className="px-4 py-2.5 font-medium">Pickup</th>
                    <th className="px-4 py-2.5 font-medium">Drop</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const vehicle = s.vehicle_id ? vehiclesById.get(s.vehicle_id) : undefined;
                    return (
                      <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Initials name={s.name} className="h-7 w-7 text-[10px]" />
                            <span className="font-medium">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {s.class_name ?? "—"} {s.section ?? ""}
                        </td>
                        <td className="px-4 py-2.5">
                          {vehicle ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium">
                              <Bus className="h-3.5 w-3.5 text-primary" /> {vehicle.number ?? "—"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not assigned</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{s.pickup_point ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{s.drop_point ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button variant="outline" size="sm" className="h-8" onClick={() => setTarget(s)}>
                            {vehicle ? "Change" : "Assign"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2.5 p-4 md:hidden">
              {rows.map((s) => {
                const vehicle = s.vehicle_id ? vehiclesById.get(s.vehicle_id) : undefined;
                return (
                  <div key={s.id} className="min-w-0 overflow-hidden rounded-xl border border-border p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Initials name={s.name} className="h-8 w-8 shrink-0 text-[10px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{s.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.class_name ?? "—"} {s.section ?? ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {vehicle ? `${vehicle.number ?? "—"} · ${s.pickup_point ?? "—"}` : "Not assigned"}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => setTarget(s)}
                    >
                      {vehicle ? "Change Assignment" : "Assign Transport"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
          </>
        )}
      </SectionCard>

      <AssignDialog
        key={target?.id ?? "none"}
        student={target}
        vehicles={vehicles ?? []}
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        onDone={async () => {
          await invalidate();
          setTarget(null);
        }}
      />
    </div>
  );
}
