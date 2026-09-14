"use client";

import { useEffect, useMemo, useState } from "react";
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

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStr = (d = new Date()) => d.toISOString().slice(0, 7);

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentAttendanceView />;
  if (user?.role === "TEACHER") return <TeacherAttendanceView />;
  return <AdminAttendanceView />;
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function StatusToggle({ value, onChange, options = STATUS_OPTIONS }: { value: Status; onChange: (s: Status) => void; options?: readonly Status[] }) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-border">
      {options.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn(
            "px-2.5 py-1 text-[11px] font-semibold transition-colors",
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
  const queryClient = useQueryClient();
  const { data: classes } = useClasses();
  const markableClasses = useMemo(
    () => (classes ?? []).filter((c) => c.status === "ACTIVE" && (!teacherClassIds || teacherClassIds.includes(c.id))),
    [classes, teacherClassIds],
  );

  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [draft, setDraft] = useState<Record<string, { status: Status; remarks: string }>>({});
  const [saving, setSaving] = useState(false);
  const [calendarStudentId, setCalendarStudentId] = useState("");

  useEffect(() => {
    if (!classId && markableClasses.length > 0) setClassId(markableClasses[0]!.id);
  }, [classId, markableClasses]);

  const { data: roster, isLoading } = useAttendanceRoster(classId || undefined, date);
  const { data: summary } = useAttendanceSummary({ classId: classId || undefined, from: date, to: date }, Boolean(classId));

  // Reset the working copy whenever the loaded register changes.
  useEffect(() => {
    if (!roster) return;
    const next: Record<string, { status: Status; remarks: string }> = {};
    for (const s of roster.students) next[s.id] = { status: (s.status as Status) ?? "Present", remarks: s.remarks ?? "" };
    setDraft(next);
    setCalendarStudentId((prev) => (roster.students.some((s) => s.id === prev) ? prev : (roster.students[0]?.id ?? "")));
  }, [roster]);

  const { data: calendarRecords } = useAttendance(
    Boolean(calendarStudentId),
    calendarStudentId ? { studentId: calendarStudentId, month: monthStr() } : undefined,
  );

  function setStatus(id: string, status: Status) {
    setDraft((p) => ({ ...p, [id]: { status, remarks: p[id]?.remarks ?? "" } }));
  }
  function setRemark(id: string, remarks: string) {
    setDraft((p) => ({ ...p, [id]: { status: p[id]?.status ?? "Present", remarks } }));
  }
  function markAllPresent() {
    setDraft((p) => {
      const next = { ...p };
      for (const s of roster?.students ?? []) next[s.id] = { status: "Present", remarks: next[s.id]?.remarks ?? "" };
      return next;
    });
  }

  async function save() {
    if (!classId || !roster) return;
    setSaving(true);
    try {
      const entries = roster.students.map((s) => ({
        studentId: s.id,
        status: draft[s.id]?.status ?? "Present",
        remarks: draft[s.id]?.remarks || undefined,
      }));
      const res = await api.post<{ saved: number; skipped: number; warning?: string }>("/attendance/bulk", { classId, date, entries });
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      await queryClient.invalidateQueries({ queryKey: [`attendance-roster-${classId}-${date}`] });
      await queryClient.invalidateQueries({ queryKey: ["attendance-summary"] });
      toast.success(`Saved attendance for ${res.saved} student${res.saved === 1 ? "" : "s"}`);
      if (res.warning) toast.warning(res.warning);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  const counts = useMemo(() => {
    const c = { Present: 0, Absent: 0, Late: 0, Leave: 0 };
    for (const s of roster?.students ?? []) c[draft[s.id]?.status ?? "Present"]++;
    return c;
  }, [roster, draft]);

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
        <Button size="sm" variant="outline" onClick={markAllPresent} disabled={!roster?.students.length} className="gap-1.5">
          <UserCheck className="h-4 w-4" /> Mark All Present
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !roster?.students.length}>
          {saving ? "Saving…" : "Save Attendance"}
        </Button>
      </div>

      <HolidayBanner holiday={roster?.holiday} date={date} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <InfoCard label="Students" value={roster?.students.length ?? 0} icon={Users} tone="navy" />
        <InfoCard label="Present" value={counts.Present} icon={UserCheck} tone="success" />
        <InfoCard label="Absent" value={counts.Absent} icon={UserX} tone="danger" />
        <InfoCard label="Late" value={counts.Late} icon={Clock} tone="warning" />
        <InfoCard label="Leave" value={counts.Leave} icon={CalendarClock} tone="info" />
      </div>

      {markableClasses.length === 0 ? (
        <EmptyState title="No classes available" description="Attendance needs an active class with enrolled students." />
      ) : isLoading ? (
        <TableSkeleton rows={8} cols={3} />
      ) : !roster?.students.length ? (
        <EmptyState title="No students in this class" description="Enrol students or pick another class." />
      ) : (
        <>
          <SectionCard title="Daily Register" subtitle={`${roster.students.length} students · ${date}`} bodyClassName="p-0" className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Student</th>
                    <th className="px-4 py-2.5 font-medium">Roll</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.students.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Initials name={s.name} className="h-8 w-8" />
                          <span className="truncate font-medium">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.roll ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <StatusToggle value={draft[s.id]?.status ?? "Present"} onChange={(st) => setStatus(s.id, st)} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Input
                          value={draft[s.id]?.remarks ?? ""}
                          onChange={(e) => setRemark(s.id, e.target.value)}
                          placeholder="—"
                          maxLength={300}
                          className="h-8 w-44 bg-surface text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

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
                tone={(summary?.percentage ?? 0) >= 90 ? "success" : (summary?.percentage ?? 0) >= 75 ? "gold" : "danger"}
                label={
                  <>
                    <span>Present + Late ÷ eligible days</span>
                    <span className="font-semibold text-foreground">{summary?.percentage ?? 0}%</span>
                  </>
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {summary?.present ?? 0} present · {summary?.late ?? 0} late · {summary?.absent ?? 0} absent · {summary?.leave ?? 0} leave
                (this date)
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
