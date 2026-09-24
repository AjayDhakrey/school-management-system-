import { useState } from "react";
import { Link } from "react-router-dom";
import {
  UserCog,
  Users,
  BookOpen,
  Megaphone,
  Layers,
  CalendarDays,
  Clock,
  ArrowUpRight,
  School,
  CheckCircle2,
  XCircle,
  Hourglass,
  CreditCard,
  Building2,
  CalendarClock,
  NotebookPen,
  ClipboardCheck,
  FileSpreadsheet,
  Award,
  Wallet,
  Bus,
  CalendarHeart,
  Bell,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { SchoolCalendar } from "@/components/shared/SchoolCalendar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Initials, PageHeader } from "@/components/shared/ui-kit";
import { ProgressBar } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DAYS, PERIODS } from "@/data/mock";
import classes from "@/icons/add-class-icon.png"
import students from "@/icons/add-student-icon.png"
import subjectsIcon from "@/icons/subjects-icon.png";
import timeIcon from "@/icons/time-table-icon.png"
import homeworkIcon from "@/icons/homework-icon.png"
import attendanceIcon from "@/icons/mark-attendance-icon.png"
import examIcon from "@/icons/exam-icon.png"
import resultIcon from "@/icons/result-icon.png"
import feesIcon from "@/icons/pay-fees-icon.png"
import leaveIcon from "@/icons/staff-leave-icon.png"
import transportIcon from "@/icons/transport-icon.png"
import holidaysIcon from "@/icons/holidays-icon.png"
import feeStructureIcon from "@/icons/Add-fees-icon.png"
import payrollIcon from "@/icons/Add-staff-icon.png"
import addNoticeIcon from "@/icons/add-notice-icon.png"
import driversIcon from "@/icons/drivers.png"
import maintenanceIcon from "@/icons/maintenance.png"
import { cn } from "@/lib/utils";
import { QUICK_ACTION_ASSETS } from "@/lib/siteData";
import { useAuth, toDisplayRole } from "@/lib/auth-context";
import { canView } from "@/lib/permissions";
import { ROUTE_ROLES } from "@/lib/navigation";
import {
  useStudents,
  useAdmissions,
  useHomework,
  useFees,
  useNotices,
  useExams,
  useTimetable,
  useSchools,
  useAttendance,
  useResults,
  useNotifications,
  useMyStudentProfile,
  useMyTeacherProfile,
  useTeacherAttendance,
  useLeaveRequests,
  useHolidays,
  useTransport,
  useTransportComplaints,
  isUpcomingExam,
  type ApiNotice,
} from "@/hooks/useApi";
import { NoticeDetailDialog } from "@/components/shared/NoticeDetailDialog";

type Action = { label: string; icon: LucideIcon; to?: string; value?: string };
type ImageAction = { label: string; icon: string; to?: string; tone?: "gold" | "navy" | "info" };

const actions: ImageAction[] = QUICK_ACTION_ASSETS;

export default function Dashboard() {
  const { user } = useAuth();

  if (user?.role === "SUPER_ADMIN") return <SuperAdminDashboard />;
  if (user?.role === "STUDENT") return <StudentDashboard />;
  if (user?.role === "TEACHER") return <TeacherDashboard />;
  if (toDisplayRole(user) === "Accountant") return <AccountantDashboard />;
  if (toDisplayRole(user) === "Transport Manager") return <TransportManagerDashboard />;
  return <SchoolDashboard />;
}

type StudentShortcut = { label: string; to: string; icon?: LucideIcon; image?: string };

const STUDENT_SHORTCUTS: StudentShortcut[] = [
  { label: "Subjects", image: subjectsIcon, to: "/my-subjects" },
  { label: "Timetable", image: timeIcon, to: "/timetable" },
  { label: "Homework", image: homeworkIcon, to: "/homework" },
  { label: "Attendance", image: attendanceIcon, to: "/attendance" },
  { label: "Exams", image: examIcon, to: "/examinations" },
  { label: "Results", image: resultIcon, to: "/results" },
  { label: "Pay Fees", image:  feesIcon, to: "/my-fees" },
  { label: "Transport", image: transportIcon, to: "/transport" },
  { label: "Holidays", image: holidaysIcon, to: "/holidays" },
];

