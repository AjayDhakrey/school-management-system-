"use client";

import { useMemo } from "react";
import { CalendarCheck, CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAttendanceFor, useAttendanceSummary } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

export default function ParentAttendancePage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: attendance, isLoading } = useAttendanceFor(selectedChildId ?? undefined);
  const { data: summary } = useAttendanceSummary(
    { studentId: selectedChildId ?? undefined },
    Boolean(selectedChildId),
  );

  const rows = useMemo(() => (attendance ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)), [attendance]);
  const present = summary?.present ?? 0;
  const absent = summary?.absent ?? 0;
  const pct = summary?.percentage ?? 0;

  return (
    <div>
      <PageHeader title="Attendance" description="Day-by-day attendance record." breadcrumb={["Dashboard", "My Children", "Attendance"]} />
      <ChildSwitcher />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Attendance %" value={`${pct}%`} icon={CalendarCheck} tone="navy" />
        <InfoCard label="Present" value={present} icon={CheckCircle2} tone="success" />
        <InfoCard label="Absent" value={absent} icon={XCircle} tone="danger" />
      </div>

      <div className="panel">
        {childrenLoading || isLoading ? (
          <TableSkeleton rows={6} cols={2} />
        ) : rows.length === 0 ? (
          <EmptyState title="No attendance records yet" description="Attendance for this child hasn't been marked yet." icon={ClipboardCheck} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
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
