"use client";

import { Link } from "react-router-dom";
import { useMemo } from "react";
import { CalendarCheck, FileSpreadsheet, Megaphone, NotebookPen, Wallet } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useAttendanceFor, useFeesFor, useHomeworkFor, useExamsFor, useNotices } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

export default function ParentDashboardPage() {
  const { selectedChild, selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceFor(selectedChildId ?? undefined);
  const { data: fees, isLoading: feesLoading } = useFeesFor(selectedChildId ?? undefined);
  const { data: homework, isLoading: homeworkLoading } = useHomeworkFor(selectedChildId ?? undefined);
  const { data: exams, isLoading: examsLoading } = useExamsFor(selectedChildId ?? undefined);
  const { data: notices, isLoading: noticesLoading } = useNotices();

  const attendancePct = useMemo(() => {
    const rows = attendance ?? [];
    if (rows.length === 0) return null;
    const present = rows.filter((r) => r.status === "Present").length;
    return Math.round((present / rows.length) * 100);
  }, [attendance]);

  const pendingFees = (fees ?? []).filter((f) => f.status !== "Paid").reduce((sum, f) => sum + f.amount - f.discount + f.fine, 0);
  const dueHomework = (homework ?? []).filter((h) => !h.submission_status || h.submission_status === "Pending").slice(0, 5);
  const upcomingExams = (exams ?? [])
    .filter((e) => e.status !== "Completed")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(0, 5);
  const recentNotices = (notices ?? []).slice(0, 5);

  const loading = childrenLoading || attendanceLoading || feesLoading || homeworkLoading || examsLoading;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={selectedChild ? `Overview for ${selectedChild.name}.` : "Overview for your child."}
        breadcrumb={["Dashboard"]}
      />
      <ChildSwitcher />

      {loading ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard label="Attendance" value={attendancePct !== null ? `${attendancePct}%` : "—"} icon={CalendarCheck} tone="navy" />
          <InfoCard label="Pending Fees" value={`₹${pendingFees.toLocaleString()}`} icon={Wallet} tone={pendingFees > 0 ? "warning" : "success"} />
          <InfoCard label="Homework Due" value={dueHomework.length} icon={NotebookPen} tone="info" />
          <InfoCard label="Upcoming Exams" value={upcomingExams.length} icon={FileSpreadsheet} tone="gold" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Homework Due" action={<Link to="/parent/children/homework" className="text-xs font-medium text-primary">View all</Link>}>
          {dueHomework.length === 0 ? (
            <EmptyState title="All caught up" description="No pending homework right now." icon={NotebookPen} />
          ) : (
            <ul className="space-y-2">
              {dueHomework.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{h.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{h.due_date ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Upcoming Exams" action={<Link to="/parent/children/exams" className="text-xs font-medium text-primary">View all</Link>}>
          {upcomingExams.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="No upcoming exams right now." icon={FileSpreadsheet} />
          ) : (
            <ul className="space-y-2">
              {upcomingExams.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{e.subject ?? "Exam"}</span>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent Notices"
          className="lg:col-span-2"
          action={<Link to="/notices" className="text-xs font-medium text-primary">View all</Link>}
        >
          {noticesLoading ? (
            <CardSkeleton count={2} />
          ) : recentNotices.length === 0 ? (
            <EmptyState title="No notices yet" description="School notices will appear here." icon={Megaphone} />
          ) : (
            <ul className="space-y-2">
              {recentNotices.map((n) => (
                <li key={n.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <p className="font-medium">{n.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{n.description}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
