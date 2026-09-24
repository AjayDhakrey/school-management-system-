"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { DAYS, PERIODS } from "@/data/mock";
import { useAuth } from "@/lib/auth-context";
import {
  useMyTeacherProfile,
  useTimetable,
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

const PALETTE = [
  "bg-info-soft text-info",
  "bg-gold-soft text-gold-foreground",
  "bg-success-soft text-success",
  "bg-primary/10 text-primary",
];

function toneFor(subject: string) {
  if (subject === "Break") return "bg-muted text-muted-foreground";
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash = (hash * 31 + subject.charCodeAt(i)) % 1000;
  return PALETTE[hash % PALETTE.length];
}

function weekLabel(offset: number) {
  const base = new Date(2026, 7, 3 + offset * 7);
  const end = new Date(base);
  end.setDate(base.getDate() + (DAYS.length - 1));
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(base)} – ${fmt(end)}, ${base.getFullYear()}`;
}

/** Shared read-only weekly list — a teacher's own schedule, or (for admins) any teacher's. */
function TeacherScheduleList({
  slots,
  classNameById,
}: {
  slots: ApiTimetableSlot[];
  classNameById: Map<string, string>;
}) {
  const [activeDay, setActiveDay] = useState(DAYS[0]!);
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
      <div className="flex gap-2 overflow-x-auto border-b border-border p-3 md:hidden">
        {DAYS.map((d) => (
          <button
            key={d}
            onClick={() => setActiveDay(d)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
              activeDay === d
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="space-y-2.5 p-3 md:hidden">
        {(grid[activeDay] ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No classes on {activeDay}.
          </p>
        ) : (
          (grid[activeDay] ?? []).map((slot) => {
            const isBreak = slot.subject === "Break";
            return (
              <div key={slot.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "rounded-lg px-2 py-1 text-xs font-semibold",
                      toneFor(slot.subject ?? ""),
                    )}
                  >
                    {slot.subject}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {PERIODS[slot.period - 1]?.time ?? `Period ${slot.period}`}
                  </span>
                </div>
                {!isBreak && (
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground/80">
                    <span className="flex items-center gap-1.5">
                      <School className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      Class {classNameById.get(slot.class_id ?? "") ?? "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {slot.room ?? "No room set"}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="p-2.5 font-medium">Day</th>
              <th className="p-2.5 font-medium">Period</th>
              <th className="p-2.5 font-medium">Subject</th>
              <th className="p-2.5 font-medium">Class</th>
              <th className="p-2.5 font-medium">Room</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.flatMap((day) =>
              (grid[day] ?? []).map((slot, i) => (
                <tr key={slot.id} className="border-b border-border last:border-0">
                  {i === 0 && (
                    <td className="p-2.5 align-top font-semibold" rowSpan={grid[day]?.length ?? 1}>
                      {day}
                    </td>
                  )}
                  <td className="p-2.5 text-muted-foreground">
                    {PERIODS[slot.period - 1]?.time ?? `Period ${slot.period}`}
                  </td>
                  <td className="p-2.5">
                    <span
                      className={cn(
                        "rounded-lg px-2 py-1 text-xs font-medium",
                        toneFor(slot.subject ?? ""),
                      )}
                    >
                      {slot.subject}
                    </span>
                  </td>
                  <td className="p-2.5 text-muted-foreground">
                    {classNameById.get(slot.class_id ?? "") ?? "—"}
                  </td>
                  <td className="p-2.5 text-muted-foreground">{slot.room ?? "—"}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
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
  const [day, setDay] = useState(() => {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    return DAYS.includes(today) ? today : DAYS[0]!;
  });
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
        <div className="flex gap-2 overflow-x-auto">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
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
        <div className="divide-y divide-border">
          {PERIODS.map((p) => {
            const slot = byPeriod.get(p.period);
            return (
              <div key={p.period} className="flex items-start gap-3 px-4 py-3">
                <div className="w-24 shrink-0">
                  <p className="text-sm font-semibold">Period {p.period}</p>
                  <p className="text-[11px] text-muted-foreground">{p.time}</p>
                </div>
                {slot?.subject ? (
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "rounded-lg px-2 py-1 text-xs font-semibold",
                        toneFor(slot.subject),
                      )}
                    >
                      {slot.subject}
                    </span>
                    {slot.subject !== "Break" && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/80">
                        <span className="flex items-center gap-1.5">
                          <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {slot.teacher_name ?? "No teacher set"}
                          {slot.teacher_id && slot.teacher_id === teacher?.id && (
                            <span className="font-semibold text-primary">(You)</span>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {slot.room ?? "No room set"}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="flex-1 pt-0.5 text-sm text-muted-foreground">Free period</p>
                )}
              </div>
            );
          })}
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
            {className} · {day} · {PERIODS[period - 1]?.time ?? `Period ${period}`}
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

function AdminClassTimetable() {
  const { data: classes } = useClasses();
  const { data: slots, isLoading } = useTimetable();
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

  return (
    <>
      <SectionCard
        title={classId ? `${activeClassName} – Section ${activeSection}` : "Select a class"}
        subtitle={weekLabel(weekOffset)}
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
              {DAYS.map((d) => (
                <div
                  key={d}
                  className="border-b border-l border-border bg-muted/40 p-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {PERIODS.map((p, pi) => (
                <Fragment key={p.period}>
                  <div className="border-b border-border p-2 text-xs">
                    <p className="font-semibold">Period {p.period}</p>
                    <p className="text-[11px] text-muted-foreground">{p.time}</p>
                  </div>
                  {DAYS.map((d) => {
                    const slot = grid[d]?.[pi];
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

function AdminTeacherTimetable() {
  const { data: teachers } = useTeachers();
  const { data: slots, isLoading } = useTimetable();
  const { data: classes } = useClasses();
  const [teacherId, setTeacherId] = useState("");
  const activeTeacherId = teacherId || teachers?.[0]?.id || "";
  const activeTeacher = (teachers ?? []).find((t) => t.id === activeTeacherId);

  const classNameById = new Map((classes ?? []).map((c) => [c.id, `${c.name}-${c.section}`]));
  const teacherSlots = (slots ?? []).filter((s) => s.teacher_id === activeTeacherId);

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

  function downloadTimetable() {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      ["Day", "Period", "Subject", "Teacher ID", "Room", "Class ID"],
      ...slots.map((slot) => [
        slot.day,
        slot.period,
        slot.subject,
        slot.teacher_id,
        slot.room,
        slot.class_id,
      ]),
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
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
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
          <AdminClassTimetable />
        </TabsContent>
        <TabsContent value="teacher" className="mt-4">
          <AdminTeacherTimetable />
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
