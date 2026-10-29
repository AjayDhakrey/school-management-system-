"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSchoolTimings } from "@/lib/school-timings";
import { AttendanceHistory } from "@/components/shared/AttendanceHistory";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  CalendarClock,
  CalendarCheck,
  LogIn,
  LogOut,
  Clock3,
  AlertTriangle,
  CircleDashed,
  School,
  Download,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  ArrowRight,
} from "lucide-react";
import { PageHeader, EmptyState, Initials, TableSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard, ProgressBar } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  useAttendance,
  useAttendanceRoster,
  useAttendanceSummary,
  useClasses,
  useMyTeacherProfile,
  useStaffAttendance,
  useHolidays,
  useStaffAttendanceRoster,
  useTeacherAttendance,
  useTeacherAttendanceRoster,
  type ApiAttendanceRoster,
  type ApiAttendanceRosterStudent,
  type ApiAttendanceSummary,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

// The whole app's attendance vocabulary — matches server attendance-helpers.ts ATTENDANCE_STATUSES.
const STATUS_OPTIONS = ["Present", "Absent", "Late", "Leave"] as const;
type Status = (typeof STATUS_OPTIONS)[number];
const STAFF_DEPARTMENTS = ["ADMIN", "ACCOUNTS", "LIBRARY", "TRANSPORT"] as const;

const STATUS_TONE: Record<Status, string> = {
  Present: "bg-success-soft text-success border-success/25",
  Absent: "bg-destructive-soft text-destructive border-destructive/25",
  Late: "bg-warning-soft text-warning border-warning/30",
  Leave: "bg-info-soft text-info border-info/25",
};
const LETTER: Record<Status, string> = { Present: "P", Absent: "A", Late: "L", Leave: "Lv" };

// The school's calendar day (India), the same "today" the server uses (app_local_today).
const localDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const todayStr = () => localDate();
const monthStr = (d = new Date()) => localDate(d).slice(0, 7);

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentAttendanceView />;
  if (user?.role === "TEACHER") return <TeacherAttendanceView />;
  return <AdminAttendanceView />;
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function StatusToggle({
  value,
  onChange,
  options = STATUS_OPTIONS,
  isDisabled,
}: {
  value: Status | null;
  onChange: (s: Status) => void;
  options?: readonly Status[];
  isDisabled?: ((s: Status) => boolean) | undefined;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-border">
      {options.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={value === s}
          disabled={isDisabled?.(s)}
          onClick={() => onChange(s)}
          className={cn(
            "px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            value === s ? STATUS_TONE[s] : "bg-surface text-muted-foreground hover:bg-muted",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function SummaryCards({ summary }: { summary: ApiAttendanceSummary | undefined }) {
  const s = summary ?? {
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    eligible: 0,
    percentage: 0,
    total: 0,
  };
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <InfoCard label="Attendance %" value={`${s.percentage}%`} icon={UserCheck} tone="success" />
      <InfoCard label="Present" value={s.present} icon={UserCheck} tone="success" />
      <InfoCard label="Absent" value={s.absent} icon={UserX} tone="danger" />
      <InfoCard label="Late" value={s.late} icon={Clock} tone="warning" />
      <InfoCard label="Leave" value={s.leave} icon={CalendarClock} tone="info" />
    </div>
  );
}

/** A real month grid coloured from actual attendance records (date → status). */
function MonthCalendar({
  month,
  records,
  title,
  action,
}: {
  month: string;
  records: { date: string; status: string }[];
  title: string;
  /** Header control, e.g. the student picker on the class view. */
  action?: ReactNode;
}) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const byDate = new Map(records.map((r) => [r.date, r.status as Status]));
  // Sundays, weekly offs and holidays are days off — attendance never counts on them.
  const { days: workingDays } = useSchoolTimings();
  const { data: holidays } = useHolidays();
  const holidayOn = new Map((holidays ?? []).map((h) => [h.date.slice(0, 10), h.name]));
  return (
    <SectionCard title="Monthly Attendance" subtitle={`${title} · ${month}`} action={action}>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px]">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="pb-1 font-semibold text-muted-foreground">
            {d}
          </span>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const weekday = new Date(y, m - 1, day).toLocaleDateString("en-US", { weekday: "long" });
          const holiday = holidayOn.get(date);
          const off = weekday === "Sunday" || !workingDays.includes(weekday);
          if (holiday || off) {
            return (
              <div
                key={day}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center rounded-lg border text-[10px] font-semibold",
                  holiday
                    ? "border-pink-300/60 bg-pink-50 text-pink-600 dark:bg-pink-950/30"
                    : "border-transparent bg-muted/60 text-muted-foreground/70",
                )}
                title={
                  holiday ? `${date}: Holiday — ${holiday}` : `${date}: ${weekday} — no school`
                }
              >
                <span className="opacity-70">{day}</span>
                <span className="text-xs">{holiday ? "H" : "Off"}</span>
              </div>
            );
          }
          const st = byDate.get(date);
          return (
            <div
              key={day}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg border text-[10px] font-semibold",
                st ? STATUS_TONE[st] : "border-border bg-surface text-muted-foreground",
              )}
              title={st ? `${date}: ${st}` : date}
            >
              <span className="opacity-70">{day}</span>
              <span className="text-xs">{st ? LETTER[st] : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {STATUS_OPTIONS.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", STATUS_TONE[s].split(" ")[0])} /> {s}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-pink-400" /> Holiday
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Sunday / Off
        </span>
      </div>
    </SectionCard>
  );
}

/** Shown instead of the register when the school is closed on the chosen date. */
function SchoolClosedCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-4 flex flex-col items-center rounded-2xl border border-warning/30 bg-warning-soft/40 px-4 py-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-warning/15 text-warning">
        <CalendarClock className="h-6 w-6" />
      </span>
      <p className="mt-3 font-display text-base font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* School Admin — Students / Teachers / Staff                                 */
/* -------------------------------------------------------------------------- */

