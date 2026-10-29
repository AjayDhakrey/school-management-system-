"use client";

import { useMemo, useState } from "react";
import { PlaneTakeoff, Check, X } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClassLeave, useStudents } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function TeacherClassLeavePage() {
  const queryClient = useQueryClient();
  const { data: leave, isLoading } = useClassLeave();
  const { data: students } = useStudents();
  const [actingId, setActingId] = useState<string | null>(null);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students ?? []) map.set(s.id, s.name);
    return map;
  }, [students]);

  const rows = leave ?? [];
  const pending = rows.filter((r) => r.status === "Pending").length;

  async function handleDecide(id: string, status: "Approved" | "Rejected") {
    setActingId(id);
    try {
      await api.patch(`/leave/${id}`, { status });
      await queryClient.invalidateQueries({ queryKey: ["leave-class-students"] });
      toast.success(`Leave request ${status.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update leave request");
    } finally {
      setActingId(null);
    }
  }

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
          <TableSkeleton rows={6} cols={5} />
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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{studentNameById.get(r.requester_id) ?? "Unknown student"}</TableCell>
                    <TableCell>{r.from_date ?? "—"}</TableCell>
                    <TableCell>{r.to_date ?? "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">{r.reason ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "Pending" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2.5 text-xs text-emerald-600 hover:text-emerald-700"
                            disabled={actingId === r.id}
                            onClick={() => handleDecide(r.id, "Approved")}
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2.5 text-xs text-destructive hover:text-destructive"
                            disabled={actingId === r.id}
                            onClick={() => handleDecide(r.id, "Rejected")}
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Completed</span>
                      )}
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
