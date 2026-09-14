"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useTimetableFor } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ParentTimetablePage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: slots, isLoading } = useTimetableFor(selectedChildId ?? undefined);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof slots>();
    for (const day of DAYS) map.set(day, []);
    for (const s of slots ?? []) {
      if (!map.has(s.day)) map.set(s.day, []);
      map.get(s.day)!.push(s);
    }
    for (const list of map.values()) list?.sort((a, b) => a.period - b.period);
    return map;
  }, [slots]);

  const hasAny = (slots ?? []).length > 0;

  return (
    <div>
      <PageHeader title="Timetable" description="Weekly class schedule." breadcrumb={["Dashboard", "My Children", "Timetable"]} />
      <ChildSwitcher />

      {childrenLoading || isLoading ? (
        <CardSkeleton count={6} />
      ) : !hasAny ? (
        <div className="panel">
          <EmptyState title="No timetable published yet" description="Your school hasn't set a timetable for this child's class yet." icon={CalendarClock} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DAYS.map((day) => {
            const daySlots = byDay.get(day) ?? [];
            return (
              <div key={day} className="panel p-4">
                <p className="mb-2 font-display text-sm font-bold">{day}</p>
                {daySlots.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No periods</p>
                ) : (
                  <ul className="space-y-1.5">
                    {daySlots.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm">
                        <span className="font-medium">{s.subject ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">Period {s.period}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
