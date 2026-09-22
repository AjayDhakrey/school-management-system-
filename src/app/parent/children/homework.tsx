"use client";

import { NotebookPen } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHomeworkFor } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

export default function ParentHomeworkPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: homework, isLoading } = useHomeworkFor(selectedChildId ?? undefined);

  const rows = homework ?? [];

  return (
    <div>
      <PageHeader title="Homework" description="Assignments and submission status." breadcrumb={["Dashboard", "My Children", "Homework"]} />
      <ChildSwitcher />

      <div className="panel">
        {childrenLoading || isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState title="No homework assigned yet" description="Homework for this child's class will appear here." icon={NotebookPen} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Submission</TableHead>
                  <TableHead>Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.title}</TableCell>
                    <TableCell className="text-muted-foreground">{h.subject ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{h.due_date ?? "—"}</TableCell>
                    <TableCell>
                      {h.submission_status ? (
                        <StatusBadge status={h.submission_status} />
                      ) : (
                        <StatusBadge status="Not Submitted" tone="warning" />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{h.submission_grade ?? "—"}</TableCell>
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
