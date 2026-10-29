"use client";

import { CalendarDays, NotebookPen } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { GradeBadge, StatusBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHomeworkFor } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

function formatHomeworkDate(value: string | null | undefined) {
  if (!value) return "No due date";

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ParentHomeworkPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: homework, isLoading } = useHomeworkFor(selectedChildId ?? undefined);

  const rows = homework ?? [];

  return (
    <div>
      <PageHeader
        title="Homework"
        description="Assignments and submission status."
        breadcrumb={["Dashboard", "My Children", "Homework"]}
      />
      <ChildSwitcher />

      <div className="panel overflow-hidden">
        {childrenLoading || isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No homework assigned yet"
            description="Homework for this child's class will appear here."
            icon={NotebookPen}
          />
        ) : (
          <>
            <div className="space-y-3 p-2.5 md:hidden">
              <div className="flex items-center justify-between px-1 pb-0.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <NotebookPen className="h-4 w-4 text-primary" />
                  Assignments
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {rows.length} {rows.length === 1 ? "item" : "items"}
                </span>
              </div>

              {rows.map((h) => {
                const hasGrade = Boolean(h.submission_grade && h.submission_grade !== "—");

                return (
                  <article
                    key={h.id}
                    className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-shadow active:scale-[0.99]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <NotebookPen className="h-4.5 w-4.5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="mb-0.5 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {h.subject ?? "General assignment"}
                        </p>
                        <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                          {h.title}
                        </h2>
                      </div>

                      {h.submission_status ? (
                        <StatusBadge status={h.submission_status} className="mt-0.5" />
                      ) : (
                        <StatusBadge status="Not Submitted" tone="warning" className="mt-0.5" />
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/60 bg-muted/35 px-3 py-2.5">
                      <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Due date
                        </p>
                        <time
                          dateTime={h.due_date ?? undefined}
                          className="mt-0.5 block truncate text-xs font-semibold text-foreground"
                        >
                          {formatHomeworkDate(h.due_date)}
                        </time>
                      </div>

                      <div className="h-7 w-px bg-border/70" />

                      <div className="shrink-0 text-right">
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Grade
                        </p>
                        {hasGrade ? (
                          <GradeBadge grade={h.submission_grade!} />
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">
                            Not graded
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
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
                      <TableCell className="text-muted-foreground">
                        {formatHomeworkDate(h.due_date)}
                      </TableCell>
                      <TableCell>
                        {h.submission_status ? (
                          <StatusBadge status={h.submission_status} />
                        ) : (
                          <StatusBadge status="Not Submitted" tone="warning" />
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {h.submission_grade ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