function StudentDashboard() {
  const { user } = useAuth();
  const { data: profile } = useMyStudentProfile();
  const { data: todaySlots } = useTimetable();
  const { data: attendance } = useAttendance();
  const { data: homework } = useHomework();
  const { data: exams } = useExams();
  const { data: results } = useResults();
  const { data: fees } = useFees();
  const { data: notices } = useNotices();
  const [openNotice, setOpenNotice] = useState<ApiNotice | null>(null);
  const { data: notifications } = useNotifications();

  const todayDay = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const today = (todaySlots ?? []).filter((s) => s.day === todayDay).sort((a, b) => a.period - b.period);

  const presentCount = (attendance ?? []).filter((a) => a.status === "Present").length;
  const attendancePct = attendance && attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : profile?.attendance ?? 0;

  const pendingHomework = (homework ?? []).filter((h) => !h.submission_status || h.submission_status === "Pending");
  const upcomingExamsAll = (exams ?? []).filter(isUpcomingExam);
  const upcomingExams = upcomingExamsAll.slice(0, 3);
  const latestResults = [...(results ?? [])].slice(-3).reverse();
  const pendingFees = (fees ?? []).filter((f) => f.status !== "Paid");
  const pendingFeeTotal = pendingFees.reduce((sum, f) => sum + Math.max(0, f.amount - f.discount + f.fine), 0);
  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name ?? "Student"}`}
        {...(profile ? { description: `${profile.class_name ?? ""} ${profile.section ?? ""} · Roll #${profile.roll ?? "—"}` } : {})}
      />

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 lg:grid-cols-9 md:grid-cols-6">
        {STUDENT_SHORTCUTS.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="panel bg-card group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center shadow-md shadow-gray-300 transition-all hover:-translate-y-0.5"
           
          >
            {a.image ? (
              <span className="relative grid h-12 w-12 shrink-0 place-items-center sm:h-11 sm:w-11">
                <img
                  src={a.image}
                  alt=""
                  width={48}
                  height={48}
                  decoding="async"
                  className="h-12 w-12 object-contain [image-rendering:-webkit-optimize-contrast] sm:h-11 sm:w-11"
                />
              </span>
            ) : (
              a.icon && (
                <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#3882F6]/80 text-white">
                  <a.icon className="h-5 w-5" />
                </span>
              )
            )}
            <span className="max-w-[80px] break-words text-[12px] leading-[1.2] font-semibold sm:max-w-none sm:text-xs">
              {a.label}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/80 text-white">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{attendancePct}%</span>
            <span className="block truncate text-[11px] text-muted-foreground">Attendance</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/80 text-white">
            <NotebookPen className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{pendingHomework.length}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Pending Homework</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/80 text-white">
            <Wallet className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">₹{pendingFeeTotal.toLocaleString()}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Pending Fees</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/80 text-white">
            <Bell className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{unreadCount}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Unread Notifications</span>
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <SectionCard title="Today's Timetable" subtitle={todayDay} bodyClassName="space-y-2">
          {today.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No classes scheduled today.</p>
          ) : (
            today.slice(0, 6).map((slot) => (
              <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{slot.subject}</p>
                  <p className="truncate text-[11px] text-muted-foreground">Period {slot.period}</p>
                </div>
              </div>
            ))
          )}
        </SectionCard>

        <SectionCard
          title="Notices"
          subtitle="Latest updates"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/notices">
                All notices <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
          bodyClassName="space-y-2"
        >
          {(notices ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No notices yet.</p>
          ) : (
            (notices ?? []).slice(0, 4).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setOpenNotice(n)}
                className="block w-full rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{n.title}</p>
                  {!n.read && <StatusBadge status="New" />}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{n.date}</p>
              </button>
            ))
          )}
        </SectionCard>
        <NoticeDetailDialog notice={openNotice} onClose={() => setOpenNotice(null)} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <SectionCard title="Upcoming Exams" subtitle="Scheduled for your class" bodyClassName="space-y-2">
          {upcomingExams.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No scheduled exams.</p>
          ) : (
            upcomingExams.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <p className="truncate text-sm font-medium">{e.subject}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground">{e.date}</span>
              </div>
            ))
          )}
        </SectionCard>

        <SectionCard title="Latest Results" subtitle="Most recent scores" bodyClassName="space-y-2">
          {latestResults.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No results published yet.</p>
          ) : (
            latestResults.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <span className="text-sm">Marks: {r.marks ?? "—"}</span>
                <StatusBadge status={r.grade ?? "—"} />
              </div>
            ))
          )}
        </SectionCard>
      </div>
    </div>
  );
}

