"use client";

import { useMemo } from "react";
import { PlaneTakeoff } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClassLeave, useStudents } from "@/hooks/useApi";

export default function TeacherClassLeavePage() {
  const { data: leave, isLoading } = useClassLeave();
  const { data: students } = useStudents();

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students ?? []) map.set(s.id, s.name);
    return map;
  }, [students]);

  const rows = leave ?? [];
  const pending = rows.filter((r) => r.status === "Pending").length;

  return (
    <div>
      <PageHeader
        title="Class Leave"
        description="Leave requests from students in the class(es) where you are the Class Teacher."
        breadcrumb={["Dashboard", "Class Leave"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Total Requests" value={rows.length} icon={PlaneTakeoff} tone="navy" />
        <InfoCard label="Pending" value={pending} icon={PlaneTakeoff} tone="warning" />
      </div>

      <div className="panel">
        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No class leave requests"
            description="You'll see leave requests here once you're assigned as a Class Teacher and a student in your class applies."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{studentNameById.get(r.requester_id) ?? "Unknown student"}</TableCell>
                    <TableCell>{r.from_date ?? "—"}</TableCell>
                    <TableCell>{r.to_date ?? "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">{r.reason ?? "—"}</TableCell>
                    <TableCell className="text-right">
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
