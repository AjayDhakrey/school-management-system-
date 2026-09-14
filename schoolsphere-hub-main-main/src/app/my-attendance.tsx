"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, Clock3, CalendarCheck } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStaffAttendance } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

export default function StaffMyAttendancePage() {
  const { data: rows, isLoading } = useStaffAttendance();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"in" | "out" | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const todayRow = useMemo(() => (rows ?? []).find((r) => r.date === today), [rows, today]);

  const history = useMemo(() => [...(rows ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [rows]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRows = history.filter((r) => r.date.startsWith(thisMonth));
  const presentThisMonth = monthRows.filter((r) => r.status === "Present").length;

  async function checkIn() {
    setBusy("in");
    try {
      await api.post("/staff-attendance/check-in");
      await queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
      toast.success("Checked in");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Check-in failed");
    } finally {
      setBusy(null);
    }
  }

  async function checkOut() {
    setBusy("out");
    try {
      await api.post("/staff-attendance/check-out");
      await queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
      toast.success("Checked out");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Check-out failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="My Attendance" description="Your own daily check-in and attendance history." breadcrumb={["Dashboard", "My Attendance"]} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="This Month" value={`${presentThisMonth}/${monthRows.length}`} icon={CalendarCheck} tone="navy" />
        <InfoCard label="Check In" value={todayRow?.check_in ?? "—"} icon={LogIn} tone="success" />
        <InfoCard label="Check Out" value={todayRow?.check_out ?? "—"} icon={LogOut} tone="info" />
      </div>

      <SectionCard title="Today's Attendance" subtitle={today} className="mb-4">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Clock3 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                Status: <StatusBadge status={todayRow ? (todayRow.check_out ? "Checked Out" : "Checked In") : "Not Marked"} />
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Check In: {todayRow?.check_in ?? "—"} · Check Out: {todayRow?.check_out ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={checkIn} disabled={busy !== null || Boolean(todayRow?.check_in)}>
              <LogIn className="mr-1.5 h-4 w-4" /> Check In
            </Button>
            <Button
              variant="outline"
              onClick={checkOut}
              disabled={busy !== null || !todayRow?.check_in || Boolean(todayRow?.check_out)}
            >
              <LogOut className="mr-1.5 h-4 w-4" /> Check Out
            </Button>
          </div>
        </div>
      </SectionCard>

      <div className="panel">
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-semibold">Attendance History</h3>
        </div>
        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : history.length === 0 ? (
          <EmptyState title="No attendance history" description="Check in to start building your attendance record." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead className="text-right">Check Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.slice(0, 31).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>{r.check_in ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.check_out ?? "—"}</TableCell>
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
