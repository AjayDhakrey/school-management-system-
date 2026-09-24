"use client";

import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { CalendarCheck, FileSpreadsheet, Megaphone, NotebookPen, Wallet } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/shared/Badge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import timeIcon from "@/icons/time-table-icon.png";
import homeworkIcon from "@/icons/homework-icon.png";
import attendanceIcon from "@/icons/mark-attendance-icon.png";
import feesIcon from "@/icons/pay-fees-icon.png";
import transportIcon from "@/icons/transport-icon.png";
import leaveIcon from "@/icons/staff-leave-icon.png";
import {
  useAttendanceFor,
  useFeesFor,
  useHomeworkFor,
  useExamsFor,
  useNotices,
  isUpcomingExam,
  type ApiNotice,
} from "@/hooks/useApi";
import { NoticeDetailDialog } from "@/components/shared/NoticeDetailDialog";
import { useParentChild } from "@/lib/parent-child-context";

type ParentShortcut = { label: string; to: string; image: string };

const PARENT_SHORTCUTS: ParentShortcut[] = [
  { label: "Attendance", image: attendanceIcon, to: "/parent/children/attendance" },
  { label: "Timetable", image: timeIcon, to: "/parent/children/timetable" },
  { label: "Homework", image: homeworkIcon, to: "/parent/children/homework" },
  { label: "Pay Fees", image: feesIcon, to: "/parent/fees/pay" },
  { label: "Transport", image: transportIcon, to: "/parent/transport" },
  { label: "Leave", image: leaveIcon, to: "/parent/leave" },
];

export default function ParentDashboardPage() {
  const { selectedChild, selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceFor(selectedChildId ?? undefined);
  const { data: fees, isLoading: feesLoading } = useFeesFor(selectedChildId ?? undefined);
  const { data: homework, isLoading: homeworkLoading } = useHomeworkFor(selectedChildId ?? undefined);
  const { data: exams, isLoading: examsLoading } = useExamsFor(selectedChildId ?? undefined);
  const { data: notices, isLoading: noticesLoading } = useNotices();
  const [openNotice, setOpenNotice] = useState<ApiNotice | null>(null);

  const attendancePct = useMemo(() => {
    const rows = attendance ?? [];
    if (rows.length === 0) return null;
    const present = rows.filter((r) => r.status === "Present").length;
    return Math.round((present / rows.length) * 100);
  }, [attendance]);

  const pendingFees = (fees ?? []).filter((f) => f.status !== "Paid").reduce((sum, f) => sum + f.amount - f.discount + f.fine, 0);
  const dueHomework = (homework ?? []).filter((h) => !h.submission_status || h.submission_status === "Pending").slice(0, 5);
  const upcomingExams = (exams ?? [])
    .filter(isUpcomingExam)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(0, 5);
  const recentNotices = (notices ?? []).slice(0, 5);

  const pendingFeesCount = (fees ?? []).filter((f) => f.status !== "Paid").length;
  const loading = childrenLoading || attendanceLoading || feesLoading || homeworkLoading || examsLoading;

  const parentShortcutBadges: Record<string, number | undefined> = {
    Homework: dueHomework.length,
    "Pay Fees": pendingFeesCount,
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={selectedChild ? `Overview for ${selectedChild.name}.` : "Overview for your child."}
        breadcrumb={["Dashboard"]}
      />
      <ChildSwitcher />

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-8">
        {PARENT_SHORTCUTS.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="panel bg-card group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center shadow-md shadow-gray-300 transition-all hover:-translate-y-0.5"
          >
            <span className="relative grid h-12 w-12 shrink-0 place-items-center sm:h-11 sm:w-11">
              <img
                src={a.image}
                alt=""
                width={48}
                height={48}
                decoding="async"
                className="h-12 w-12 object-contain [image-rendering:-webkit-optimize-contrast] sm:h-11 sm:w-11"
              />
              <Badge count={parentShortcutBadges[a.label]} />
            </span>
            <span className="max-w-[80px] break-words text-[12px] leading-[1.2] font-semibold sm:max-w-none sm:text-xs">
              {a.label}
            </span>
          </Link>
        ))}
      </div>

      {loading ? (
        <div className="mt-3">
          <CardSkeleton count={4} />
        </div>
      ) : (
        <div className="mt-3 mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setOpenNotice(n)}
                    className="block w-full rounded-lg bg-muted/50 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <p className="font-medium">{n.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {n.description}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-primary">Read more</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <NoticeDetailDialog notice={openNotice} onClose={() => setOpenNotice(null)} />
      </div>
    </div>
  );
}
