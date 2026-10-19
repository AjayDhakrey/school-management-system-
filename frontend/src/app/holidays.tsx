"use client";

import { useMemo, useState } from "react";
import {
  CalendarHeart,
  Hourglass,
  ChevronLeft,
  ChevronRight,
  Sun,
  PartyPopper,
  BookOpen,
  Palmtree,
  Star,
  Clock,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHolidays, type ApiHoliday } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

/* ──────────────────────── CBSE Holiday Data ──────────────────────── */

type HolidayType = "National" | "Religious" | "School" | "Vacation";

interface CbseHoliday {
  id: string;
  school_id: string;
  name: string;
  date: string;
  day: string;
  type: HolidayType;
  session: string;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayOfWeek(date: string): string {
  const d = new Date(date);
  return WEEKDAY[d.getDay()] ?? "";
}

/** CBSE school holidays for academic session 2026-27 (Apr 2026 – Mar 2027). */
const CBSE_HOLIDAYS_2026_27: CbseHoliday[] = [
  // April 2026
  { id: "h01", school_id: "s1", name: "Ambedkar Jayanti", date: "2026-04-14", day: dayOfWeek("2026-04-14"), type: "National", session: "2026-27" },
  { id: "h02", school_id: "s1", name: "Ram Navami", date: "2026-04-15", day: dayOfWeek("2026-04-15"), type: "Religious", session: "2026-27" },
  { id: "h03", school_id: "s1", name: "Mahavir Jayanti", date: "2026-04-16", day: dayOfWeek("2026-04-16"), type: "Religious", session: "2026-27" },
  // May 2026
  { id: "h04", school_id: "s1", name: "Buddha Purnima", date: "2026-05-01", day: dayOfWeek("2026-05-01"), type: "Religious", session: "2026-27" },
  { id: "h05", school_id: "s1", name: "Summer Vacation Begins", date: "2026-05-11", day: dayOfWeek("2026-05-11"), type: "Vacation", session: "2026-27" },
  { id: "h06", school_id: "s1", name: "Summer Vacation Ends", date: "2026-06-30", day: dayOfWeek("2026-06-30"), type: "Vacation", session: "2026-27" },
  // July 2026
  { id: "h07", school_id: "s1", name: "School Reopens", date: "2026-07-01", day: dayOfWeek("2026-07-01"), type: "School", session: "2026-27" },
  { id: "h08", school_id: "s1", name: "Muharram", date: "2026-07-17", day: dayOfWeek("2026-07-17"), type: "Religious", session: "2026-27" },
  // August 2026
  { id: "h09", school_id: "s1", name: "Independence Day", date: "2026-08-15", day: dayOfWeek("2026-08-15"), type: "National", session: "2026-27" },
  { id: "h10", school_id: "s1", name: "Raksha Bandhan", date: "2026-08-20", day: dayOfWeek("2026-08-20"), type: "Religious", session: "2026-27" },
  { id: "h11", school_id: "s1", name: "Janmashtami", date: "2026-08-22", day: dayOfWeek("2026-08-22"), type: "Religious", session: "2026-27" },
  // September 2026
  { id: "h12", school_id: "s1", name: "Milad-un-Nabi", date: "2026-09-16", day: dayOfWeek("2026-09-16"), type: "Religious", session: "2026-27" },
  // October 2026
  { id: "h13", school_id: "s1", name: "Gandhi Jayanti", date: "2026-10-02", day: dayOfWeek("2026-10-02"), type: "National", session: "2026-27" },
  { id: "h14", school_id: "s1", name: "Dussehra", date: "2026-10-12", day: dayOfWeek("2026-10-12"), type: "Religious", session: "2026-27" },
  { id: "h15", school_id: "s1", name: "Dussehra Holiday", date: "2026-10-13", day: dayOfWeek("2026-10-13"), type: "Religious", session: "2026-27" },
  { id: "h16", school_id: "s1", name: "Autumn Break Begins", date: "2026-10-14", day: dayOfWeek("2026-10-14"), type: "Vacation", session: "2026-27" },
  { id: "h17", school_id: "s1", name: "Autumn Break Ends", date: "2026-10-18", day: dayOfWeek("2026-10-18"), type: "Vacation", session: "2026-27" },
  { id: "h18", school_id: "s1", name: "Diwali", date: "2026-10-31", day: dayOfWeek("2026-10-31"), type: "Religious", session: "2026-27" },
  // November 2026
  { id: "h19", school_id: "s1", name: "Diwali Holiday", date: "2026-11-01", day: dayOfWeek("2026-11-01"), type: "Religious", session: "2026-27" },
  { id: "h20", school_id: "s1", name: "Bhai Dooj", date: "2026-11-02", day: dayOfWeek("2026-11-02"), type: "Religious", session: "2026-27" },
  { id: "h21", school_id: "s1", name: "Guru Nanak Jayanti", date: "2026-11-15", day: dayOfWeek("2026-11-15"), type: "Religious", session: "2026-27" },
  { id: "h22", school_id: "s1", name: "Children's Day (School Celebration)", date: "2026-11-14", day: dayOfWeek("2026-11-14"), type: "School", session: "2026-27" },
  // December 2026
  { id: "h23", school_id: "s1", name: "Christmas Eve", date: "2026-12-24", day: dayOfWeek("2026-12-24"), type: "Religious", session: "2026-27" },
  { id: "h24", school_id: "s1", name: "Christmas Day", date: "2026-12-25", day: dayOfWeek("2026-12-25"), type: "Religious", session: "2026-27" },
  { id: "h25", school_id: "s1", name: "Winter Break Begins", date: "2026-12-26", day: dayOfWeek("2026-12-26"), type: "Vacation", session: "2026-27" },
  // January 2027
  { id: "h26", school_id: "s1", name: "Winter Break Ends", date: "2027-01-01", day: dayOfWeek("2027-01-01"), type: "Vacation", session: "2026-27" },
  { id: "h27", school_id: "s1", name: "Lohri", date: "2027-01-13", day: dayOfWeek("2027-01-13"), type: "Religious", session: "2026-27" },
  { id: "h28", school_id: "s1", name: "Makar Sankranti / Pongal", date: "2027-01-14", day: dayOfWeek("2027-01-14"), type: "Religious", session: "2026-27" },
  { id: "h29", school_id: "s1", name: "Republic Day", date: "2027-01-26", day: dayOfWeek("2027-01-26"), type: "National", session: "2026-27" },
  // February 2027
  { id: "h30", school_id: "s1", name: "Basant Panchami", date: "2027-02-01", day: dayOfWeek("2027-02-01"), type: "Religious", session: "2026-27" },
  { id: "h31", school_id: "s1", name: "Maha Shivaratri", date: "2027-02-23", day: dayOfWeek("2027-02-23"), type: "Religious", session: "2026-27" },
  // March 2027
  { id: "h32", school_id: "s1", name: "Holi", date: "2027-03-14", day: dayOfWeek("2027-03-14"), type: "Religious", session: "2026-27" },
  { id: "h33", school_id: "s1", name: "Holi Holiday", date: "2027-03-15", day: dayOfWeek("2027-03-15"), type: "Religious", session: "2026-27" },
  { id: "h34", school_id: "s1", name: "Annual Exam Break Begins", date: "2027-03-01", day: dayOfWeek("2027-03-01"), type: "School", session: "2026-27" },
  { id: "h35", school_id: "s1", name: "Session Ends", date: "2027-03-31", day: dayOfWeek("2027-03-31"), type: "School", session: "2026-27" },
];

/* ──────────────────────── Helpers ──────────────────────── */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TYPE_STYLES: Record<HolidayType, { bg: string; text: string; ring: string }> = {
  National: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-400" },
  Religious: { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300", ring: "ring-violet-400" },
  School: { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-300", ring: "ring-sky-400" },
  Vacation: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-400" },
};

const TYPE_ICONS: Record<HolidayType, typeof Sun> = {
  National: Star,
  Religious: PartyPopper,
  School: BookOpen,
  Vacation: Palmtree,
};

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function isSameDay(a: string, b: Date): boolean {
  return a === `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}-${String(b.getDate()).padStart(2, "0")}`;
}

function isToday(dateStr: string): boolean {
  return isSameDay(dateStr, new Date());
}

/* ──────────────────────── Calendar Component ──────────────────────── */

function MonthCalendar({
  year,
  month,
  holidays,
  selectedDate,
  onSelectDate,
}: {
  year: number;
  month: number;
  holidays: CbseHoliday[];
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const holidayMap = useMemo(() => {
    const map = new Map<number, CbseHoliday[]>();
    for (const h of holidays) {
      const d = new Date(h.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        const arr = map.get(day) ?? [];
        arr.push(h);
        map.set(day, arr);
      }
    }
    return map;
  }, [holidays, year, month]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            className={cn(
              "py-1.5 text-center text-[10px] font-bold uppercase tracking-wider",
              d === "Su" ? "text-destructive/70" : "text-muted-foreground",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null)
            return <div key={`empty-${i}`} className="aspect-square" />;

          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayHols = holidayMap.get(day);
          const isHol = Boolean(dayHols && dayHols.length > 0);
          const isTod = isCurrentMonth && day === todayDate;
          const isSun = new Date(year, month, day).getDay() === 0;
          const isSelected = selectedDate === dateStr;

          // Choose the dominant holiday type for color
          const holType = dayHols?.[0]?.type as HolidayType | undefined;
          const holStyle = holType ? TYPE_STYLES[holType] : null;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : isHol ? dateStr : null)}
              className={cn(
                "relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-medium transition-all",
                "hover:bg-muted/60",
                isTod && !isHol && "ring-2 ring-primary ring-offset-1 ring-offset-background font-bold",
                isSun && !isHol && "text-destructive/70",
                isHol && holStyle && `${holStyle.bg} ${holStyle.text} font-bold`,
                isSelected && "ring-2 ring-offset-1 ring-offset-background scale-110 shadow-md",
                isSelected && holStyle && holStyle.ring,
              )}
              title={dayHols?.map((h) => h.name).join(", ")}
            >
              <span className="leading-none">{day}</span>
              {isHol && (
                <span className="absolute bottom-0.5 flex gap-0.5">
                  {(dayHols ?? []).slice(0, 3).map((_, j) => (
                    <span
                      key={j}
                      className={cn(
                        "h-1 w-1 rounded-full",
                        holStyle?.text ?? "bg-primary",
                      )}
                      style={{ backgroundColor: "currentColor" }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────── Main Page ──────────────────────── */

export default function HolidaysPage() {
  const { data: apiHolidays } = useHolidays();

  // Merge API data with CBSE built-in data — API holidays override if any exist
  const allHolidays = useMemo<CbseHoliday[]>(() => {
    const apiList = (apiHolidays ?? []) as ApiHoliday[];
    if (apiList.length > 0) {
      return apiList.map((h) => ({
        ...h,
        day: h.day ?? dayOfWeek(h.date),
        type: (h.type ?? "School") as HolidayType,
        session: h.session ?? "2026-27",
      }));
    }
    return CBSE_HOLIDAYS_2026_27;
  }, [apiHolidays]);

  const sortedHolidays = useMemo(
    () => [...allHolidays].sort((a, b) => a.date.localeCompare(b.date)),
    [allHolidays],
  );

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const upcoming = useMemo(
    () => sortedHolidays.filter((h) => h.date >= todayStr),
    [sortedHolidays, todayStr],
  );
  const past = useMemo(
    () => sortedHolidays.filter((h) => h.date < todayStr),
    [sortedHolidays, todayStr],
  );

  const typeCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of allHolidays) {
      counts[h.type] = (counts[h.type] ?? 0) + 1;
    }
    return counts;
  }, [allHolidays]);

  // Calendar state — academic year starts April
  const [calYear, setCalYear] = useState(today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1);
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<HolidayType | "All">("All");

  const selectedHolidays = useMemo(
    () => (selectedDate ? allHolidays.filter((h) => h.date === selectedDate) : []),
    [selectedDate, allHolidays],
  );

  const filteredList = useMemo(
    () => (listFilter === "All" ? sortedHolidays : sortedHolidays.filter((h) => h.type === listFilter)),
    [sortedHolidays, listFilter],
  );

  function prevMonth() {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
    setSelectedDate(null);
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
    setSelectedDate(null);
  }

  function goToToday() {
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
    setSelectedDate(null);
  }

  // Holidays in the current calendar month
  const monthHolidays = useMemo(
    () =>
      sortedHolidays.filter((h) => {
        const d = new Date(h.date);
        return d.getFullYear() === calYear && d.getMonth() === calMonth;
      }),
    [sortedHolidays, calYear, calMonth],
  );

  return (
    <div>
      <PageHeader
        title="Holiday Calendar"
        description="CBSE Academic Session 2026-27 · Full year school holidays"
        breadcrumb={["Dashboard", "Holidays"]}
      />

      {/* ── Stats Row ── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard label="Total Holidays" value={allHolidays.length} icon={CalendarHeart} tone="navy" />
        <InfoCard label="Upcoming" value={upcoming.length} icon={Hourglass} tone="gold" />
        <InfoCard label="National" value={typeCount["National"] ?? 0} icon={Star} tone="warning" />
        <InfoCard label="Vacations" value={typeCount["Vacation"] ?? 0} icon={Palmtree} tone="success" />
      </div>

      {/* ── Main Content: Calendar + Sidebar ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Calendar Panel */}
        <div className="lg:col-span-2">
          <div className="panel overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="min-w-[140px] text-center font-display text-base font-bold sm:text-lg">
                  {MONTH_NAMES[calMonth]} {calYear}
                </h2>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToToday}>
                <Clock className="mr-1 h-3.5 w-3.5" /> Today
              </Button>
            </div>

            {/* Calendar Grid */}
            <div className="p-3 sm:p-5">
              <MonthCalendar
                year={calYear}
                month={calMonth}
                holidays={allHolidays}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 border-t border-border px-4 py-3 sm:px-5">
              {(Object.entries(TYPE_STYLES) as [HolidayType, typeof TYPE_STYLES[HolidayType]][]).map(
                ([type, style]) => {
                  const Icon = TYPE_ICONS[type];
                  return (
                    <div key={type} className="flex items-center gap-1.5">
                      <span className={cn("grid h-5 w-5 place-items-center rounded-md", style.bg, style.text)}>
                        <Icon className="h-3 w-3" />
                      </span>
                      <span className="text-[11px] font-medium text-muted-foreground">{type}</span>
                    </div>
                  );
                },
              )}
              <div className="flex items-center gap-1.5">
                <span className="grid h-5 w-5 place-items-center rounded-md text-destructive/70 text-[10px] font-bold">
                  Su
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">Sunday</span>
              </div>
            </div>

            {/* Selected date detail */}
            {selectedDate && selectedHolidays.length > 0 && (
              <div className="border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {formatDateShort(selectedDate)}
                </p>
                <div className="space-y-2">
                  {selectedHolidays.map((h) => {
                    const style = TYPE_STYLES[h.type];
                    const Icon = TYPE_ICONS[h.type];
                    return (
                      <div
                        key={h.id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5",
                          style.bg,
                        )}
                      >
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", style.text)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className={cn("text-sm font-bold", style.text)}>{h.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {h.day} · {h.type}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Month holidays summary */}
            {monthHolidays.length > 0 && !selectedDate && (
              <div className="border-t border-border px-4 py-3 sm:px-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {monthHolidays.length} holiday{monthHolidays.length !== 1 ? "s" : ""} in{" "}
                  {MONTH_NAMES[calMonth]}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {monthHolidays.map((h) => {
                    const style = TYPE_STYLES[h.type];
                    const Icon = TYPE_ICONS[h.type];
                    return (
                      <div
                        key={h.id}
                        className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/40"
                      >
                        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", style.bg, style.text)}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">{h.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDateShort(h.date)} · {h.day}
                          </p>
                        </div>
                        <StatusBadge status={h.type} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Upcoming Holidays */}
        <div className="space-y-4">
          <SectionCard title="Upcoming Holidays" subtitle={`${upcoming.length} holidays remaining`}>
            {upcoming.length === 0 ? (
              <EmptyState
                title="No upcoming holidays"
                description="All holidays for this session have passed."
                icon={CalendarHeart}
              />
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 8).map((h) => {
                  const style = TYPE_STYLES[h.type];
                  const Icon = TYPE_ICONS[h.type];
                  const isTod = isToday(h.date);
                  return (
                    <div
                      key={h.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/40",
                        isTod && "ring-2 ring-primary/40 bg-primary/5",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl",
                          style.bg,
                        )}
                      >
                        <span className={cn("text-[10px] font-bold uppercase leading-none", style.text)}>
                          {(MONTH_NAMES[new Date(h.date).getMonth()] ?? "").slice(0, 3)}
                        </span>
                        <span className={cn("text-sm font-bold leading-tight", style.text)}>
                          {new Date(h.date).getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{h.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {h.day} · {h.type}
                          {isTod && (
                            <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                              TODAY
                            </span>
                          )}
                        </p>
                      </div>
                      <Icon className={cn("h-4 w-4 shrink-0", style.text)} />
                    </div>
                  );
                })}
                {upcoming.length > 8 && (
                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    +{upcoming.length - 8} more holidays
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          {/* Quick stats by type */}
          <SectionCard title="By Category">
            <div className="grid grid-cols-2 gap-2">
              {(["National", "Religious", "School", "Vacation"] as HolidayType[]).map((type) => {
                const style = TYPE_STYLES[type];
                const Icon = TYPE_ICONS[type];
                const count = typeCount[type] ?? 0;
                return (
                  <div
                    key={type}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5",
                      style.bg,
                    )}
                  >
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", style.text)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className={cn("text-lg font-bold leading-none", style.text)}>{count}</p>
                      <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{type}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Full Holiday List Table ── */}
      <div className="mt-4 panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display text-base font-bold">All Holidays — Session 2026-27</h3>
          <div className="flex flex-wrap gap-1.5">
            {(["All", "National", "Religious", "School", "Vacation"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setListFilter(type)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  listFilter === type
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {type} {type !== "All" && `(${typeCount[type] ?? 0})`}
              </button>
            ))}
          </div>
        </div>

        {filteredList.length === 0 ? (
          <EmptyState title="No holidays in this category" icon={CalendarHeart} />
        ) : (
          <>
            {/* Mobile Cards */}
            <ul className="divide-y divide-border md:hidden">
              {filteredList.map((h) => {
                const style = TYPE_STYLES[h.type];
                const Icon = TYPE_ICONS[h.type];
                const isPast = h.date < todayStr;
                return (
                  <li
                    key={h.id}
                    className={cn("flex items-center gap-3 px-4 py-3", isPast && "opacity-60")}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl",
                        style.bg,
                      )}
                    >
                      <span className={cn("text-[10px] font-bold uppercase leading-none", style.text)}>
                        {(MONTH_NAMES[new Date(h.date).getMonth()] ?? "").slice(0, 3)}
                      </span>
                      <span className={cn("text-sm font-bold leading-tight", style.text)}>
                        {new Date(h.date).getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{h.name}</p>
                      <p className="text-[11px] text-muted-foreground">{h.day} · {h.session}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Icon className={cn("h-3.5 w-3.5", style.text)} />
                      <span className={cn("text-[11px] font-semibold", style.text)}>{h.type}</span>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Holiday</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredList.map((h, idx) => {
                    const style = TYPE_STYLES[h.type];
                    const Icon = TYPE_ICONS[h.type];
                    const isPast = h.date < todayStr;
                    const isTod = isToday(h.date);
                    return (
                      <TableRow
                        key={h.id}
                        className={cn(
                          isPast && "opacity-50",
                          isTod && "bg-primary/5 font-semibold",
                        )}
                      >
                        <TableCell className="text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", style.bg, style.text)}>
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="font-medium">{h.name}</span>
                            {isTod && (
                              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                                TODAY
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{formatDateShort(h.date)}</TableCell>
                        <TableCell>{h.day}</TableCell>
                        <TableCell>
                          <StatusBadge status={h.type} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{h.session}</TableCell>
                        <TableCell className="text-right">
                          {isPast ? (
                            <span className="text-xs text-muted-foreground">Passed</span>
                          ) : isTod ? (
                            <StatusBadge status="Today" />
                          ) : (
                            <StatusBadge status="Upcoming" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