type TeacherShortcut = { label: string; to: string; icon?: LucideIcon; image?: string };

const TEACHER_SHORTCUTS: TeacherShortcut[] = [
  { label: "Classes", image: classes, to: "/teacher/classes" },
  { label: "Students", image: students, to: "/teacher/students" },
  { label: "Subjects", image: subjectsIcon, to: "/teacher/subjects" },
  { label: "Timetable", image: timeIcon, to: "/timetable" },
  { label: "Attendance", image: attendanceIcon, to: "/attendance" },
  { label: "Homework", image: homeworkIcon, to: "/homework" },
  { label: "Exams", image: examIcon, to: "/examinations" },
  { label: "Results", image: resultIcon, to: "/results" },
  { label: "Leave", image: leaveIcon, to: "/leave/teachers" },
];

function TeacherDashboard() {
  const { user } = useAuth();
  const { data: profile } = useMyTeacherProfile();
  const { data: students } = useStudents();
  const { data: todaySlots } = useTimetable();
  const { data: homework } = useHomework();
  const { data: exams } = useExams();
  const { data: myAttendance } = useTeacherAttendance();
  const { data: leaveRequests } = useLeaveRequests("TEACHER");
  const { data: notices } = useNotices();
  const [openNotice, setOpenNotice] = useState<ApiNotice | null>(null);
  const { data: notifications } = useNotifications();

  const assignedClassCount = profile ? (JSON.parse(profile.assigned_classes) as string[]).length : 0;
  const todayDay = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const today = (todaySlots ?? [])
    .filter((s) => s.day === todayDay && s.teacher_id === profile?.id)
    .sort((a, b) => a.period - b.period);

  const myHomework = (homework ?? []).filter((h) => h.teacher_id === profile?.id);
  const upcomingExamsAll = (exams ?? []).filter(isUpcomingExam);
  const upcomingExams = upcomingExamsAll.slice(0, 4);
  const todayAttendance = (myAttendance ?? []).find((a) => a.date === new Date().toISOString().slice(0, 10));
  const latestLeave = [...(leaveRequests ?? [])].sort((a, b) => (a.from_date ?? "").localeCompare(b.from_date ?? "")).at(-1);
  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name ?? "Teacher"}`}
        {...(profile
          ? {
              description: `${profile.designation ?? "Teacher"} · ${profile.department ?? "—"} · Employee ID: ${profile.id.slice(0, 8).toUpperCase()}`,
            }
          : {})}
      />

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 lg:grid-cols-9 md:grid-cols-6">
        {TEACHER_SHORTCUTS.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="panel bg-card group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition-all shadow-md shadow-gray-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
          >
            {a.image ? (
              <span className="relative grid h-12 w-12 shrink-0 place-items-center sm:h-11 sm:w-11">
                <img
                  src={a.image}
                  alt=""
                  width={48}
                  height={48}
                  decoding="async"
                  className="h-12 w-12 object-contain [image-rendering:-webkit-optimize-contrast] sm:h-11 sm:w-11"
                />
              </span>
            ) : (
              a.icon && (
                <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#3882F6]/80 text-white">
                  <a.icon className="h-5 w-5" />
                </span>
              )
            )}
            <span className="max-w-[80px] break-words text-[12px] leading-[1.2] font-semibold sm:max-w-none sm:text-xs">
              {a.label}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/80 text-white">
            <Layers className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{assignedClassCount}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Assigned Classes</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-info/80 text-white">
            <Users className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{(students ?? []).length}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Total Students</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/80 text-white">
            <NotebookPen className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{myHomework.length}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Homework Assigned</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/80 text-white">
            <Bell className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{unreadCount}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Unread Notifications</span>
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <SectionCard title="Today's Timetable" subtitle={todayDay} bodyClassName="space-y-2">
          {today.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No classes scheduled today.</p>
          ) : (
            today.slice(0, 6).map((slot) => (
              <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{slot.subject}</p>
                  <p className="truncate text-[11px] text-muted-foreground">Period {slot.period}</p>
                </div>
              </div>
            ))
          )}
        </SectionCard>

        <SectionCard
          title="Attendance & Leave"
          subtitle="Your own status today"
          bodyClassName="space-y-2"
        >
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
            <span className="text-sm">Today's Status</span>
            <StatusBadge status={todayAttendance ? (todayAttendance.check_out ? "Checked Out" : "Checked In") : "Not Marked"} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
            <span className="text-sm">Latest Leave Request</span>
            <StatusBadge status={latestLeave?.status ?? "None"} />
          </div>
        </SectionCard>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <SectionCard title="Upcoming Exams" subtitle="In your assigned classes" bodyClassName="space-y-2">
          {upcomingExams.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No scheduled exams.</p>
          ) : (
            upcomingExams.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <p className="truncate text-sm font-medium">{e.subject}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground">{e.date}</span>
              </div>
            ))
          )}
        </SectionCard>

        <SectionCard
          title="Notices"
          subtitle="Latest updates"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/notices">
                All notices <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
          bodyClassName="space-y-2"
        >
          {(notices ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No notices yet.</p>
          ) : (
            (notices ?? []).slice(0, 4).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setOpenNotice(n)}
                className="block w-full rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <p className="truncate text-sm font-semibold">{n.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{n.date}</p>
              </button>
            ))
          )}
        </SectionCard>
        <NoticeDetailDialog notice={openNotice} onClose={() => setOpenNotice(null)} />
      </div>
    </div>
  );
}

type AccountantShortcut = { label: string; to: string; image: string };

const ACCOUNTANT_SHORTCUTS: AccountantShortcut[] = [
  { label: "Collect Fees", image: feesIcon, to: "/fees/collection" },
  { label: "Fee Structure", image: feeStructureIcon, to: "/fees/structure" },
  { label: "Pending Fees", image: feesIcon, to: "/fees/pending" },
  { label: "Fee Reports", image: feeStructureIcon, to: "/fees/reports" },
  { label: "Payroll", image: payrollIcon, to: "/payroll" },
  { label: "My Salary", image: feesIcon, to: "/my-salary" },
  { label: "Staff Leave", image: leaveIcon, to: "/leave/staff" },
  { label: "My Attendance", image: attendanceIcon, to: "/staff/my-attendance" },
];

function AccountantDashboard() {
  const { user } = useAuth();
  const { data: fees } = useFees();
  const { data: leaveRequests } = useLeaveRequests("STAFF");
  const { data: notices } = useNotices();
  const [openNotice, setOpenNotice] = useState<ApiNotice | null>(null);
  const { data: notifications } = useNotifications();

  const pendingFees = (fees ?? []).filter((f) => f.status !== "Paid");
  const pendingFeeTotal = pendingFees.reduce(
    (sum, f) => sum + Math.max(0, f.amount - f.discount + f.fine),
    0,
  );
  const pendingLeaveCount = (leaveRequests ?? []).filter((l) => l.status === "Pending").length;
  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name ?? "Accountant"}`}
        description="Manage fee collection, payroll and financial reporting."
      />

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 lg:grid-cols-9 md:grid-cols-6">
        {ACCOUNTANT_SHORTCUTS.map((a) => (
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
            </span>
            <span className="max-w-[80px] break-words text-[12px] leading-[1.2] font-semibold sm:max-w-none sm:text-xs">
              {a.label}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/80 text-white">
            <Wallet className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">
              ₹{pendingFeeTotal.toLocaleString()}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">Pending Fee Amount</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/80 text-white">
            <Hourglass className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{pendingLeaveCount}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Pending Staff Leave</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/80 text-white">
            <Bell className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{unreadCount}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Unread Notifications</span>
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <SectionCard
          title="Notices"
          subtitle="Latest updates"
          className="lg:col-span-2"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/notices">
                All notices <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
          bodyClassName="space-y-2"
        >
          {(notices ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No notices yet.</p>
          ) : (
            (notices ?? []).slice(0, 4).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setOpenNotice(n)}
                className="block w-full rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <p className="truncate text-sm font-semibold">{n.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{n.date}</p>
              </button>
            ))
          )}
        </SectionCard>
        <NoticeDetailDialog notice={openNotice} onClose={() => setOpenNotice(null)} />
      </div>
    </div>
  );
}

