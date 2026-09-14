"use client";

import { useMemo } from "react";
import { CalendarDays, CheckCircle2, Clock3, FileSpreadsheet } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useExamsFor } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

export default function ParentExamsPage() {
  const { selectedChild, isLoading: childrenLoading } = useParentChild();
  const { data: exams, isLoading } = useExamsFor(selectedChild?.id ?? undefined);

  const classLabel = selectedChild?.class_name
    ? `Class ${selectedChild.class_name}${selectedChild.section ? `-${selectedChild.section}` : ""}`
    : "—";

  const rows = (exams ?? []).slice().sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const upcomingCount = rows.filter((e) => e.status === "Scheduled" || e.status === "Ongoing").length;
  const completedCount = rows.filter((e) => e.status === "Completed").length;

  // Group into a date-sheet: one card per term, exams listed chronologically within it.
  const byTerm = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const e of rows) {
      const key = e.term || "Exams";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => (a[1][0]?.date ?? "").localeCompare(b[1][0]?.date ?? ""));
  }, [rows]);

  const loading = childrenLoading || isLoading;

  return (
    <div>
      <PageHeader
        title="Exams"
        description="Class & section-wise exam date-sheet for your child."
        breadcrumb={["Dashboard", "My Children", "Exams"]}
      />
      <ChildSwitcher />

      {!loading && selectedChild && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard label="Class & Section" value={classLabel} icon={FileSpreadsheet} tone="navy" />
          <InfoCard label="Total Exams" value={rows.length} icon={CalendarDays} tone="info" />
          <InfoCard label="Upcoming" value={upcomingCount} icon={Clock3} tone="warning" />
          <InfoCard label="Completed" value={completedCount} icon={CheckCircle2} tone="success" />
        </div>
      )}

      {loading ? (
        <div className="panel">
          <TableSkeleton rows={6} cols={5} />
        </div>
      ) : rows.length === 0 ? (
        <div className="panel">
          <EmptyState title="No exams scheduled yet" description="Exams for this child's class will appear here." icon={FileSpreadsheet} />
        </div>
      ) : (
        <div className="space-y-4">
          {byTerm.map(([term, termRows]) => (
            <SectionCard
              key={term}
              title={term}
              subtitle={`${classLabel} · ${termRows.length} exam${termRows.length === 1 ? "" : "s"}`}
              bodyClassName="p-0"
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Class & Section</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {termRows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.subject ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{classLabel}</TableCell>
                        <TableCell className="text-muted-foreground">{e.date ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={e.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
