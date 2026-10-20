"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  UserRound,
  MapPin,
  Coffee,
  BookOpen,
} from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import {
  useTimetableFor,
  useClassTimetable,
  useTeachers,
  type ApiClassTimetableSlot,
} from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";
import { useSchoolTimings, isPeriodLive } from "@/lib/school-timings";
import {
  toneFor,
  useWeekHolidays,
  HolidayDay,
  todayName,
  PeriodCard,
  MetaItem,
} from "@/components/timetable/TimetableShared";
import { cn } from "@/lib/utils";

export default function ParentTimetablePage() {
  const { selectedChild, selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: childSlots, isLoading: slotsLoading } = useTimetableFor(selectedChildId ?? undefined);
  const { data: classSlots } = useClassTimetable(selectedChild?.class_id ?? undefined);
  const { data: teachers } = useTeachers();
  const { days: DAYS, periods: PERIODS } = useSchoolTimings();
  const [activeDay, setActiveDay] = useState(() => todayName(DAYS));
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const weekDay = useWeekHolidays(0);

  const teacherNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teachers ?? []) {
      map.set(t.id, t.name);
    }
    return map;
  }, [teachers]);

  const teacherName = (slot: { teacher_id?: string | null; teacher_name?: string | null } | undefined) => {
    if (!slot) return null;
    if (slot.teacher_name) return slot.teacher_name;
    if (slot.teacher_id) return teacherNameById.get(slot.teacher_id) ?? null;
    return null;
  };

  const slots = useMemo(() => {
    const base = childSlots ?? [];
    if (!base.length && classSlots?.length) {
      return classSlots.map((cs) => ({
        id: cs.id,
        school_id: "",
        class_id: selectedChild?.class_id ?? null,
        day: cs.day,
        period: cs.period,
        subject: cs.subject,
        teacher_id: cs.teacher_id,
        room: cs.room,
        teacher_name: cs.teacher_name,
      }));
    }
    const classSlotByDayPeriod = new Map<string, ApiClassTimetableSlot>();
    for (const cs of classSlots ?? []) {
      classSlotByDayPeriod.set(`${cs.day}-${cs.period}`, cs);
    }
    return base.map((s) => {
      const match = classSlotByDayPeriod.get(`${s.day}-${s.period}`);
      return {
        ...s,
        room: s.room || match?.room || null,
        teacher_name: match?.teacher_name || (s.teacher_id ? teacherNameById.get(s.teacher_id) : null) || null,
      };
    });
  }, [childSlots, classSlots, selectedChild?.class_id, teacherNameById]);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof slots>();
    for (const day of DAYS) map.set(day, []);
    for (const s of slots) {
      if (!map.has(s.day)) map.set(s.day, []);
      map.get(s.day)!.push(s);
    }
    for (const list of map.values()) list?.sort((a, b) => a.period - b.period);
    return map;
  }, [slots, DAYS]);

  const hasAny = slots.length > 0;
  const todayDay = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const isLoading = childrenLoading || slotsLoading;

  return (
    <div>
      <PageHeader
        title="Timetable"
        description={
          selectedChild
            ? `Weekly class schedule for ${selectedChild.name}.`
            : "Weekly class schedule."
        }
        breadcrumb={["Dashboard", "My Children", "Timetable"]}
      />

      <ChildSwitcher />

      {isLoading ? (
        <CardSkeleton count={6} />
      ) : !hasAny ? (
        <div className="panel">
          <EmptyState
            title="No timetable published yet"
            description="Your school hasn't set a timetable for this child's class yet."
            icon={CalendarClock}
          />
        </div>
      ) : (
        <SectionCard
          title={viewMode === "day" ? `${activeDay}'s Schedule` : "Weekly Schedule"}
          subtitle={
            viewMode === "day"
              ? `${(byDay.get(activeDay) ?? []).length} periods · ${weekDay(activeDay).holiday ? "Holiday" : activeDay === todayDay ? "Today" : "Working Day"}`
              : `All ${DAYS.length} days overview for ${
                  selectedChild?.class_name
                    ? `Class ${selectedChild.class_name}${selectedChild.section ? `-${selectedChild.section}` : ""}`
                    : "Class"
                }`
          }
          action={
            <div className="grid w-full grid-cols-2 rounded-xl border border-border/80 bg-muted/60 p-1 shadow-inner sm:w-auto sm:flex sm:items-center sm:gap-1">
              <button
                type="button"
                onClick={() => setViewMode("day")}
                className={cn(
                  "flex min-h-[38px] items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] sm:min-h-[34px] sm:text-sm",
                  viewMode === "day"
                    ? "bg-background text-foreground shadow-xs ring-1 ring-black/5 dark:ring-white/10"
                    : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
                )}
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                <span>Day View</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("week")}
                className={cn(
                  "flex min-h-[38px] items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] sm:min-h-[34px] sm:text-sm",
                  viewMode === "week"
                    ? "bg-background text-foreground shadow-xs ring-1 ring-black/5 dark:ring-white/10"
                    : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-4 w-4 shrink-0 text-primary" />
                <span>Full Week</span>
              </button>
            </div>
          }
          bodyClassName="p-0"
        >
          {viewMode === "day" ? (
            <div>
              {/* Day pill selector like Student panel */}
              <div className="border-b border-border p-3">
                <div className="grid grid-cols-6 gap-1.5 md:max-w-2xl">
                  {DAYS.map((d) => {
                    const isToday = d === todayDay;
                    const isSelected = activeDay === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setActiveDay(d)}
                        className={cn(
                          "relative min-w-0 rounded-full border py-2 text-center text-xs font-medium transition-all active:scale-95",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                            : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <span className="md:hidden">{d.slice(0, 3)}</span>
                        <span className="hidden md:inline">{d}</span>
                        {isToday && (
                          <span
                            className={cn(
                              "absolute top-1 right-2 h-1.5 w-1.5 rounded-full",
                              isSelected ? "bg-primary" : "bg-primary/70",
                            )}
                            title="Today"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Day cards grid */}
              <div className="grid gap-2.5 p-3 md:grid-cols-2 xl:grid-cols-3">
                {weekDay(activeDay).holiday ? (
                  <HolidayDay name={weekDay(activeDay).holiday!.name} date={weekDay(activeDay).date} />
                ) : (byDay.get(activeDay) ?? []).length === 0 ? (
                  <div className="col-span-full py-12 text-center">
                    <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="mt-2 text-sm font-medium text-muted-foreground">
                      No classes scheduled on {activeDay}.
                    </p>
                  </div>
                ) : (
                  (byDay.get(activeDay) ?? []).map((slot) => {
                    const isLive = isPeriodLive(activeDay, PERIODS[slot.period - 1]);
                    const tName = teacherName(slot);
                    return (
                      <PeriodCard
                        key={slot.id || `${slot.day}-${slot.period}`}
                        period={slot.period}
                        subject={slot.subject}
                        live={isLive}
                      >
                        {tName && <MetaItem icon={UserRound}>{tName}</MetaItem>}
                        <MetaItem icon={MapPin}>{slot.room ?? "Classroom"}</MetaItem>
                      </PeriodCard>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* Full Week Grid View */
            <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {DAYS.map((day) => {
                const daySlots = byDay.get(day) ?? [];
                const isToday = day === todayDay;
                const holiday = weekDay(day).holiday;
                return (
                  <div
                    key={day}
                    className={cn(
                      "flex flex-col rounded-2xl border bg-card p-3.5 shadow-xs transition-all hover:shadow-md",
                      isToday ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
                      <div className="flex items-center gap-2">
                        <p className="font-display text-sm font-bold">{day}</p>
                        <span className="text-xs font-normal text-muted-foreground">
                          {weekDay(day).date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                        {isToday && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Today
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {holiday ? "Holiday" : `${daySlots.length} periods`}
                      </span>
                    </div>

                    {holiday ? (
                      <div className="flex flex-1 items-center justify-center rounded-xl bg-pink-50/70 p-4 text-center dark:bg-pink-950/20">
                        <div>
                          <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">
                            🎉 {holiday.name}
                          </span>
                          <p className="text-[11px] text-muted-foreground">No classes</p>
                        </div>
                      </div>
                    ) : daySlots.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">No periods</p>
                    ) : (
                      <ul className="space-y-2">
                        {daySlots.map((s) => {
                          const isLive = isPeriodLive(day, PERIODS[s.period - 1]);
                          const tName = teacherName(s);
                          if (s.subject === "Break") {
                            return (
                              <li
                                key={s.id || `${day}-${s.period}`}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-muted/40 py-1 text-[11px] font-medium text-muted-foreground"
                              >
                                <Coffee className="h-3.5 w-3.5" /> Break ·{" "}
                                {PERIODS[s.period - 1]?.time ?? `Period ${s.period}`}
                              </li>
                            );
                          }
                          return (
                            <li
                              key={s.id || `${day}-${s.period}`}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-xl border bg-background/60 p-2 text-xs transition-colors",
                                isLive
                                  ? "border-primary/60 ring-1 ring-primary/20 bg-primary/5"
                                  : "border-border/60",
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className={cn(
                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                                    s.subject ? toneFor(s.subject) : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {s.period}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate font-semibold text-foreground">
                                      {s.subject ?? "—"}
                                    </span>
                                    {isLive && (
                                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                                    )}
                                  </div>
                                  <p className="truncate text-[10px] text-muted-foreground">
                                    {PERIODS[s.period - 1]?.time ?? `Period ${s.period}`}
                                    {s.room ? ` · ${s.room}` : ""}
                                  </p>
                                </div>
                              </div>
                              {tName && (
                                <span
                                  className="max-w-[90px] shrink-0 truncate text-right text-[10px] text-muted-foreground"
                                  title={tName}
                                >
                                  {tName}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