const TRANSPORT_SHORTCUTS: ImageAction[] = [
  { label: "Transport", icon: transportIcon, to: "/transport" },
  { label: "Drivers", icon: driversIcon, to: "/transport/drivers" },
  { label: "Attendance", icon: attendanceIcon, to: "/transport/attendance" },
  { label: "Maintenance", icon: maintenanceIcon, to: "/transport/maintenance" },
  { label: "Complaints", icon: addNoticeIcon, to: "/transport/complaints" },
  { label: "T-Fees", icon: feesIcon, to: "/transport/fees" },
];

function TransportManagerDashboard() {
  const { user } = useAuth();
  const { data: vehicles } = useTransport();
  const { data: complaints } = useTransportComplaints();
  const { data: notices } = useNotices();
  const [openNotice, setOpenNotice] = useState<ApiNotice | null>(null);

  const vehicleRows = vehicles ?? [];
  const onRoute = vehicleRows.filter((v) => v.status === "On Route").length;
  const studentsOnTransport = vehicleRows.reduce((sum, v) => sum + v.occupied, 0);
  const openComplaints = (complaints ?? []).filter(
    (c) => c.status === "Open" || c.status === "In Progress",
  ).length;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name ?? "Transport Manager"}`}
        description="Manage the fleet, drivers, student transport and safety records."
      />

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 lg:grid-cols-8 md:grid-cols-4">
        {TRANSPORT_SHORTCUTS.map((a) => (
          <Link
            key={a.label}
            to={a.to ?? "/"}
            className="panel bg-card group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center shadow-md shadow-gray-300 transition-all hover:-translate-y-0.5"
          >
            <span className="relative grid h-12 w-12 shrink-0 place-items-center sm:h-11 sm:w-11">
              <img
                src={a.icon}
                alt=""
                width={48}
                height={48}
                decoding="async"
                className="h-12 w-12 object-contain [image-rendering:-webkit-optimize-contrast] sm:h-11 sm:w-11"
              />
            </span>
            <span className="max-w-[80px] break-words text-[12px] leading-[1.2] font-semibold sm:max-w-none sm:text-xs">
              {a.label}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/80 text-white">
            <Bus className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{onRoute}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Vehicles On Route</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/80 text-white">
            <Users className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{studentsOnTransport}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Students on Transport</span>
          </span>
        </div>
        <div className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/80 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight font-bold">{openComplaints}</span>
            <span className="block truncate text-[11px] text-muted-foreground">Open Complaints</span>
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <SectionCard
          title="Notices"
          subtitle="Latest updates"
          className="lg:col-span-2"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/notices">
                All notices <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
          bodyClassName="space-y-2"
        >
          {(notices ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No notices yet.</p>
          ) : (
            (notices ?? []).slice(0, 4).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setOpenNotice(n)}
                className="block w-full rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <p className="truncate text-sm font-semibold">{n.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{n.date}</p>
              </button>
            ))
          )}
        </SectionCard>
        <NoticeDetailDialog notice={openNotice} onClose={() => setOpenNotice(null)} />
      </div>
    </div>
  );
}

function SuperAdminDashboard() {
  const { data: schools, isLoading } = useSchools();
  const rows = schools ?? [];

  const totalSchools = rows.length;
  const active = rows.filter((s) => s.status === "ACTIVE").length;
  const inactive = rows.filter((s) => s.status === "INACTIVE" || s.status === "SUSPENDED").length;
  const trial = rows.filter((s) => s.status === "TRIAL").length;
  const expired = rows.filter((s) => s.status === "EXPIRED").length;
  const activeSubscriptions = rows.filter((s) => s.payment_status === "PAID" && s.status === "ACTIVE").length;
  const expiringSoon = rows.filter((s) => {
    if (!s.subscription_expires_at) return false;
    const days = (new Date(s.subscription_expires_at).getTime() - Date.now()) / 86_400_000;
    return days >= 0 && days <= 30;
  }).length;
  const registeredAdmins = rows.filter((s) => s.admin).length;

  const platformTotals: Action[] = [
    { label: "Total Schools", icon: School, value: String(totalSchools) },
    { label: "Active Schools", icon: CheckCircle2, value: String(active) },
    { label: "Trial Schools", icon: Hourglass, value: String(trial) },
    { label: "Inactive Schools", icon: XCircle, value: String(inactive) },
    { label: "Expired", icon: XCircle, value: String(expired) },
  ];

  const platformSaas: Action[] = [
    { label: "Active Subscriptions", icon: CreditCard, value: String(activeSubscriptions) },
    { label: "Expiring Within 30 Days", icon: Hourglass, value: String(expiringSoon) },
    { label: "Registered School Admins", icon: UserCog, value: String(registeredAdmins) },
  ];

  return (
    <div>
      <PageHeader
        title="Platform Overview"
        description="SaaS-level view across every school on the platform."
        actions={
          <Button size="sm" asChild>
            <Link to="/super-admin/schools">
              <Building2 className="h-4 w-4" /> Manage Schools
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {platformTotals.map((t) => (
          <div key={t.label} className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#3882F6]/80 text-white">
              <t.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-lg leading-tight font-bold">{t.value}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{t.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {platformSaas.map((t) => (
          <div key={t.label} className="panel bg-card flex items-center gap-3 p-3.5 shadow-md shadow-gray-300">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/80 text-white">
              <t.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-lg leading-tight font-bold">{t.value}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{t.label}</span>
            </span>
          </div>
        ))}
      </div>

      <SectionCard title="Schools" subtitle={`${totalSchools} schools on the platform`} className="mt-4" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>School Admin</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {rows.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => (window.location.href = `/super-admin/schools/${s.id}`)}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2">
                      <Initials name={s.short_name} className="h-8 w-8 text-[10px]" tone="info" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{s.id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.admin?.email ?? "Not assigned"}</TableCell>
                  <TableCell className="text-sm">{s.plan}</TableCell>
                  <TableCell className="text-sm">
                    <StatusBadge status={s.payment_status ?? "PENDING"} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.subscription_expires_at ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={s.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}

function SchoolDashboard() {
  const { user } = useAuth();
  const displayRole = toDisplayRole(user);
  const quickActions = actions.filter((a) => !a.to || (ROUTE_ROLES[a.to] ?? []).includes(displayRole));

  const canAdmissions = canView(user, "admissions");
  const canHomework = canView(user, "homework");
  const canFees = canView(user, "fees");
  const canNotices = canView(user, "notices");
  const canExams = canView(user, "results") || canView(user, "homework");
  const canTimetable = canView(user, "timetable");

  const { data: admissions } = useAdmissions(canAdmissions);
  const { data: homework } = useHomework(canHomework && !canAdmissions);
  const { data: fees } = useFees(canFees && !canAdmissions && !canHomework);
  const { data: notices } = useNotices(canNotices);
  const [openNotice, setOpenNotice] = useState<ApiNotice | null>(null);
  const { data: exams } = useExams(canExams);
  const { data: todaySlots } = useTimetable(canTimetable);
  const { data: holidays } = useHolidays();

  const todayDay = DAYS[2] as string;
  const today = (todaySlots ?? []).filter((s) => s.day === todayDay).sort((a, b) => a.period - b.period);

  const upcomingHolidays = (holidays ?? [])
    .filter((h) => new Date(h.date) >= new Date(new Date().toISOString().slice(0, 10)))
    .slice(0, 4);

  type RecentItem = { id: string; text: string; type: string; date: string };
  const recentActivity: RecentItem[] = [
    ...(canAdmissions ? (admissions ?? []) : [])
      .filter((a) => a.applied_on)
      .map((a) => ({ id: `adm-${a.id}`, text: `${a.applicant} applied for admission (${a.status})`, type: "Admission", date: a.applied_on! })),
    ...(canFees ? (fees ?? []) : [])
      .filter((f) => f.status === "Paid" && f.paid_on)
      .map((f) => ({ id: `fee-${f.id}`, text: `Fee payment received — ₹${f.amount.toLocaleString()}`, type: "Fees", date: f.paid_on! })),
    ...(canNotices ? (notices ?? []) : [])
      .filter((n) => n.date)
      .map((n) => ({ id: `notice-${n.id}`, text: n.title, type: "Notice", date: n.date! })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 lg:grid-cols-9 md:grid-cols-6">
        {quickActions.map((a) => (
          <Link
            key={a.label}
            to={a.to ?? "/"}
            className="panel bg-card group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center shadow-md shadow-gray-300 transition-all hover:-translate-y-0.5"
          >
            <span className="relative grid h-12 w-12 shrink-0 place-items-center sm:h-11 sm:w-11">
              <img
                src={a.icon}
                alt=""
                width={48}
                height={48}
                decoding="async"
                className="h-12 w-12 object-contain [image-rendering:-webkit-optimize-contrast] sm:h-11 sm:w-11"
              />
            </span>
            <span className="max-w-[80px] break-words text-[12px] leading-[1.2] font-semibold sm:max-w-none sm:text-xs">
              {a.label}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:grid-rows-2">
        <SectionCard
          className="order-1 lg:order-none lg:col-start-2 lg:row-start-1"
          title="Notice Board"
          subtitle="Latest circulars and announcements"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/notices">
                All notices <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
          bodyClassName="space-y-2.5"
        >
          {(notices ?? []).slice(0, 4).map((n, i) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setOpenNotice(n)}
              className={cn(
                "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:bg-accent",
                i % 2 === 0 ? "bg-gold-soft/50" : "bg-info-soft/50",
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface text-primary shadow-sm">
                {n.category === "Event" ? (
                  <CalendarDays className="h-4.5 w-4.5" />
                ) : n.category === "Examination" ? (
                  <BookOpen className="h-4.5 w-4.5" />
                ) : (
                  <Megaphone className="h-4.5 w-4.5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{n.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.description}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  {n.date} · {n.author}
                </p>
              </div>
              {n.priority && <StatusBadge status={n.priority} />}
            </button>
          ))}
          {canNotices && (notices ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No notices yet.</p>
          )}
        </SectionCard>
        <NoticeDetailDialog notice={openNotice} onClose={() => setOpenNotice(null)} />

        {canAdmissions ? (
          <SectionCard
            className="order-2 lg:order-none lg:col-start-1 lg:row-start-2"
            title="Recent Admissions"
            subtitle="Latest applications received"
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="hidden sm:table-cell">Applied</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(admissions ?? []).slice(0, 5).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2">
                          <Initials name={a.applicant} className="h-8 w-8 text-[10px]" tone="info" />
                          <p className="truncate text-sm font-medium">{a.applicant}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{a.class_applied}</TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">{a.applied_on}</TableCell>
                      <TableCell className="text-right">
                        <StatusBadge status={a.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        ) : canHomework ? (
          <SectionCard
            className="order-2 lg:order-none lg:col-start-1 lg:row-start-2"
            title="Homework"
            subtitle="Assignments due soon"
            bodyClassName="space-y-2"
          >
            {(homework ?? []).slice(0, 5).map((h) => (
              <div key={h.id} className="rounded-xl border border-border px-3 py-2">
                <p className="truncate text-sm font-semibold">{h.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {h.subject} · Due {h.due_date}
                </p>
              </div>
            ))}
          </SectionCard>
        ) : canFees ? (
          <SectionCard
            className="order-2 lg:order-none lg:col-start-1 lg:row-start-2"
            title="Fees"
            subtitle="Recent fee records"
            bodyClassName="space-y-2"
          >
            {(fees ?? []).slice(0, 5).map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <span className="text-sm">₹{f.amount.toLocaleString()}</span>
                <StatusBadge status={f.status} />
              </div>
            ))}
          </SectionCard>
        ) : (
          <SectionCard
            className="order-2 lg:order-none lg:col-start-1 lg:row-start-2"
            title="Welcome"
            subtitle="Your recent activity will appear here"
            bodyClassName="p-6 text-center text-sm text-muted-foreground"
          >
            Nothing to show yet.
          </SectionCard>
        )}

        <SectionCard className="order-3 lg:order-none lg:col-start-1 lg:row-start-1" title="Academic Calendar" subtitle="August 2026">
          <SchoolCalendar />
        </SectionCard>

        <SectionCard
          className="order-4 lg:order-none lg:col-start-2 lg:row-start-2"
          title="Recent Activity"
          subtitle="What happened across the campus recently"
          bodyClassName="space-y-3"
        >
          {recentActivity.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing to show yet.</p>
          ) : (
            recentActivity.map((a) => (
              <div key={a.id} className="flex items-start gap-3">
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm">{a.text}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.type} · {a.date}
                  </p>
                </div>
              </div>
            ))
          )}
        </SectionCard>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <SectionCard title="Today's Classes" subtitle={todayDay} bodyClassName="space-y-2">
          {today.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No classes scheduled today.</p>
          ) : (
            today.slice(0, 5).map((slot, i) => (
              <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{slot.subject}</p>
                  <p className="truncate text-[11px] text-muted-foreground">Period {slot.period}</p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{PERIODS[i]?.time}</span>
              </div>
            ))
          )}
        </SectionCard>

        <SectionCard title="Upcoming Holidays" subtitle="Next on the school calendar" bodyClassName="space-y-2">
          {upcomingHolidays.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No upcoming holidays.</p>
          ) : (
            upcomingHolidays.map((h) => (
              <div key={h.id} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{h.name}</p>
                  {h.type && <StatusBadge status={h.type} tone="info" />}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {h.date} {h.day ? `· ${h.day}` : ""}
                </p>
              </div>
            ))
          )}
        </SectionCard>

        <SectionCard title="Upcoming Exams" subtitle="Scheduled assessments" bodyClassName="space-y-2.5">
          {(exams ?? [])
            .filter(isUpcomingExam)
            .slice(0, 4)
            .map((e) => (
              <div key={e.id} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{e.subject}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{e.date}</span>
                </div>
                <ProgressBar className="mt-2" tone="gold" value={40 + (e.id.charCodeAt(0) % 50)} />
              </div>
            ))}
          {canExams && (exams ?? []).filter(isUpcomingExam).length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No scheduled exams.</p>
          )}
        </SectionCard>
      </div>
    </>
  );
}
