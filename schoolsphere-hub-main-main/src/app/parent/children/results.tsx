"use client";

import { useState } from "react";
import { Award, Printer } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { GradeBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useResultsFor, useStudent, useSchoolProfile, useExamsFor } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

export default function ParentResultsPage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: results, isLoading } = useResultsFor(selectedChildId ?? undefined);
  const { data: student } = useStudent(selectedChildId ?? undefined);
  const { data: exams } = useExamsFor(selectedChildId ?? undefined);
  const { data: school } = useSchoolProfile();
  const [showReportCard, setShowReportCard] = useState(false);

  const examsById = new Map((exams ?? []).map((e) => [e.id, e]));
  const examLabel = (examId: string | null) => {
    const exam = examId ? examsById.get(examId) : undefined;
    if (!exam) return "Exam";
    return exam.term ? `${exam.subject ?? "Exam"} · ${exam.term}` : exam.subject ?? "Exam";
  };

  const rows = results ?? [];
  const totalMarks = rows.reduce((sum, r) => sum + (r.marks ?? 0), 0);
  const totalMax = rows.reduce((sum, r) => sum + r.max_marks, 0);
  const percentage = totalMax ? Math.round((totalMarks / totalMax) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Results"
        description="Exam results and report card."
        breadcrumb={["Dashboard", "My Children", "Results"]}
        actions={
          rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowReportCard(true)}>
              <Printer className="h-4 w-4" /> Report Card
            </Button>
          )
        }
      />
      <ChildSwitcher />

      <div className="panel">
        {childrenLoading || isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState title="No results published yet" description="Results for this child will appear here once published." icon={Award} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Published</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{examLabel(r.exam_id)}</TableCell>
                    <TableCell>
                      {r.marks ?? "—"} / {r.max_marks}
                    </TableCell>
                    <TableCell>{r.grade ? <GradeBadge grade={r.grade} /> : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.published_at?.slice(0, 10) ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={showReportCard} onOpenChange={setShowReportCard}>
        <DialogContent className="max-w-lg print:max-w-none">
          <DialogHeader>
            <DialogTitle>Report Card</DialogTitle>
          </DialogHeader>
          <SectionCard>
            <div className="space-y-3 p-2 text-sm">
              <div className="flex justify-between border-b border-dashed border-border pb-2">
                <span className="font-display font-bold text-primary">{school?.name ?? "School"}</span>
                <span className="text-xs text-muted-foreground">{school?.session}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student</span>
                <span>{student?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Class</span>
                <span>
                  {student?.class_name}
                  {student?.section ? `-${student.section}` : ""}
                </span>
              </div>
              <div className="space-y-1">
                {rows.map((r) => (
                  <div key={r.id} className="flex justify-between">
                    <span className="text-muted-foreground">{examLabel(r.exam_id)}</span>
                    <span>
                      {r.marks ?? "—"}/{r.max_marks} ({r.grade ?? "—"})
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Overall Percentage</span>
                <span>{percentage}%</span>
              </div>
            </div>
            <Button className="mt-4 w-full" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / Download
            </Button>
          </SectionCard>
        </DialogContent>
      </Dialog>
    </div>
  );
}
