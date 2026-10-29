"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  Download,
  Plus,
  School,
  MapPin,
  UserRound,
  Clock,
} from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, withClassPrefix } from "@/lib/utils";
import { isPeriodLive, useSchoolTimings } from "@/lib/school-timings";
import { printTimetables, type TimetablePage } from "@/lib/timetable-print";
import { useSchoolBranding } from "@/hooks/use-school-branding";
import { SchoolTimingsEditor } from "@/components/shared/SchoolTimingsEditor";
import { useAuth } from "@/lib/auth-context";
import {
  useMyTeacherProfile,
  useTimetable,
  useHolidays,
  useClassTimetable,
  useClasses,
  useTeachers,
  useSubjects,
  useSubjectMappings,
  useRooms,
  type ApiTimetableSlot,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { EmptyState } from "@/components/shared/ui-kit";
import { useQueryClient } from "@tanstack/react-query";

const NONE = "__none__";

import {
  SUBJECT_PRESETS,
  DIVERSE_PALETTE,
  toneFor,
  weekLabel,
  WEEK_ORDER,
  useWeekHolidays,
  HolidayDay,
  todayName,
  PeriodCard,
  MetaItem,
} from "@/components/timetable/TimetableShared";

/** Shared read-only weekly list — a teacher's own schedule, or (for admins) any teacher's. */
function TeacherScheduleList({
  slots,
  classNameById,
}: {
  slots: ApiTimetableSlot[];
  classNameById: Map<string, string>;
}) {
  const { days: DAYS, periods } = useSchoolTimings();
  const [activeDay, setActiveDay] = useState(() => todayName(DAYS));
  const weekDay = useWeekHolidays();
  const grid: Record<string, ApiTimetableSlot[]> = {};
  for (const day of DAYS)
    grid[day] = slots.filter((s) => s.day === day).sort((a, b) => a.period - b.period);

  if (slots.length === 0) {
    return (
      <EmptyState title="No timetable slots yet" description="No periods have been assigned yet." />
    );
  }

  return (
    <SectionCard bodyClassName="p-0">
      <div className="border-b border-border p-3">
        <div className="grid grid-cols-6 gap-1.5 md:max-w-2xl">
          {DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setActiveDay(d)}
              className={cn(
                "min-w-0 rounded-full border py-2 text-center text-xs font-medium transition-colors active:scale-95",
                activeDay === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              <span className="md:hidden">{d.slice(0, 3)}</span>
              <span className="hidden md:inline">{d}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2.5 p-3 md:grid-cols-2 xl:grid-cols-3">
        {weekDay(activeDay).holiday ? (
          <HolidayDay name={weekDay(activeDay).holiday!.name} date={weekDay(activeDay).date} />
        ) : (grid[activeDay] ?? []).length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            No classes on {activeDay}.
          </p>
        ) : (
          (grid[activeDay] ?? []).map((slot) => (
            <PeriodCard
              key={slot.id}
              period={slot.period}
              subject={slot.subject}
              live={isPeriodLive(activeDay, periods[slot.period - 1])}
            >
              {classNameById.size > 0 && (
                <MetaItem icon={School}>
                  Class {classNameById.get(slot.class_id ?? "") ?? "—"}
                </MetaItem>
              )}
              <MetaItem icon={MapPin}>{slot.room ?? "No room set"}</MetaItem>
            </PeriodCard>
          ))
        )}
      </div>
    </SectionCard>
  );
}

/** Every period of one of the teacher's classes on a chosen day — all subjects and teachers. */
function TeacherClassTimetable() {
  const { data: teacher } = useMyTeacherProfile();
  const { data: classes, isLoading: classesLoading } = useClasses();

  // The classes the database lets this teacher see; their class-teacher class comes first.
  const myClasses = useMemo(() => {
    const assigned = new Set<string>(teacher ? JSON.parse(teacher.assigned_classes) : []);
    const isClassTeacher = (c: { class_teacher_id: string | null }) =>
      Number(c.class_teacher_id === teacher?.id);
    return (classes ?? [])
      .filter((c) => c.status === "ACTIVE" && (assigned.has(c.id) || isClassTeacher(c)))
      .sort((a, b) => isClassTeacher(b) - isClassTeacher(a));
  }, [classes, teacher]);

  const [classId, setClassId] = useState("");
  const activeClassId = classId || myClasses[0]?.id || "";
  const { days: DAYS, periods: PERIODS } = useSchoolTimings();
  const [day, setDay] = useState(() => todayName(DAYS));
  const weekDay = useWeekHolidays();
  const { data: slots, isLoading } = useClassTimetable(activeClassId || undefined);
  const byPeriod = new Map((slots ?? []).filter((s) => s.day === day).map((s) => [s.period, s]));
  const classLabel = (c: { name: string; section: string; class_teacher_id: string | null }) =>
    `${c.name} ${c.section}${c.class_teacher_id === teacher?.id ? " (Class teacher)" : ""}`;

  if (classesLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (myClasses.length === 0) {
    return (
      <EmptyState
        title="No classes assigned"
        description="You'll see a class's full timetable here once you're its class teacher or teach a subject in it."
      />
    );
  }

  return (
    <SectionCard
      title={`${day}'s timetable`}
      subtitle="All periods of the class — every subject and teacher"
      bodyClassName="p-0"
    >
      <div className="space-y-3 border-b border-border p-3">
        <Select value={activeClassId} onValueChange={setClassId}>
          <SelectTrigger className="h-9 w-full bg-surface text-sm sm:w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {myClasses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {classLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div
          className="grid gap-1.5 sm:max-w-md"
          style={{ gridTemplateColumns: `repeat(${DAYS.length}, minmax(0, 1fr))` }}
        >
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={cn(
                "min-w-0 rounded-full border py-2 text-center text-xs font-medium transition-colors active:scale-95",
                day === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-2.5 p-3 md:grid-cols-2 xl:grid-cols-3">
          {weekDay(day).holiday ? (
            <HolidayDay name={weekDay(day).holiday!.name} date={weekDay(day).date} />
          ) : (
            PERIODS.map((p) => {
              const slot = byPeriod.get(p.period);
              return (
                <PeriodCard
                  key={p.period}
                  period={p.period}
                  subject={slot?.subject ?? null}
                  live={isPeriodLive(day, p)}
                >
                  <MetaItem icon={UserRound}>
                    {slot?.teacher_name ?? "No teacher set"}
                    {slot?.teacher_id && slot.teacher_id === teacher?.id && (
                      <span className="ml-1 font-semibold text-primary">(You)</span>
                    )}
                  </MetaItem>
                  <MetaItem icon={MapPin}>{slot?.room ?? "No room set"}</MetaItem>
                </PeriodCard>
              );
            })
          )}
        </div>
      )}
    </SectionCard>
  );
}

function TeacherTimetableView() {
  const { data: teacher } = useMyTeacherProfile();
  const { data: slots, isLoading } = useTimetable();
  const { data: classes } = useClasses();

  const classNameById = new Map((classes ?? []).map((c) => [c.id, `${c.name}-${c.section}`]));
  const mySlots = (slots ?? []).filter((s) => s.teacher_id === teacher?.id);

  return (
    <div>
      <PageHeader
        title="Timetable"
        description="Your classes' full day, and your own teaching schedule."
        breadcrumb={["Dashboard", "Timetable"]}
      />
      <Tabs defaultValue="class">
        <TabsList>
          <TabsTrigger value="class">Class Timetable</TabsTrigger>
          <TabsTrigger value="mine">My Schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="class" className="mt-4">
          <TeacherClassTimetable />
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <TeacherScheduleList slots={mySlots} classNameById={classNameById} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** GET /timetable is already scoped server-side to the student's own class (classScopeForUser),
 * so no client-side filtering is needed — reuses the same read-only weekly list as the teacher's own view. */
function StudentTimetableView() {
  const { data: slots, isLoading } = useTimetable();
  // No useClasses() here — students don't hold classes.view, and every slot already belongs
  // to their own single class, so the per-slot "Class" label isn't informative anyway.
  const classNameById = new Map<string, string>();

  return (
    <div>
      <PageHeader
        title="My Timetable"
        description="Your weekly class schedule."
        breadcrumb={["Dashboard", "Timetable"]}
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <TeacherScheduleList slots={slots ?? []} classNameById={classNameById} />
      )}
    </div>
  );
}

/** Assign or edit one class/day/period slot — subject, teacher and room. */
function AssignSlotDialog({
  open,
  onOpenChange,
  classId,
  className,
  day,
  period,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  day: string;
  period: number;
  existing: ApiTimetableSlot | null;
  onSaved: () => void;
}) {
  const { data: teachers } = useTeachers();
  const { data: subjects } = useSubjects();
  const { data: subjectMappings, isLoading: mappingsLoading } = useSubjectMappings(
    { classId },
    open,
  );
  const { data: rooms } = useRooms();
  const { periods } = useSchoolTimings();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(existing?.subject ?? NONE);
  const [teacherId, setTeacherId] = useState(existing?.teacher_id ?? NONE);
  const [room, setRoom] = useState(existing?.room ?? NONE);
  const [addingRoom, setAddingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedMapping = useMemo(
    () =>
      (subjectMappings ?? []).find(
        (mapping) => mapping.subject_name.toLowerCase() === subject.toLowerCase(),
      ),
    [subjectMappings, subject],
  );
  const availableSubjects = useMemo(() => {
    const assignedIds = new Set((subjectMappings ?? []).map((mapping) => mapping.subject_id));
    const assigned = (subjects ?? []).filter((item) => assignedIds.has(item.id));
    if (existing?.subject && !assigned.some((item) => item.name === existing.subject)) {
      const existingSubject = (subjects ?? []).find((item) => item.name === existing.subject);
      if (existingSubject) assigned.push(existingSubject);
    }
    return assigned;
  }, [existing?.subject, subjectMappings, subjects]);
  const availableTeachers = useMemo(() => {
    if (!selectedMapping?.teacher_id) return [];
    return (teachers ?? []).filter((teacher) => teacher.id === selectedMapping.teacher_id);
  }, [selectedMapping?.teacher_id, teachers]);

  useEffect(() => {
    if (subject === NONE || subject === "Break") {
      setTeacherId(NONE);
      return;
    }
    if (selectedMapping) setTeacherId(selectedMapping.teacher_id ?? NONE);
  }, [selectedMapping, subject]);

  async function handleAddRoom() {
    const trimmed = newRoomName.trim();
    if (!trimmed) return;
    try {
      await api.post("/rooms", { name: trimmed });
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setRoom(trimmed);
      setNewRoomName("");
      setAddingRoom(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add room");
    }
  }

  async function handleSave() {
    if (subject === NONE) {
      toast.error("Select a subject");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        classId,
        day,
        period,
        subject,
        teacherId: teacherId !== NONE ? teacherId : null,
        room: room !== NONE ? room : null,
      };
      if (existing) {
        await api.patch(`/timetable/${existing.id}`, body);
      } else {
        await api.post("/timetable", body);
      }
      toast.success("Timetable updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save timetable slot");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClear() {
    if (!existing) return;
    setSubmitting(true);
    try {
      await api.delete(`/timetable/${existing.id}`);
      toast.success("Slot cleared");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to clear slot");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Period" : "Assign Period"}</DialogTitle>
          <DialogDescription>
            {className} · {day} · {periods[period - 1]?.time ?? `Period ${period}`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Subject</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select subject</SelectItem>
                <SelectItem value="Break">Break</SelectItem>
                {availableSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Teacher</Label>
            <Select
              value={teacherId}
              onValueChange={setTeacherId}
              disabled={subject === NONE || subject === "Break" || mappingsLoading}
            >
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Select teacher" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not assigned</SelectItem>
                {availableTeachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {subject !== NONE && subject !== "Break" && !mappingsLoading && !selectedMapping && (
              <p className="text-xs text-destructive">
                No teacher is assigned to this subject for {className}.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Classroom / Room</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setAddingRoom((v) => !v)}
              >
                {addingRoom ? "Cancel" : "+ Define new room"}
              </button>
            </div>
            {addingRoom ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Room 204"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddRoom();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddRoom} disabled={!newRoomName.trim()}>
                  Add
                </Button>
              </div>
            ) : (
              <Select value={room} onValueChange={setRoom}>
                <SelectTrigger className="bg-surface">
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No room set</SelectItem>
                  {/* A slot saved before rooms were a defined list may hold a name that isn't
                      registered yet — surface it anyway so the field doesn't look empty. */}
                  {room !== NONE && !(rooms ?? []).some((r) => r.name === room) && (
                    <SelectItem value={room}>{room}</SelectItem>
                  )}
                  {(rooms ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.name}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {existing ? (
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              onClick={handleClear}
              disabled={submitting}
            >
              Clear Slot
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PrintRef = MutableRefObject<(() => void) | null>;

/** A class's week as a printable page: subject, teacher and room in each cell. */
function classPage(
  label: string,
  classSlots: ApiTimetableSlot[],
  teacherName: (id: string | null) => string,
): TimetablePage {
  return {
    title: withClassPrefix(label),
    subtitle: "Class timetable",
    cell: (day, period) => {
      const slot = classSlots.find((s) => s.day === day && s.period === period);
      if (!slot?.subject) return null;
      return { subject: slot.subject, lines: [teacherName(slot.teacher_id), slot.room ?? ""] };
    },
  };
}

function AdminClassTimetable({ printRef }: { printRef: PrintRef }) {
  const { data: classes } = useClasses();
  const { data: slots, isLoading } = useTimetable();
  const { data: teachers } = useTeachers();
  const school = useSchoolBranding();
  const { days: DAYS, periods: PERIODS } = useSchoolTimings();
  const [timingsOpen, setTimingsOpen] = useState(false);
  const queryClient = useQueryClient();

  const classNames = useMemo(
    () => Array.from(new Set((classes ?? []).map((c) => c.name))),
    [classes],
  );
  const [cls, setCls] = useState("");
  const activeClassName = cls || classNames[0] || "";
  const sections = useMemo(
    () => (classes ?? []).filter((c) => c.name === activeClassName).map((c) => c.section),
    [classes, activeClassName],
  );
  const [section, setSection] = useState("");
  const activeSection = section || sections[0] || "";

  const activeClass = (classes ?? []).find(
    (c) => c.name === activeClassName && c.section === activeSection,
  );
  const classId = activeClass?.id;

  const [weekOffset, setWeekOffset] = useState(0);
  const weekDay = useWeekHolidays(weekOffset);
  const [dialogTarget, setDialogTarget] = useState<{
    day: string;
    period: number;
    existing: ApiTimetableSlot | null;
  } | null>(null);

  const classSlots = (slots ?? []).filter((s) => s.class_id === classId);
  const grid: Record<string, (ApiTimetableSlot | undefined)[]> = {};
  for (const day of DAYS)
    grid[day] = PERIODS.map((p) => classSlots.find((s) => s.day === day && s.period === p.period));

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["timetable"] });
  }

  const teacherName = (id: string | null) => (teachers ?? []).find((t) => t.id === id)?.name ?? "";
  const classLabel = (c: { name: string; section: string }) =>
    `${c.name.replace(/^class\s*/i, "")}-${c.section}`;

  function printClass() {
    if (!activeClass) {
      toast.error("Pick a class to print");
      return;
    }
    printTimetables(
      school,
      [classPage(classLabel(activeClass), classSlots, teacherName)],
      DAYS,
      PERIODS,
      `Timetable ${classLabel(activeClass)}`,
    );
  }

  function printAllClasses() {
    const list = [...(classes ?? [])]
      .filter((c) => c.status !== "ARCHIVED")
      .sort((a, b) => classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true }));
    const pages = list
      .map((c) => ({ c, own: (slots ?? []).filter((s) => s.class_id === c.id) }))
      .filter(({ own }) => own.length > 0)
      .map(({ c, own }) => classPage(classLabel(c), own, teacherName));
    if (!pages.length) {
      toast.error("No class has any periods assigned yet");
      return;
    }
    printTimetables(school, pages, DAYS, PERIODS, "Class Timetables");
  }

  printRef.current = printClass;

  return (
    <>
      <SectionCard
        title={classId ? `${activeClassName} – Section ${activeSection}` : "Select a class"}
        subtitle={weekLabel(weekOffset, DAYS.length)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={activeClassName}
              onValueChange={(v) => {
                setCls(v);
                setSection("");
              }}
            >
              <SelectTrigger className="h-9 w-[130px] bg-surface text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classNames.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeSection} onValueChange={setSection}>
              <SelectTrigger className="h-9 w-[110px] bg-surface text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s} value={s}>
                    Section {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={printAllClasses}
              title="Print every class, one per page"
            >
              <Printer className="h-4 w-4" /> Print all
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setTimingsOpen(true)}
            >
              <Clock className="h-4 w-4" /> Edit timings
            </Button>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setWeekOffset((w) => w - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setWeekOffset((w) => w + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        }
        bodyClassName="p-0"
      >
        {!classId ? (
          <EmptyState
            title="No classes yet"
            description="Add a class first, then come back to build its timetable."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[840px]"
              style={{ gridTemplateColumns: `110px repeat(${DAYS.length}, 1fr)` }}
            >
              <div className="border-b border-border bg-muted/40 p-2 text-xs font-medium text-muted-foreground">
                Period
              </div>
              {DAYS.map((d) => {
                const { date, holiday } = weekDay(d);
                return (
                  <div
                    key={d}
                    className={cn(
                      "border-b border-l border-border p-2 text-center text-xs font-medium",
                      holiday
                        ? "bg-pink-50 text-pink-700 dark:bg-pink-950/30 dark:text-pink-300"
                        : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    <p>{d}</p>
                    <p className="text-[10px] font-normal opacity-80">
                      {date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                    {holiday && (
                      <p className="mt-0.5 truncate text-[10px] font-semibold" title={holiday.name}>
                        🎉 {holiday.name}
                      </p>
                    )}
                  </div>
                );
              })}
              {PERIODS.map((p, pi) => (
                <Fragment key={p.period}>
                  <div className="border-b border-border p-2 text-xs">
                    <p className="font-semibold">Period {p.period}</p>
                    <p className="text-[11px] text-muted-foreground">{p.time}</p>
                  </div>
                  {DAYS.map((d) => {
                    const slot = grid[d]?.[pi];
                    const { holiday } = weekDay(d);
                    if (holiday) {
                      // Holiday: no classes and nothing to assign on this date.
                      return (
                        <div
                          key={`${d}-${pi}`}
                          className="grid place-items-center border-b border-l border-border bg-pink-50/70 p-1.5 text-[10px] font-medium text-pink-600/70 dark:bg-pink-950/20"
                        >
                          {pi === 0 ? "Holiday" : ""}
                        </div>
                      );
                    }
                    return (
                      <button
                        key={`${d}-${pi}`}
                        type="button"
                        onClick={() =>
                          setDialogTarget({ day: d, period: p.period, existing: slot ?? null })
                        }
                        className="group border-b border-l border-border p-1.5 text-left transition-colors hover:bg-muted/50"
                      >
                        {slot?.subject ? (
                          <div
                            className={cn(
                              "rounded-lg px-2 py-1.5 text-[11px]",
                              toneFor(slot.subject),
                            )}
                          >
                            <p className="truncate font-semibold">{slot.subject}</p>
                            {slot.subject !== "Break" && (
                              <p className="truncate opacity-80">{slot.room ?? "No room set"}</p>
                            )}
                          </div>
                        ) : (
                          <div className="grid h-full min-h-9 place-items-center rounded-lg text-muted-foreground/40 group-hover:text-primary">
                            <Plus className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <Dialog open={timingsOpen} onOpenChange={setTimingsOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>School Timings</DialogTitle>
            <DialogDescription>
              Working days and period times. These apply to every class's timetable.
            </DialogDescription>
          </DialogHeader>
          <SchoolTimingsEditor onSaved={() => setTimingsOpen(false)} />
        </DialogContent>
      </Dialog>

      {dialogTarget && classId && (
        <AssignSlotDialog
          open={!!dialogTarget}
          onOpenChange={(o) => !o && setDialogTarget(null)}
          classId={classId}
          className={`${activeClassName} - ${activeSection}`}
          day={dialogTarget.day}
          period={dialogTarget.period}
          existing={dialogTarget.existing}
          onSaved={async () => {
            await invalidate();
            setDialogTarget(null);
          }}
        />
      )}
    </>
  );
}

function AdminTeacherTimetable({ printRef }: { printRef: PrintRef }) {
  const { data: teachers } = useTeachers();
  const { data: slots, isLoading } = useTimetable();
  const { data: classes } = useClasses();
  const school = useSchoolBranding();
  const { days: DAYS, periods: PERIODS } = useSchoolTimings();
  const [teacherId, setTeacherId] = useState("");
  const activeTeacherId = teacherId || teachers?.[0]?.id || "";
  const activeTeacher = (teachers ?? []).find((t) => t.id === activeTeacherId);

  const classNameById = new Map((classes ?? []).map((c) => [c.id, `${c.name}-${c.section}`]));
  const teacherSlots = (slots ?? []).filter((s) => s.teacher_id === activeTeacherId);

  printRef.current = () => {
    if (!activeTeacher) {
      toast.error("Pick a teacher to print");
      return;
    }
    printTimetables(
      school,
      [
        {
          title: activeTeacher.name,
          subtitle: "Teacher timetable",
          cell: (day, period) => {
            const slot = teacherSlots.find((s) => s.day === day && s.period === period);
            if (!slot?.subject) return null;
            return {
              subject: slot.subject,
              lines: [
                slot.class_id ? withClassPrefix(classNameById.get(slot.class_id) ?? "") : "",
                slot.room ?? "",
              ],
            };
          },
        },
      ],
      DAYS,
      PERIODS,
      `Timetable ${activeTeacher.name}`,
    );
  };

  return (
    <SectionCard
      title={activeTeacher ? activeTeacher.name : "Select a teacher"}
      subtitle="Weekly teaching schedule across all classes"
      action={
        <Select value={activeTeacherId} onValueChange={setTeacherId}>
          <SelectTrigger className="h-9 w-[170px] bg-surface text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(teachers ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      bodyClassName="p-0"
    >
      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : !activeTeacherId ? (
        <EmptyState title="No teachers yet" />
      ) : (
        <TeacherScheduleList slots={teacherSlots} classNameById={classNameById} />
      )}
    </SectionCard>
  );
}

function AdminTimetableManagement() {
  const [tab, setTab] = useState<"class" | "teacher">("class");
  const { data: slots = [] } = useTimetable();
  const { data: classes } = useClasses();
  const { data: teachers } = useTeachers();
  const classPrint = useRef<(() => void) | null>(null);
  const teacherPrint = useRef<(() => void) | null>(null);

  function downloadTimetable() {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      ["Class", "Day", "Period", "Subject", "Teacher", "Room"],
      ...slots.map((slot) => {
        const c = (classes ?? []).find((x) => x.id === slot.class_id);
        return [
          c ? `${c.name}-${c.section}` : "",
          slot.day,
          slot.period,
          slot.subject,
          (teachers ?? []).find((t) => t.id === slot.teacher_id)?.name ?? "",
          slot.room,
        ];
      }),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "timetable.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Timetable Management"
        description="Assign periods — subject, teacher and classroom — by class, or view any teacher's weekly schedule."
        breadcrumb={["Dashboard", "Timetable"]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => (tab === "class" ? classPrint : teacherPrint).current?.()}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button size="sm" className="gap-1.5" onClick={downloadTimetable}>
              <Download className="h-4 w-4" /> Download
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "class" | "teacher")}>
        <TabsList>
          <TabsTrigger value="class">Class Timetable</TabsTrigger>
          <TabsTrigger value="teacher">Teacher Timetable</TabsTrigger>
        </TabsList>

        <TabsContent value="class" className="mt-4">
          <AdminClassTimetable printRef={classPrint} />
        </TabsContent>
        <TabsContent value="teacher" className="mt-4">
          <AdminTeacherTimetable printRef={teacherPrint} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "TEACHER") return <TeacherTimetableView />;
  if (user?.role === "STUDENT") return <StudentTimetableView />;
  return <AdminTimetableManagement />;
}
