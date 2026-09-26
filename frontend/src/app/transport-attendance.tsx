"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { PageHeader, EmptyState, Initials } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  useStudents,
  useTransport,
  useTransportAttendance,
  type ApiTransportAttendance,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

type BoardStatus = "Boarded" | "Absent" | "Not Marked";
type DropStatus = "Dropped" | "Absent" | "Not Marked";

function StatusToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; tone: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border text-[11px] font-medium">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2 py-1.5 transition-colors ${
            value === o.value ? o.tone : "bg-surface text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function TransportAttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vehicleId, setVehicleId] = useState<string>("");
  const { data: vehicles } = useTransport();
  const { data: students, isLoading: studentsLoading } = useStudents();
  const { data: existing, isLoading: attendanceLoading } = useTransportAttendance(
    { date, vehicleId },
    !!vehicleId,
  );
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [marks, setMarks] = useState<Record<string, { boarding: BoardStatus; drop: DropStatus }>>({});

  const roster = useMemo(
    () => (students ?? []).filter((s) => s.vehicle_id === vehicleId),
    [students, vehicleId],
  );

  useEffect(() => {
    const firstId = vehicles?.[0]?.id;
    if (!vehicleId && firstId) setVehicleId(firstId);
  }, [vehicles, vehicleId]);

  useEffect(() => {
    const byStudent = new Map((existing ?? []).map((a: ApiTransportAttendance) => [a.student_id, a]));
    const next: Record<string, { boarding: BoardStatus; drop: DropStatus }> = {};
    for (const s of roster) {
      const row = byStudent.get(s.id);
      next[s.id] = { boarding: row?.boarding_status ?? "Not Marked", drop: row?.drop_status ?? "Not Marked" };
    }
    setMarks(next);
  }, [existing, roster]);

  function setMark(studentId: string, field: "boarding" | "drop", value: string) {
    setMarks((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value } as { boarding: BoardStatus; drop: DropStatus },
    }));
  }

  function markAll(field: "boarding" | "drop", value: string) {
    setMarks((prev) => {
      const next = { ...prev };
      for (const s of roster) next[s.id] = { ...next[s.id], [field]: value } as typeof next[string];
      return next;
    });
  }

  async function handleSave() {
    if (!vehicleId || roster.length === 0) return;
    setSaving(true);
    try {
      await api.post("/transport-attendance/bulk", {
        date,
        vehicleId,
        entries: roster.map((s) => ({
          studentId: s.id,
          vehicleId,
          boardingStatus: marks[s.id]?.boarding ?? "Not Marked",
          dropStatus: marks[s.id]?.drop ?? "Not Marked",
        })),
      });
      toast.success("Attendance saved");
      await queryClient.invalidateQueries({ queryKey: [`transport-attendance-${date}-${vehicleId}-all`] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  const isLoading = studentsLoading || (!!vehicleId && attendanceLoading);

  return (
    <div>
      <PageHeader
        title="Transport Attendance"
        description="Mark boarding and drop status for students on each vehicle."
        breadcrumb={["Dashboard", "Transport", "Attendance"]}
      />

      <SectionCard
        bodyClassName="p-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="h-9 w-[150px]" value={date} onChange={(e) => setDate(e.target.value)} />
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="h-9 w-[180px] bg-surface text-sm">
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {(vehicles ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.number ?? v.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading roster…</p>
        ) : roster.length === 0 ? (
          <EmptyState
            title="No students on this vehicle"
            description="Assign students to this vehicle from Student Transport first."
            icon={ClipboardCheck}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border p-3">
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => markAll("boarding", "Boarded")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark All Boarded
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => markAll("drop", "Dropped")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark All Dropped
              </Button>
            </div>
            <div className="divide-y divide-border">
              {roster.map((s) => {
                const mark = marks[s.id] ?? { boarding: "Not Marked", drop: "Not Marked" };
                return (
                  <div key={s.id} className="flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Initials name={s.name} className="h-8 w-8 shrink-0 text-[10px]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.class_name ?? "—"} {s.section ?? ""}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:w-[340px] sm:shrink-0">
                      <StatusToggle
                        value={mark.boarding}
                        onChange={(v) => setMark(s.id, "boarding", v)}
                        options={[
                          { value: "Boarded", label: "Boarded", tone: "bg-success text-white" },
                          { value: "Absent", label: "Absent", tone: "bg-destructive text-white" },
                          { value: "Not Marked", label: "—", tone: "bg-muted" },
                        ]}
                      />
                      <StatusToggle
                        value={mark.drop}
                        onChange={(v) => setMark(s.id, "drop", v)}
                        options={[
                          { value: "Dropped", label: "Dropped", tone: "bg-success text-white" },
                          { value: "Absent", label: "Absent", tone: "bg-destructive text-white" },
                          { value: "Not Marked", label: "—", tone: "bg-muted" },
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end border-t border-border p-3.5">
              <Button className="gap-1.5" disabled={saving} onClick={handleSave}>
                {saving ? "Saving…" : "Save Attendance"}
              </Button>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