function AdminAttendanceView() {
  const [tab, setTab] = useState<"students" | "teachers" | "staff">("students");
  return (
    <div>
      <PageHeader
        title="Attendance Management"
        description="Mark and correct daily attendance for students, teachers and non-teaching staff."
        breadcrumb={["Dashboard", "Attendance"]}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="mt-4">
          <StudentAttendanceMarker />
        </TabsContent>
        <TabsContent value="teachers" className="mt-4">
          <EmployeeAttendanceMarker kind="teacher" />
        </TabsContent>
        <TabsContent value="staff" className="mt-4">
          <EmployeeAttendanceMarker kind="staff" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Student attendance marker (shared by School Admin + Class Teacher)         */
/* -------------------------------------------------------------------------- */

/** "19 Oct 2026" */
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function StudentAttendanceMarker({ teacherClassIds }: { teacherClassIds?: string[] }) {
  const { data: classes } = useClasses();
  const { days: workingDays } = useSchoolTimings();
  const markableClasses = useMemo(
    () =>
      (classes ?? []).filter(
        (c) => c.status === "ACTIVE" && (!teacherClassIds || teacherClassIds.includes(c.id)),
      ),
    [classes, teacherClassIds],
  );

  // Pick the class first, then one of its sections — the register loads once both are chosen.
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const classNames = useMemo(
    () =>
      Array.from(new Set(markableClasses.map((c) => c.name))).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [markableClasses],
  );
  const sectionRows = useMemo(
    () =>
      markableClasses
        .filter((c) => c.name === className)
        .sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true })),
    [markableClasses, className],
  );
  const classId = sectionRows.find((c) => c.section === section)?.id ?? "";
  const [date, setDate] = useState(todayStr());
  const [calendarStudentId, setCalendarStudentId] = useState("");
  // Future dates are closed: nothing is loaded or saved for them (the server refuses too).
  const isFuture = date > todayStr();
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  // A class teacher has one class: open it straight away, no class/section choice.
  const ownClass = teacherClassIds && markableClasses.length === 1 ? markableClasses[0]! : null;
  useEffect(() => {
    if (!ownClass) return;
    setClassName(ownClass.name);
    setSection(ownClass.section);
  }, [ownClass]);

  // A class with a single section needs no second choice.
  useEffect(() => {
    if (className && !section && sectionRows.length === 1) setSection(sectionRows[0]!.section);
  }, [className, section, sectionRows]);

  const { data: roster, isLoading } = useAttendanceRoster(
    classId || undefined,
    date,
    isValidDate && !isFuture,
  );

  useEffect(() => {
    if (!roster) return;
    setCalendarStudentId((prev) =>
      roster.students.some((s) => s.id === prev) ? prev : (roster.students[0]?.id ?? ""),
    );
  }, [roster]);

  const { data: calendarRecords } = useAttendance(
    Boolean(calendarStudentId),
    calendarStudentId ? { studentId: calendarStudentId, month: monthStr() } : undefined,
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        {ownClass ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <School className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold capitalize">
                {ownClass.name}
                {ownClass.section ? ` – Section ${ownClass.section}` : ""}
              </p>
              <p className="text-[11px] text-muted-foreground">Your class</p>
            </div>
          </div>
        ) : (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Select
              value={className}
              onValueChange={(v) => {
                setClassName(v);
                setSection("");
              }}
            >
              <SelectTrigger className="h-9 w-full bg-surface text-sm capitalize sm:w-[150px]">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classNames.map((name) => (
                  <SelectItem key={name} value={name} className="capitalize">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={section} onValueChange={setSection} disabled={!className}>
              <SelectTrigger className="h-9 w-full bg-surface text-sm sm:w-[140px]">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sectionRows.map((c) => (
                  <SelectItem key={c.id} value={c.section}>
                    Section {c.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Input
          type="date"
          max={todayStr()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-full bg-surface text-sm sm:w-44"
        />
      </div>

      {markableClasses.length === 0 ? (
        <EmptyState
          title="No classes available"
          description="Attendance needs an active class with enrolled students."
        />
      ) : !classId ? (
        <EmptyState
          title={className ? "Choose a section" : "Choose a class"}
          description={
            className
              ? `Pick a section of ${className} to open its attendance register.`
              : "Select a class, then its section, to see and mark attendance."
          }
        />
      ) : isFuture ? (
        <EmptyState
          title="Future date"
          description="Attendance can only be marked for today or earlier."
        />
      ) : isLoading || !roster ? (
        <TableSkeleton rows={8} cols={3} />
      ) : !roster.students.length ? (
        <EmptyState
          title="No students in this class"
          description="Enrol students or pick another class."
        />
      ) : (
        <>
          {(() => {
            // No attendance on a holiday or a weekly off — the school is closed.
            const weekday = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
              weekday: "long",
            });
            const weeklyOff = weekday === "Sunday" || !workingDays.includes(weekday);
            if (roster.holiday) {
              return (
                <SchoolClosedCard
                  title={`Holiday — ${roster.holiday.name}`}
                  note={`School is closed on ${fmtDay(date)}, so there's no attendance to mark. Pick another date to see or mark attendance.`}
                />
              );
            }
            if (weeklyOff) {
              return (
                <SchoolClosedCard
                  title={`${weekday} — no school`}
                  note={`${fmtDay(date)} is a weekly off, so there's no attendance to mark.`}
                />
              );
            }
            return (
              // Keyed so switching class or date starts a fresh register.
              <DailyRegister
                key={`${classId}:${date}`}
                classId={classId}
                date={date}
                roster={roster}
              />
            );
          })()}

          <div className="grid gap-4 lg:grid-cols-2">
            <ClassAttendanceInsights classId={classId} date={date} students={roster.students} />

            <MonthCalendar
              month={monthStr()}
              records={(calendarRecords ?? []).map((r) => ({ date: r.date, status: r.status }))}
              title={roster.students.find((s) => s.id === calendarStudentId)?.name ?? "Student"}
              action={
                <Select value={calendarStudentId} onValueChange={setCalendarStudentId}>
                  <SelectTrigger className="h-8 w-[160px] bg-surface text-xs">
                    <SelectValue placeholder="Pick student" />
                  </SelectTrigger>
                  <SelectContent>
                    {roster.students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          </div>

          <MonthlyRegister
            classId={classId}
            classLabel={`${className}${section ? `-${section}` : ""}`}
            students={roster.students}
          />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Class attendance insights — the chosen day plus the month so far           */
/* -------------------------------------------------------------------------- */

const LOW_ATTENDANCE = 75;
const rateTone = (pct: number) =>
  pct >= 90 ? "text-success" : pct >= LOW_ATTENDANCE ? "text-warning" : "text-destructive";
const rateBar = (pct: number) =>
  pct >= 90 ? "bg-success" : pct >= LOW_ATTENDANCE ? "bg-warning" : "bg-destructive";
/** Present + Late over marked — the rule the rest of the app uses. */
const rateOf = (statuses: string[]) => {
  const marked = statuses.filter((s) => STATUS_OPTIONS.includes(s as Status)).length;
  const attended = statuses.filter((s) => s === "Present" || s === "Late").length;
  return marked ? Math.round((attended / marked) * 100) : null;
};

const MAX_RANGE_DAYS = 31;
const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
/** Monday of the week containing `iso`. */
const mondayOf = (iso: string) =>
  addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

/** Day-by-day class attendance % for a chosen date range (defaults to the anchor's week). */
function AttendanceTrendChart({ classId, anchorDate }: { classId: string; anchorDate: string }) {
  const [from, setFrom] = useState(() => mondayOf(anchorDate));
  const [to, setTo] = useState(() => addDays(mondayOf(anchorDate), 6));
  // Picking a new date in the register moves the chart to that date's week.
  useEffect(() => {
    setFrom(mondayOf(anchorDate));
    setTo(addDays(mondayOf(anchorDate), 6));
  }, [anchorDate]);

  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const span = isDate(from) && isDate(to) ? daysBetween(from, to) : -1;
  const rangeError =
    span < 0
      ? "“To” must be on or after “From”."
      : span >= MAX_RANGE_DAYS
        ? `Pick a range of up to ${MAX_RANGE_DAYS} days.`
        : null;

  const { data: records, isFetching } = useAttendance(!rangeError, { classId, from, to });
  const { days: workingDays } = useSchoolTimings();
  const { data: holidays } = useHolidays();

  const today = todayStr();
  const holidayOn = new Map((holidays ?? []).map((h) => [h.date.slice(0, 10), h.name]));
  const days = rangeError
    ? []
    : Array.from({ length: span + 1 }, (_, i) => {
        const d = addDays(from, i);
        const weekday = new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: "UTC",
        });
        const holiday = holidayOn.get(d);
        return {
          date: d,
          label: weekday.slice(0, 3),
          dayOfMonth: Number(d.slice(8)),
          rate: rateOf((records ?? []).filter((r) => r.date === d).map((r) => r.status)),
          holiday,
          off: !holiday && (weekday === "Sunday" || !workingDays.includes(weekday)),
          future: d > today,
        };
      });
  const rangeRate = rateOf((records ?? []).map((r) => r.status));
  const markedDays = days.filter((d) => d.rate !== null).length;
  // Long ranges get narrower bars and hide the per-bar % (it stays in the tooltip).
  const compact = days.length > 14;
  const thisMonday = mondayOf(today);
  const presets = [
    { label: "This week", from: thisMonday, to: addDays(thisMonday, 6) },
    { label: "Last week", from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
  ];
  const rangeLabel = rangeError
    ? null
    : `${span + 1} day${span === 0 ? "" : "s"} · ${fmtDay(from).replace(/ \d{4}$/, "")} – ${fmtDay(to)}`;

  function shiftRange(direction: -1 | 1) {
    // Step by the range's own length, so a week moves a week and 10 days move 10 days.
    const nextFrom = addDays(from, direction * (span + 1));
    setFrom(nextFrom);
    setTo(addDays(nextFrom, span));
  }

  return (
    <div className="border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold">Attendance trend</p>
        <p className="text-[11px] text-muted-foreground">
          Average{" "}
          <span
            className={cn(
              "text-sm font-bold",
              rangeRate === null ? "text-muted-foreground" : rateTone(rangeRate),
            )}
          >
            {rangeRate === null ? "—" : `${rangeRate}%`}
          </span>{" "}
          · {markedDays} day{markedDays === 1 ? "" : "s"} marked
        </p>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-muted/30 p-2.5">
        {/* One joined control: step back · From → To · step forward */}
        <div
          className={cn(
            "flex w-full items-center rounded-xl border bg-surface shadow-sm transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15",
            rangeError ? "border-destructive/50" : "border-border",
          )}
        >
          <button
            type="button"
            onClick={() => shiftRange(-1)}
            disabled={Boolean(rangeError)}
            aria-label="Previous period"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-l-xl border-r border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1 px-2">
            <CalendarRange className="hidden h-4 w-4 shrink-0 text-primary sm:block" />
            <label className="min-w-0 flex-1">
              <span className="block px-1 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
                From
              </span>
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="h-6 w-full min-w-0 border-0 bg-transparent px-1 text-xs font-semibold shadow-none focus-visible:ring-0"
              />
            </label>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <label className="min-w-0 flex-1">
              <span className="block px-1 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
                To
              </span>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="h-6 w-full min-w-0 border-0 bg-transparent px-1 text-xs font-semibold shadow-none focus-visible:ring-0"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => shiftRange(1)}
            disabled={Boolean(rangeError)}
            aria-label="Next period"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-r-xl border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {presets.map((p) => {
            const active = p.from === from && p.to === to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                }}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            );
          })}
          {rangeLabel && (
            <span className="ml-auto text-[11px] text-muted-foreground">{rangeLabel}</span>
          )}
        </div>
      </div>

      {rangeError ? (
        <p className="mt-3 text-xs text-destructive">{rangeError}</p>
      ) : (
        <div className={cn("mt-3 overflow-x-auto", isFetching && "opacity-60")}>
          <div
            className={cn("flex h-36 items-end", compact ? "gap-0.5" : "gap-1.5 sm:gap-2")}
            style={{ minWidth: compact ? `${days.length * 22}px` : undefined }}
          >
            {days.map((d) => {
              const closed = d.holiday || d.off;
              return (
                <div
                  key={d.date}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={
                    d.holiday
                      ? `${fmtDay(d.date)}: Holiday — ${d.holiday}`
                      : d.off
                        ? `${fmtDay(d.date)}: no school`
                        : d.rate === null
                          ? `${fmtDay(d.date)}: ${d.future ? "upcoming" : "not marked"}`
                          : `${fmtDay(d.date)}: ${d.rate}% attended`
                  }
                >
                  {!compact && (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {closed ? (d.holiday ? "H" : "Off") : d.rate === null ? "—" : `${d.rate}%`}
                    </span>
                  )}
                  {/* Track shows the full 100%; the fill shows the day's rate. */}
                  <div
                    className={cn(
                      "relative flex h-full w-full items-end overflow-hidden",
                      compact ? "max-w-4 rounded-sm" : "max-w-9 rounded-md",
                      closed
                        ? d.holiday
                          ? "bg-pink-50 dark:bg-pink-950/30"
                          : "bg-muted/60"
                        : "bg-muted",
                      d.date === anchorDate &&
                        "ring-2 ring-primary/50 ring-offset-1 ring-offset-surface",
                    )}
                  >
                    {!closed && d.rate !== null && (
                      <span
                        className={cn(
                          "w-full",
                          compact ? "rounded-sm" : "rounded-md",
                          rateBar(d.rate),
                        )}
                        style={{ height: `${Math.max(d.rate, 3)}%` }}
                      />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] leading-tight",
                      d.date === anchorDate ? "font-bold text-primary" : "text-muted-foreground",
                    )}
                  >
                    {!compact && d.label}
                    <span className="block text-center">{d.dayOfMonth}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ClassAttendanceInsights({
  classId,
  date,
  students,
}: {
  classId: string;
  date: string;
  students: ApiAttendanceRosterStudent[];
}) {
  const month = date.slice(0, 7);
  // Month records refresh whenever a mark is saved, so this card stays live with the register.
  const { data: records } = useAttendance(true, { classId, month });
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const upToDate = (records ?? []).filter((r) => r.date <= date);

  const dayRows = upToDate.filter((r) => r.date === date);
  const count = (st: Status) => dayRows.filter((r) => r.status === st).length;
  const day = {
    present: count("Present"),
    late: count("Late"),
    absent: count("Absent"),
    leave: count("Leave"),
  };
  const marked = day.present + day.late + day.absent + day.leave;
  const unmarked = Math.max(students.length - marked, 0);
  const dayRate = rateOf(dayRows.map((r) => r.status));
  const total = Math.max(students.length, marked, 1);
  const segments = [
    { label: "Present", value: day.present, bar: "bg-success" },
    { label: "Late", value: day.late, bar: "bg-warning" },
    { label: "Absent", value: day.absent, bar: "bg-destructive" },
    { label: "Leave", value: day.leave, bar: "bg-info" },
    { label: "Unmarked", value: unmarked, bar: "bg-muted-foreground/25" },
  ];
  const notIn = dayRows
    .filter((r) => r.status !== "Present")
    .map((r) => ({
      name: nameOf.get(r.student_id) ?? r.student_name ?? "Student",
      status: r.status as Status,
    }))
    .sort((a, b) => STATUS_OPTIONS.indexOf(a.status) - STATUS_OPTIONS.indexOf(b.status));

  // Month so far (up to the chosen date).
  const monthRate = rateOf(upToDate.map((r) => r.status));
  const byStudent = new Map<string, string[]>();
  for (const r of upToDate)
    byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r.status]);
  const lowStudents = students
    .map((s) => ({ name: s.name, rate: rateOf(byStudent.get(s.id) ?? []) }))
    .filter((s): s is { name: string; rate: number } => s.rate !== null && s.rate < LOW_ATTENDANCE)
    .sort((a, b) => a.rate - b.rate);
  const byDay = new Map<string, string[]>();
  for (const r of upToDate) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r.status]);

  const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", {
    month: "long",
  });

  return (
    <SectionCard title="Class Attendance" subtitle={fmtDay(date)} bodyClassName="space-y-5">
      {/* The chosen day */}
      <div className="flex items-center gap-4">
        <div className="shrink-0 text-center">
          <p
            className={cn(
              "font-display text-3xl font-bold",
              dayRate === null ? "text-muted-foreground" : rateTone(dayRate),
            )}
          >
            {dayRate === null ? "—" : `${dayRate}%`}
          </p>
          <p className="text-[11px] text-muted-foreground">attended</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {segments.map(
              (s) =>
                s.value > 0 && (
                  <span
                    key={s.label}
                    className={s.bar}
                    style={{ width: `${(s.value / total) * 100}%` }}
                    title={`${s.label}: ${s.value}`}
                  />
                ),
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {segments.map((s) => (
              <span key={s.label} className="flex items-center gap-1">
                <span className={cn("h-2 w-2 rounded-full", s.bar)} />
                {s.label} <span className="font-semibold text-foreground">{s.value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold">Not present today</p>
        {marked === 0 ? (
          <p className="text-xs text-muted-foreground">No attendance marked for this date yet.</p>
        ) : notIn.length === 0 ? (
          <p className="text-xs text-success">Everyone marked is present.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {notIn.map((s, i) => (
              <span
                key={`${s.name}-${i}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  STATUS_TONE[s.status],
                )}
              >
                {s.name}
                <span className="opacity-70">· {LETTER[s.status]}</span>
              </span>
            ))}
          </div>
        )}
        {unmarked > 0 && marked > 0 && (
          <p className="mt-1.5 text-[11px] text-warning">
            {unmarked} student{unmarked === 1 ? "" : "s"} still unmarked.
          </p>
        )}
      </div>

      <AttendanceTrendChart classId={classId} anchorDate={date} />

      {/* The month so far */}
      <div className="border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold">{monthName} so far</p>
          <p className="text-[11px] text-muted-foreground">
            Class average{" "}
            <span
              className={cn(
                "text-sm font-bold",
                monthRate === null ? "text-muted-foreground" : rateTone(monthRate),
              )}
            >
              {monthRate === null ? "—" : `${monthRate}%`}
            </span>{" "}
            · {byDay.size} day{byDay.size === 1 ? "" : "s"} marked
          </p>
        </div>

        <p className="mt-4 mb-1.5 text-xs font-semibold">Below {LOW_ATTENDANCE}% this month</p>
        {lowStudents.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {byDay.size === 0 ? "No marks yet this month." : "No students below the threshold."}
          </p>
        ) : (
          <ul className="space-y-1">
            {lowStudents.slice(0, 4).map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{s.name}</span>
                <span className={cn("font-semibold", rateTone(s.rate))}>{s.rate}%</span>
              </li>
            ))}
            {lowStudents.length > 4 && (
              <li className="text-[11px] text-muted-foreground">
                +{lowStudents.length - 4} more in the Monthly Register below
              </li>
            )}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Monthly register — every student × every day of one month, with CSV export */
/* -------------------------------------------------------------------------- */

function MonthlyRegister({
  classId,
  classLabel,
  students,
}: {
  classId: string;
  classLabel: string;
  students: ApiAttendanceRosterStudent[];
}) {
  const [month, setMonth] = useState(monthStr());
  const isValidMonth = /^\d{4}-\d{2}$/.test(month);
  const { data: records, isLoading } = useAttendance(
    isValidMonth,
    isValidMonth ? { classId, month } : undefined,
  );
  const { days: workingDays } = useSchoolTimings();
  const { data: holidays } = useHolidays();

  const days = useMemo(() => {
    if (!isValidMonth) return [];
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const holidayOn = new Map((holidays ?? []).map((h) => [h.date.slice(0, 10), h.name]));
    return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
      const weekday = new Date(y, m - 1, i + 1).toLocaleDateString("en-US", { weekday: "long" });
      const holiday = holidayOn.get(date);
      return {
        day: i + 1,
        date,
        weekday: weekday.slice(0, 2),
        holiday,
        off: Boolean(holiday) || weekday === "Sunday" || !workingDays.includes(weekday),
      };
    });
  }, [month, isValidMonth, holidays, workingDays]);

  // Current students first, plus anyone who has marks this month but has since left the class.
  const rows = useMemo(() => {
    const byStudent = new Map<string, Map<string, Status>>();
    const extra = new Map<
      string,
      { id: string; name: string; roll: number | null; admission_no: string | null }
    >();
    for (const r of records ?? []) {
      if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, new Map());
      byStudent.get(r.student_id)!.set(r.date, r.status as Status);
      if (!students.some((s) => s.id === r.student_id) && !extra.has(r.student_id)) {
        extra.set(r.student_id, {
          id: r.student_id,
          name: r.student_name ?? "Unknown student",
          roll: r.student_roll ?? null,
          admission_no: r.admission_no ?? null,
        });
      }
    }
    return [...students, ...extra.values()].map((s) => {
      const marks = byStudent.get(s.id) ?? new Map<string, Status>();
      const count = (st: Status) => [...marks.values()].filter((v) => v === st).length;
      const present = count("Present");
      const absent = count("Absent");
      const late = count("Late");
      const leave = count("Leave");
      const marked = present + absent + late + leave;
      return {
        ...s,
        marks,
        present,
        absent,
        late,
        leave,
        // Same rule as the summary card: Present + Late over marked days.
        percentage: marked ? Math.round(((present + late) / marked) * 100) : null,
      };
    });
  }, [records, students]);

  const [exporting, setExporting] = useState(false);

  async function downloadExcel() {
    setExporting(true);
    try {
      // Loaded on demand so the spreadsheet library stays out of the main bundle.
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(month, {
        views: [{ state: "frozen", xSplit: 3, ySplit: 3 }],
      });
      const totalColumns = 3 + days.length + 5;

      sheet.mergeCells(1, 1, 1, totalColumns);
      sheet.getCell(1, 1).value = `Attendance Register — ${classLabel} — ${new Date(
        `${month}-01T00:00:00`,
      ).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`;
      sheet.getCell(1, 1).font = { bold: true, size: 14 };
      sheet.getRow(2).values = [
        "P = Present, A = Absent, L = Late, Lv = Leave, H = Holiday, Off = weekly off",
      ];
      sheet.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };

      const header = sheet.getRow(3);
      header.values = [
        "Roll",
        "Student",
        "Admission No",
        ...days.map((d) => `${d.day}\n${d.weekday}`),
        "Present",
        "Absent",
        "Late",
        "Leave",
        "Attendance %",
      ];
      header.height = 30;
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5F9AF8" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });

      const STATUS_FILL: Record<string, string> = {
        P: "FFDCFCE7",
        A: "FFFEE2E2",
        L: "FFFEF3C7",
        Lv: "FFDBEAFE",
        H: "FFFCE7F3",
        Off: "FFF3F4F6",
      };
      for (const r of rows) {
        const row = sheet.addRow([
          r.roll ?? "",
          r.name,
          r.admission_no ?? "",
          ...days.map((d) => {
            const st = r.marks.get(d.date);
            if (st) return LETTER[st];
            return d.holiday ? "H" : d.off ? "Off" : "";
          }),
          r.present,
          r.absent,
          r.late,
          r.leave,
          r.percentage === null ? "" : r.percentage / 100,
        ]);
        days.forEach((_, i) => {
          const cell = row.getCell(4 + i);
          cell.alignment = { horizontal: "center" };
          const fill = STATUS_FILL[String(cell.value ?? "")];
          if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        });
        for (let c = totalColumns - 4; c <= totalColumns; c++) {
          row.getCell(c).alignment = { horizontal: "center" };
          row.getCell(c).font = { bold: true };
        }
        row.getCell(totalColumns).numFmt = "0%";
      }

      sheet.getColumn(1).width = 7;
      sheet.getColumn(2).width = 26;
      sheet.getColumn(3).width = 14;
      days.forEach((_, i) => (sheet.getColumn(4 + i).width = 5));
      for (let c = totalColumns - 4; c <= totalColumns; c++) sheet.getColumn(c).width = 11;

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance-${classLabel.replace(/\s+/g, "-")}-${month}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the Excel file");
    } finally {
      setExporting(false);
    }
  }

  return (
    <SectionCard
      title="Monthly Register"
      subtitle={`${classLabel} · all students for the month`}
      className="mt-4"
      bodyClassName="p-0"
      action={
        <div className="flex items-center gap-2">
          <Input
            type="month"
            max={monthStr()}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-8 w-[150px] bg-surface text-xs"
            aria-label="Month"
          />
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => void downloadExcel()}
            disabled={!isValidMonth || isLoading || exporting || rows.length === 0}
          >
            <Download className="h-3.5 w-3.5" /> {exporting ? "Preparing…" : "Excel"}
          </Button>
        </div>
      }
    >
      {!isValidMonth ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Pick a month.</p>
      ) : isLoading ? (
        <div className="p-4">
          <TableSkeleton rows={6} cols={6} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-semibold">
                  Student
                </th>
                {days.map((d) => (
                  <th
                    key={d.date}
                    title={d.holiday ? `Holiday — ${d.holiday}` : undefined}
                    className={cn(
                      "w-7 px-0.5 py-1.5 text-center font-semibold",
                      d.holiday && "text-pink-600",
                      d.off && !d.holiday && "text-muted-foreground/50",
                    )}
                  >
                    <span className="block">{d.day}</span>
                    <span className="block text-[9px] font-normal">{d.weekday}</span>
                  </th>
                ))}
                {["P", "A", "L", "Lv", "%"].map((h) => (
                  <th key={h} className="px-2 py-2 text-center font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="sticky left-0 z-10 max-w-[180px] bg-surface px-3 py-1.5">
                    <p className="truncate text-xs font-medium">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground">Roll {r.roll ?? "—"}</p>
                  </td>
                  {days.map((d) => {
                    const st = r.marks.get(d.date);
                    return (
                      <td key={d.date} className="px-0.5 py-1 text-center">
                        {st ? (
                          <span
                            title={`${d.date}: ${st}`}
                            className={cn(
                              "inline-grid h-6 w-6 place-items-center rounded-md border text-[10px] font-bold",
                              STATUS_TONE[st],
                            )}
                          >
                            {LETTER[st]}
                          </span>
                        ) : d.off ? (
                          <span
                            className={cn(
                              "inline-grid h-6 w-6 place-items-center rounded-md text-[9px]",
                              d.holiday
                                ? "bg-pink-50 text-pink-600 dark:bg-pink-950/30"
                                : "bg-muted/60 text-muted-foreground/60",
                            )}
                          >
                            {d.holiday ? "H" : "–"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 text-center font-semibold text-success">{r.present}</td>
                  <td className="px-2 text-center font-semibold text-destructive">{r.absent}</td>
                  <td className="px-2 text-center font-semibold text-warning">{r.late}</td>
                  <td className="px-2 text-center font-semibold text-info">{r.leave}</td>
                  <td className="px-2 text-center font-semibold">
                    {r.percentage === null ? "—" : `${r.percentage}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

type Mark = { status: Status | null; remarks: string };
type SaveState = "saving" | "saved" | "error";

/**
 * One class's register for one date. Every status change is saved on its own straight away
 * (upserted on student + date), so leaving or refreshing never loses a saved mark.
 */
function DailyRegister({
  classId,
  date,
  roster,
}: {
  classId: string;
  date: string;
  roster: ApiAttendanceRoster;
}) {
  const queryClient = useQueryClient();
  const rosterKey = `attendance-roster-${classId}-${date}`;
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const rowState = useRef<Record<string, SaveState>>({});
  // Per student: the latest choice, a counter to spot superseded saves, and a queue so saves
  // go out one at a time (an older choice can never overwrite a newer one).
  const latest = useRef<Record<string, Mark>>({});
  const version = useRef<Record<string, number>>({});
  const queue = useRef<Record<string, Promise<void>>>({});
  const autoLeaveTried = useRef(new Set<string>());

  function setRowState(id: string, state: SaveState) {
    rowState.current[id] = state;
    setSaveState((prev) => ({ ...prev, [id]: state }));
  }

  // Take what the server has, but never overwrite a choice that is still saving or failed.
  useEffect(() => {
    setMarks((prev) => {
      const next: Record<string, Mark> = {};
      for (const s of roster.students) {
        const local = prev[s.id];
        const pending = rowState.current[s.id] === "saving" || rowState.current[s.id] === "error";
        next[s.id] =
          local && pending
            ? local
            : {
                status: s.approved_leave ? "Leave" : ((s.status as Status | null) ?? null),
                remarks: s.remarks ?? "",
              };
      }
      return next;
    });
  }, [roster]);

  function save(id: string, mark: Mark) {
    if (!mark.status) return;
    latest.current[id] = mark;
    const v = (version.current[id] ?? 0) + 1;
    version.current[id] = v;
    setRowState(id, "saving");
    queue.current[id] = (queue.current[id] ?? Promise.resolve()).then(async () => {
      if (version.current[id] !== v) return; // a newer choice is queued and will send itself
      const want = latest.current[id]!;
      try {
        const res = await api.post<{ saved: number }>("/attendance/bulk", {
          classId,
          date,
          entries: [{ studentId: id, status: want.status, remarks: want.remarks || undefined }],
        });
        if (res.saved !== 1) throw new ApiError(409, "This student is no longer in this class");
        if (version.current[id] !== v) return;
        // Keep the cached register in step so coming back shows exactly what is saved.
        await queryClient.cancelQueries({ queryKey: [rosterKey] });
        queryClient.setQueriesData<ApiAttendanceRoster>({ queryKey: [rosterKey] }, (old) =>
          old
            ? {
                ...old,
                students: old.students.map((s) =>
                  s.id === id
                    ? {
                        ...s,
                        status: want.status,
                        remarks: want.remarks || null,
                        saved_at: new Date().toISOString(),
                      }
                    : s,
                ),
              }
            : old,
        );
        setRowState(id, "saved");
        toast.dismiss(`attendance-save-${id}`);
        void queryClient.invalidateQueries({ queryKey: ["attendance-summary"] });
        void queryClient.invalidateQueries({ queryKey: ["attendance"] });
      } catch (err) {
        if (version.current[id] !== v) return;
        setRowState(id, "error");
        const name = roster.students.find((s) => s.id === id)?.name ?? "this student";
        const reason = err instanceof ApiError ? err.message : "Could not reach the server";
        toast.error(`Couldn't save ${name}'s attendance`, {
          id: `attendance-save-${id}`,
          description: reason,
          duration: Infinity,
          action: { label: "Retry", onClick: () => save(id, want) },
        });
      }
    });
  }

  // An approved leave means Leave: record it without waiting for the teacher.
  useEffect(() => {
    for (const s of roster.students) {
      if (s.approved_leave && s.status !== "Leave" && !autoLeaveTried.current.has(s.id)) {
        autoLeaveTried.current.add(s.id);
        save(s.id, { status: "Leave", remarks: s.remarks ?? "" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster]);

  // Warn before leaving while a choice is still saving or failed to save.
  const unsaved = Object.values(saveState).some((s) => s === "saving" || s === "error");
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function choose(id: string, status: Status) {
    const mark = { status, remarks: marks[id]?.remarks ?? "" };
    setMarks((prev) => ({ ...prev, [id]: mark }));
    save(id, mark);
  }

  function saveRemarks(id: string) {
    const mark = marks[id];
    const saved = roster.students.find((s) => s.id === id)?.remarks ?? "";
    if (mark?.status && mark.remarks !== saved) save(id, mark);
  }

  // Shared by the phone cards and the table rows.
  const circleProps = (id: string, locked: boolean) => ({
    value: marks[id]?.status ?? null,
    onChange: (st: Status) => choose(id, st),
    isDisabled: locked ? (st: Status) => st !== "Leave" : undefined,
  });
  // Remarks typed before a status is chosen are saved together with that status.
  const remarksProps = (id: string) => ({
    value: marks[id]?.remarks ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setMarks((prev) => ({
        ...prev,
        [id]: { status: prev[id]?.status ?? null, remarks: e.target.value },
      })),
    onBlur: () => saveRemarks(id),
    placeholder: "—",
    maxLength: 300,
    "aria-label": "Remarks",
  });

  const counts = { Present: 0, Absent: 0, Late: 0, Leave: 0, Unmarked: 0 };
  for (const s of roster.students) counts[marks[s.id]?.status ?? "Unmarked"]++;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <InfoCard label="Students" value={roster.students.length} icon={Users} tone="navy" />
        <InfoCard label="Present" value={counts.Present} icon={UserCheck} tone="success" />
        <InfoCard label="Absent" value={counts.Absent} icon={UserX} tone="danger" />
        <InfoCard label="Late" value={counts.Late} icon={Clock} tone="warning" />
        <InfoCard label="Leave" value={counts.Leave} icon={CalendarClock} tone="info" />
        <InfoCard label="Unmarked" value={counts.Unmarked} icon={CircleDashed} tone="gold" />
      </div>

      <SectionCard
        title="Daily Register"
        subtitle={`${roster.students.length} students · ${date}`}
        bodyClassName="p-1 md:p-3"
        className="mb-4"
      >
        {/* One single-line row per student on every screen; phones get the same row, smaller. */}
        {/* Phones: #, student and P/A/L/Lv fill the screen; only Remarks sits off to the right. */}
        <div className="overflow-x-auto">
          <div role="table" aria-label="Daily register" className="w-[calc(100%+160px)] md:w-auto">
            <div
              role="row"
              className={cn(
                REGISTER_GRID,
                "rounded-xl bg-muted/50 px-2 py-2.5 text-xs font-medium text-muted-foreground md:px-4 md:py-3 md:text-sm",
              )}
            >
              <span role="columnheader">#</span>
              <span role="columnheader">Student</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Remarks</span>
            </div>
            <div className="divide-y divide-border">
              {roster.students.map((s, i) => (
                <div
                  key={s.id}
                  role="row"
                  className={cn(REGISTER_GRID, "px-2 py-3 md:px-4 md:py-3")}
                >
                  <span role="cell" className="text-xs text-muted-foreground md:text-sm">
                    {i + 1}
                  </span>
                  <div role="cell" className="flex min-w-0 items-center gap-2 md:gap-3">
                    <StudentAvatar name={s.name} />
                    <StudentName student={s} />
                  </div>
                  <div role="cell">
                    <StatusCircles {...circleProps(s.id, s.approved_leave)} />
                  </div>
                  <div role="cell" className="min-w-0">
                    <Input
                      {...remarksProps(s.id)}
                      className="h-9 w-full min-w-0 rounded-lg bg-surface px-2.5 text-sm md:h-10 md:px-3"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

// Fixed column widths so the header and every row line up: # · Student · Status · Remarks.
// On phones the status column is exactly the four 22px circles; from md up, 36px ones.
const REGISTER_GRID =
  "grid grid-cols-[18px_minmax(0,1fr)_146px_150px] items-center gap-2.5 md:grid-cols-[40px_minmax(0,1.3fr)_168px_minmax(0,12rem)] md:gap-4";

const AVATAR_TONES = [
  "bg-blue-500/10 text-blue-600",
  "bg-red-500/10 text-red-500",
  "bg-green-500/10 text-green-600",
  "bg-violet-500/10 text-violet-600",
  "bg-orange-500/10 text-orange-500",
];

/** Initials on a soft colour that stays the same for a given name. */
function StudentAvatar({ name }: { name: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => (word[0] ?? "").toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold md:h-10 md:w-10 md:text-sm",
        AVATAR_TONES[hash % AVATAR_TONES.length],
      )}
    >
      {initials}
    </span>
  );
}

function StudentName({ student }: { student: ApiAttendanceRosterStudent }) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] leading-snug font-medium break-words text-foreground md:truncate md:text-sm md:leading-tight">
        {student.name}
      </p>
      <p className="text-xs leading-tight text-muted-foreground">Roll {student.roll ?? "—"}</p>
    </div>
  );
}

const CIRCLE_ON: Record<Status, string> = {
  Present: "border-green-600 bg-green-600 text-white",
  Absent: "border-red-500 bg-red-500 text-white",
  Late: "border-amber-500 bg-amber-500 text-white",
  Leave: "border-violet-600 bg-violet-600 text-white",
};

/** P / A / L / Lv as round buttons; the chosen one is filled. */
function StatusCircles({
  value,
  onChange,
  isDisabled,
}: {
  value: Status | null;
  onChange: (s: Status) => void;
  isDisabled?: ((s: Status) => boolean) | undefined;
}) {
  return (
    <div className="flex items-center gap-1.5 md:gap-2" role="group" aria-label="Attendance status">
      {STATUS_OPTIONS.map((s) => (
        <button
          key={s}
          type="button"
          aria-label={s}
          title={s}
          aria-pressed={value === s}
          disabled={isDisabled?.(s)}
          onClick={() => onChange(s)}
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9 md:text-sm",
            value === s
              ? CIRCLE_ON[s]
              : "border-border bg-surface text-foreground/70 hover:bg-muted",
          )}
        >
          {LETTER[s]}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Teacher / Staff attendance marker (School Admin)                           */
/* -------------------------------------------------------------------------- */

function EmployeeAttendanceMarker({ kind }: { kind: "teacher" | "staff" }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [department, setDepartment] = useState<string>("all");
  const [draft, setDraft] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);

  const teacherRoster = useTeacherAttendanceRoster(date, undefined, kind === "teacher");
  const staffRoster = useStaffAttendanceRoster(
    date,
    department === "all" ? undefined : department,
    kind === "staff",
  );
  const roster = kind === "teacher" ? teacherRoster : staffRoster;

  const basePath = kind === "teacher" ? "/teacher-attendance" : "/staff-attendance";
  const bodyIdKey = kind === "teacher" ? "teacherId" : "staffId";

  useEffect(() => {
    const next: Record<string, Status> = {};
    for (const p of roster.data?.people ?? []) next[p.id] = (p.status as Status) ?? "Present";
    setDraft(next);
  }, [roster.data]);

  function markAllPresent() {
    const next: Record<string, Status> = {};
    for (const p of roster.data?.people ?? []) next[p.id] = "Present";
    setDraft(next);
  }

  async function save() {
    if (!roster.data?.people.length) return;
    setSaving(true);
    try {
      const entries = roster.data.people.map((p) => ({
        [bodyIdKey]: p.id,
        status: draft[p.id] ?? "Present",
      }));
      const res = await api.post<{ saved: number; skipped: number }>(`${basePath}/bulk`, {
        date,
        entries,
      });
      await queryClient.invalidateQueries({
        queryKey: [kind === "teacher" ? "teacher-attendance" : "staff-attendance"],
      });
      await queryClient.invalidateQueries({
        queryKey: [`${kind}-attendance-roster-${date}-${kind === "staff" ? department : "all"}`],
      });
      toast.success(`Saved attendance for ${res.saved} ${kind}${res.saved === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  const people = roster.data?.people ?? [];
  const counts = useMemo(() => {
    const c = { Present: 0, Absent: 0, Late: 0, Leave: 0 };
    for (const p of people) c[draft[p.id] ?? "Present"]++;
    return c;
  }, [people, draft]);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <InfoCard
          label={kind === "teacher" ? "Teachers" : "Staff"}
          value={people.length}
          icon={Users}
          tone="navy"
        />
        <InfoCard label="Present" value={counts.Present} icon={UserCheck} tone="success" />
        <InfoCard label="Absent" value={counts.Absent} icon={UserX} tone="danger" />
        <InfoCard label="Late" value={counts.Late} icon={Clock} tone="warning" />
        <InfoCard label="Leave" value={counts.Leave} icon={CalendarClock} tone="info" />
      </div>

      {/* Phones: two columns — date | department, then the two buttons side by side. */}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <Input
          type="date"
          max={todayStr()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={cn(
            "h-9 w-full min-w-0 bg-surface text-sm sm:w-44",
            kind !== "staff" && "col-span-2",
          )}
        />
        {kind === "staff" && (
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="h-9 w-full bg-surface text-sm sm:w-[170px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {STAFF_DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="hidden flex-1 sm:block" />
        <Button
          size="sm"
          variant="outline"
          onClick={markAllPresent}
          disabled={!people.length}
          className="h-9 w-full gap-1.5 sm:w-auto"
        >
          <UserCheck className="h-4 w-4" /> All Present
        </Button>
        <Button
          size="sm"
          className="h-9 w-full sm:w-auto"
          onClick={save}
          disabled={saving || !people.length}
        >
          {saving ? "Saving…" : "Save Attendance"}
        </Button>
      </div>

      {roster.isLoading ? (
        <TableSkeleton rows={6} cols={3} />
      ) : !people.length ? (
        <EmptyState
          title={`No active ${kind}s`}
          description="Only active employees appear for attendance marking."
        />
      ) : (
        <SectionCard
          title="Daily Register"
          subtitle={`${people.length} · ${date}`}
          bodyClassName="p-0"
          className="mb-4"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">
                    {kind === "teacher" ? "Teacher" : "Staff"}
                  </th>
                  <th className="px-4 py-2.5 font-medium">Department</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={p.name} className="h-8 w-8" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.name}</p>
                          {p.employment_status === "ON_LEAVE" && (
                            <p className="text-[11px] text-info">On leave</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.department ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <StatusToggle
                        value={draft[p.id] ?? "Present"}
                        onChange={(st) => setDraft((d) => ({ ...d, [p.id]: st }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Teacher portal — My Attendance + my class's student attendance             */
/* -------------------------------------------------------------------------- */

function TeacherAttendanceView() {
  const [tab, setTab] = useState<"my" | "student">("my");
  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Your own attendance and your class's student attendance."
        breadcrumb={["Dashboard", "Attendance"]}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="my">My Attendance</TabsTrigger>
          <TabsTrigger value="student">Student Attendance</TabsTrigger>
        </TabsList>
        <TabsContent value="my" className="mt-4">
          <SelfCheckIn kind="teacher" />
        </TabsContent>
        <TabsContent value="student" className="mt-4">
          <TeacherStudentAttendanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TeacherStudentAttendanceTab() {
  const { data: teacher } = useMyTeacherProfile();
  const { data: classes } = useClasses();
  const myClassIds = useMemo(
    () => (classes ?? []).filter((c) => c.class_teacher_id === teacher?.id).map((c) => c.id),
    [classes, teacher],
  );

  if (!teacher) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (myClassIds.length === 0) {
    return (
      <EmptyState
        title="You're not a Class Teacher"
        description="Attendance can only be marked by the Class Teacher of a class. Your school administrator assigns this."
      />
    );
  }
  return <StudentAttendanceMarker teacherClassIds={myClassIds} />;
}

/* -------------------------------------------------------------------------- */
/* Self check-in (teacher + staff portals reuse this)                         */
/* -------------------------------------------------------------------------- */

function SelfCheckIn({ kind }: { kind: "teacher" | "staff" }) {
  const queryClient = useQueryClient();
  const teacher = useTeacherAttendance(kind === "teacher");
  const staff = useStaffAttendance(kind === "staff");
  const rows = (kind === "teacher" ? teacher.data : staff.data) ?? [];
  const isLoading = kind === "teacher" ? teacher.isLoading : staff.isLoading;
  const basePath = kind === "teacher" ? "/teacher-attendance" : "/staff-attendance";
  const queryKey = kind === "teacher" ? "teacher-attendance" : "staff-attendance";
  const [busy, setBusy] = useState<"in" | "out" | null>(null);

  const today = todayStr();
  const todayRow = useMemo(() => rows.find((r) => r.date === today), [rows, today]);
  const history = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date)), [rows]);
  const month = monthStr();
  const monthRows = history.filter((r) => r.date.startsWith(month));
  const presentThisMonth = monthRows.filter(
    (r) => r.status === "Present" || r.status === "Late",
  ).length;

  async function act(kind2: "check-in" | "check-out") {
    setBusy(kind2 === "check-in" ? "in" : "out");
    try {
      await api.post(`${basePath}/${kind2}`);
      await queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success(kind2 === "check-in" ? "Checked in" : "Checked out");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `${kind2} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard
          label="This Month"
          value={`${presentThisMonth}/${monthRows.length}`}
          icon={CalendarCheck}
          tone="navy"
        />
        <InfoCard label="Check In" value={todayRow?.check_in ?? "—"} icon={LogIn} tone="success" />
        <InfoCard label="Check Out" value={todayRow?.check_out ?? "—"} icon={LogOut} tone="info" />
      </div>

      <SectionCard title="Today's Attendance" subtitle={today} className="mb-4">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Clock3 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                Status:{" "}
                <StatusBadge
                  status={
                    todayRow ? (todayRow.check_out ? "Checked Out" : "Checked In") : "Not Marked"
                  }
                />
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Check In: {todayRow?.check_in ?? "—"} · Check Out: {todayRow?.check_out ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => act("check-in")}
              disabled={busy !== null || Boolean(todayRow?.check_in)}
            >
              <LogIn className="mr-1.5 h-4 w-4" /> Check In
            </Button>
            <Button
              variant="outline"
              onClick={() => act("check-out")}
              disabled={busy !== null || !todayRow?.check_in || Boolean(todayRow?.check_out)}
            >
              <LogOut className="mr-1.5 h-4 w-4" /> Check Out
            </Button>
          </div>
        </div>
      </SectionCard>

      <div className="panel">
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-semibold">Attendance History</h3>
        </div>
        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : history.length === 0 ? (
          <EmptyState
            title="No attendance history"
            description="Check in to start building your attendance record."
          />
        ) : (
          <AttendanceHistory rows={history.slice(0, 31)} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Student portal — read-only own attendance                                  */
/* -------------------------------------------------------------------------- */

function StudentAttendanceView() {
  const { data: rows, isLoading } = useAttendance();
  const { data: summary } = useAttendanceSummary({});
  const daily = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [rows],
  );
  const pct = summary?.percentage ?? 0;

  return (
    <div>
      <PageHeader
        title="My Attendance"
        description="Your attendance record — read only."
        breadcrumb={["Dashboard", "Attendance"]}
      />

      <SummaryCards summary={summary} />

      <SectionCard title="Overall Attendance" className="mb-4">
        <ProgressBar
          value={pct}
          tone={pct >= 90 ? "success" : pct >= 75 ? "gold" : "danger"}
          label={
            <>
              <span>Present + Late ÷ eligible days</span>
              <span className="font-semibold text-foreground">{pct}%</span>
            </>
          }
        />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <MonthCalendar
          month={monthStr()}
          records={(rows ?? [])
            .filter((r) => r.date.startsWith(monthStr()))
            .map((r) => ({ date: r.date, status: r.status }))}
          title="This month"
        />
        <SectionCard title="Daily History" subtitle={`${daily.length} records`} bodyClassName="p-0">
          {isLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : daily.length === 0 ? (
            <EmptyState
              title="No attendance records yet"
              description="Your attendance history will appear here."
            />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">{r.date}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.remarks ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
