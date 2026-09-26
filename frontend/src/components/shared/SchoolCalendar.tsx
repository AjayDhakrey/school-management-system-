import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiSchoolEvent } from "@/hooks/useApi";

const WD = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function SchoolCalendar({
  className,
  onSelect,
  compact = true,
  events = [],
}: {
  className?: string;
  onSelect?: (iso: string) => void;
  compact?: boolean;
  events?: ApiSchoolEvent[];
}) {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(iso(today));

  const eventDates = useMemo(() => new Set(events.map((e) => e.date)), [events]);

  const first = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = first.getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (d: number) => {
    const m = cursor.m + d;
    setCursor({ y: cursor.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };

  return (
    <div className={cn("", className)}>
      <div className="mb-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold sm:text-base">
            {MONTHS[cursor.m]} {cursor.y}
          </p>
          {!compact && <p className="text-xs text-muted-foreground">Academic calendar</p>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => shift(1)}
            aria-label="Next month"
            className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {WD.map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const dayIso = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isToday = dayIso === iso(today);
          const isSelected = dayIso === selected;
          const hasEvent = eventDates.has(dayIso);
          return (
            <button
              key={i}
              onClick={() => {
                setSelected(dayIso);
                onSelect?.(dayIso);
              }}
              className={cn(
                "relative grid aspect-square place-items-center rounded-lg text-xs font-medium transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                    ? "bg-gold-soft text-gold-foreground"
                    : "text-foreground/80 hover:bg-accent",
              )}
            >
              {d}
              {hasEvent && (
                <span
                  className={cn(
                    "absolute bottom-1 h-1 w-1 rounded-full",
                    isSelected ? "bg-primary-foreground" : "bg-gold",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gold" /> School event
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Selected
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {events
          .filter((e) => e.date === selected)
          .map((e) => (
            <div
              key={e.id}
              className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs"
            >
              <p className="font-semibold">{e.title}</p>
              <p className="text-muted-foreground">
                {e.time} · {e.location}
              </p>
            </div>
          ))}
        {events.filter((e) => e.date === selected).length === 0 && (
          <p className="text-xs text-muted-foreground">No events scheduled on this date.</p>
        )}
      </div>
    </div>
  );
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
