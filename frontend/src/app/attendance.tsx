"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import { PageHeader, EmptyState, Initials, TableSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard, ProgressBar } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  useAttendance,
  useAttendanceRoster,
  useAttendanceSummary,
  useClasses,
  useMyTeacherProfile,
  useStaffAttendance,
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
  const s = summary ?? { present: 0, absent: 0, late: 0, leave: 0, eligible: 0, percentage: 0, total: 0 };
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
function MonthCalendar({ month, records, title }: { month: string; records: { date: string; status: string }[]; title: string }) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const byDate = new Map(records.map((r) => [r.date, r.status as Status]));
  return (
    <SectionCard title="Monthly Attendance" subtitle={`${title} · ${month}`}>
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
      </div>
    </SectionCard>
  );
}

function HolidayBanner({ holiday, date }: { holiday: { name: string } | null | undefined; date: string }) {
  if (!holiday) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {date} is a holiday ({holiday.name}). You can still record attendance if the school worked this day.
      </span>
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

function StudentAttendanceMarker({ teacherClassIds }: { teacherClassIds?: string[] }) {
  const { data: classes } = useClasses();
  const markableClasses = useMemo(
    () =>
      (classes ?? []).filter(
        (c) => c.status === "ACTIVE" && (!teacherClassIds || teacherClassIds.includes(c.id)),
      ),
    [classes, teacherClassIds],
  );

  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [calendarStudentId, setCalendarStudentId] = useState("");
  // Future dates are closed: nothing is loaded or saved for them (the server refuses too).
  const isFuture = date > todayStr();
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  useEffect(() => {
    if (!classId && markableClasses.length > 0) setClassId(markableClasses[0]!.id);
  }, [classId, markableClasses]);

  const { data: roster, isLoading } = useAttendanceRoster(
    classId || undefined,
    date,
    isValidDate && !isFuture,
  );
  const { data: summary } = useAttendanceSummary(
    { classId: classId || undefined, from: date, to: date },
    Boolean(classId) && isValidDate && !isFuture,
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
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="h-9 w-full bg-surface text-sm sm:w-[200px]">
            <SelectValue placeholder="Class / Section" />
          </SelectTrigger>
          <SelectContent>
            {markableClasses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                Class {c.name}-{c.section}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          max={todayStr()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-full bg-surface text-sm sm:w-44"
        />
        <div className="flex-1" />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Each status saves automatically
        </p>
      </div>

      {markableClasses.length === 0 ? (
        <EmptyState
          title="No classes available"
          description="Attendance needs an active class with enrolled students."
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
          <HolidayBanner holiday={roster.holiday} date={date} />
          {/* Keyed so switching class or date starts a fresh register. */}
          <DailyRegister key={`${classId}:${date}`} classId={classId} date={date} roster={roster} />

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="Class Attendance"
              subtitle={`For ${date}`}
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
            >
              <ProgressBar
                value={summary?.percentage ?? 0}
                tone={
                  (summary?.percentage ?? 0) >= 90
                    ? "success"
                    : (summary?.percentage ?? 0) >= 75
                      ? "gold"
                      : "danger"
                }
                label={
                  <>
                    <span>Present + Late ÷ marked students (unmarked not counted)</span>
                    <span className="font-semibold text-foreground">
                      {summary?.percentage ?? 0}%
                    </span>
                  </>
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {summary?.present ?? 0} present · {summary?.late ?? 0} late · {summary?.absent ?? 0}{" "}
                absent · {summary?.leave ?? 0} leave (this date)
              </p>
            </SectionCard>

            <MonthCalendar
              month={monthStr()}
              records={(calendarRecords ?? []).map((r) => ({ date: r.date, status: r.status }))}
              title={roster.students.find((s) => s.id === calendarStudentId)?.name ?? "Student"}
            />
          </div>
        </>
      )}
    </div>
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
        <div role="table" aria-label="Daily register">
          <div
            role="row"
            className={cn(
              REGISTER_GRID,
              "rounded-xl bg-muted/50 px-1 py-2.5 text-[11px] font-medium text-muted-foreground md:px-4 md:py-3 md:text-sm",
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
                className={cn(REGISTER_GRID, "px-1 py-2.5 md:px-4 md:py-3")}
              >
                <span role="cell" className="text-[11px] text-muted-foreground md:text-sm">
                  {i + 1}
                </span>
                <div role="cell" className="flex min-w-0 items-center gap-1 md:gap-3">
                  <StudentAvatar name={s.name} />
                  <StudentName student={s} />
                </div>
                <div role="cell">
                  <StatusCircles {...circleProps(s.id, s.approved_leave)} />
                </div>
                <div role="cell" className="min-w-0">
                  <Input
                    {...remarksProps(s.id)}
                    className="h-7 w-full min-w-0 rounded-md bg-surface px-1.5 text-[10px] md:h-10 md:rounded-lg md:px-3 md:text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </>
  );
}

// Fixed column widths so the header and every row line up: # · Student · Status · Remarks.
// On phones the status column is exactly the four 22px circles; from md up, 36px ones.
const REGISTER_GRID =
  "grid grid-cols-[12px_minmax(0,2fr)_97px_minmax(0,1fr)] items-center gap-1 md:grid-cols-[40px_minmax(0,1.3fr)_168px_minmax(0,12rem)] md:gap-4";

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
        "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold md:h-10 md:w-10 md:text-sm",
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
      <p className="truncate text-[11px] leading-tight font-medium text-foreground md:text-sm">
        {student.name}
      </p>
      <p className="text-[10px] leading-tight text-muted-foreground md:text-xs">
        Roll {student.roll ?? "—"}
      </p>
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
    <div
      className="flex items-center gap-[3px] md:gap-2"
      role="group"
      aria-label="Attendance status"
    >
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
            "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9 md:text-sm",
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
  const staffRoster = useStaffAttendanceRoster(date, department === "all" ? undefined : department, kind === "staff");
  const roster = kind === "teacher" ? teacherRoster : staffRoster;

  const teacherHistory = useTeacherAttendance(kind === "teacher", { from: `${monthStr()}-01`, to: todayStr() });
  const staffHistory = useStaffAttendance(kind === "staff", { from: `${monthStr()}-01`, to: todayStr() });
  const history = kind === "teacher" ? teacherHistory.data : staffHistory.data;

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
      const entries = roster.data.people.map((p) => ({ [bodyIdKey]: p.id, status: draft[p.id] ?? "Present" }));
      const res = await api.post<{ saved: number; skipped: number }>(`${basePath}/bulk`, { date, entries });
      await queryClient.invalidateQueries({ queryKey: [kind === "teacher" ? "teacher-attendance" : "staff-attendance"] });
      await queryClient.invalidateQueries({ queryKey: [`${kind}-attendance-roster-${date}-${kind === "staff" ? department : "all"}`] });
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
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <Input
          type="date"
          max={todayStr()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-full bg-surface text-sm sm:w-44"
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
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={markAllPresent} disabled={!people.length} className="gap-1.5">
          <UserCheck className="h-4 w-4" /> Mark All Present
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !people.length}>
          {saving ? "Saving…" : "Save Attendance"}
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <InfoCard label={kind === "teacher" ? "Teachers" : "Staff"} value={people.length} icon={Users} tone="navy" />
        <InfoCard label="Present" value={counts.Present} icon={UserCheck} tone="success" />
        <InfoCard label="Absent" value={counts.Absent} icon={UserX} tone="danger" />
        <InfoCard label="Late" value={counts.Late} icon={Clock} tone="warning" />
        <InfoCard label="Leave" value={counts.Leave} icon={CalendarClock} tone="info" />
      </div>

      {roster.isLoading ? (
        <TableSkeleton rows={6} cols={3} />
      ) : !people.length ? (
        <EmptyState title={`No active ${kind}s`} description="Only active employees appear for attendance marking." />
      ) : (
        <SectionCard title="Daily Register" subtitle={`${people.length} · ${date}`} bodyClassName="p-0" className="mb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{kind === "teacher" ? "Teacher" : "Staff"}</th>
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
                          {p.employment_status === "ON_LEAVE" && <p className="text-[11px] text-info">On leave</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.department ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <StatusToggle value={draft[p.id] ?? "Present"} onChange={(st) => setDraft((d) => ({ ...d, [p.id]: st }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Recent History" subtitle="This month" bodyClassName="p-0">
        {!history?.length ? (
          <EmptyState title="No records this month" description="Saved attendance appears here." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>{kind === "teacher" ? "Teacher" : "Staff"}</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.slice(0, 60).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="font-medium">{r.person_name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <StatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
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
  const presentThisMonth = monthRows.filter((r) => r.status === "Present" || r.status === "Late").length;

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
        <InfoCard label="This Month" value={`${presentThisMonth}/${monthRows.length}`} icon={CalendarCheck} tone="navy" />
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
                <StatusBadge status={todayRow ? (todayRow.check_out ? "Checked Out" : "Checked In") : "Not Marked"} />
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Check In: {todayRow?.check_in ?? "—"} · Check Out: {todayRow?.check_out ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => act("check-in")} disabled={busy !== null || Boolean(todayRow?.check_in)}>
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
          <EmptyState title="No attendance history" description="Check in to start building your attendance record." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead className="text-right">Check Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.slice(0, 31).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>{r.check_in ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.check_out ?? "—"}</TableCell>
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

/* -------------------------------------------------------------------------- */
/* Student portal — read-only own attendance                                  */
/* -------------------------------------------------------------------------- */

function StudentAttendanceView() {
  const { data: rows, isLoading } = useAttendance();
  const { data: summary } = useAttendanceSummary({});
  const daily = useMemo(() => [...(rows ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [rows]);
  const pct = summary?.percentage ?? 0;

  return (
    <div>
      <PageHeader title="My Attendance" description="Your attendance record — read only." breadcrumb={["Dashboard", "Attendance"]} />

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
          records={(rows ?? []).filter((r) => r.date.startsWith(monthStr())).map((r) => ({ date: r.date, status: r.status }))}
          title="This month"
        />
        <SectionCard title="Daily History" subtitle={`${daily.length} records`} bodyClassName="p-0">
          {isLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : daily.length === 0 ? (
            <EmptyState title="No attendance records yet" description="Your attendance history will appear here." />
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
