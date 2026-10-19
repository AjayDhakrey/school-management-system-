"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarHeart,
  Hourglass,
  ChevronLeft,
  ChevronRight,
  Sun,
  Sparkles,
  BookOpen,
  Palmtree,
  Star,
  Clock,
  Briefcase,
  CheckCircle2,
  CalendarDays,
  Info,
  School,
  CalendarX2,
  Plus,
  Trash2,
  Download,
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
import { useAcademicYears, useHolidays, type ApiHoliday } from "@/hooks/useApi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { useSchoolTimings } from "@/lib/school-timings";
import { cn } from "@/lib/utils";

/* ──────────────────────── Types & Constants ──────────────────────── */

export type HolidayType = "National" | "Religious" | "School" | "Vacation";

export interface HolidayEntry {
  id: string;
  name: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  type: HolidayType;
  description?: string | undefined;
  isOptional?: boolean | undefined;
  /** Database rows behind this entry (one per day) — used to delete it. */
  ids?: string[];
}

const HOLIDAY_TYPES: HolidayType[] = ["National", "Religious", "School", "Vacation"];

/**
 * The school stores one row per holiday date. Consecutive dates with the same name and
 * type are shown as one holiday ("Summer Vacation · 15 May – 30 Jun").
 */
function groupHolidayRows(rows: ApiHoliday[]): HolidayEntry[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const out: HolidayEntry[] = [];
  for (const r of sorted) {
    const date = r.date.slice(0, 10);
    const type = (HOLIDAY_TYPES as string[]).includes(r.type ?? "")
      ? (r.type as HolidayType)
      : "School";
    const prev = out[out.length - 1];
    if (prev && prev.name === r.name && prev.type === type) {
      const next = new Date(`${prev.endDate}T00:00:00`);
      next.setDate(next.getDate() + 1);
      const nextIso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      if (nextIso === date) {
        prev.endDate = date;
        prev.ids = [...(prev.ids ?? []), r.id];
        continue;
      }
    }
    out.push({ id: r.id, name: r.name, startDate: date, endDate: date, type, ids: [r.id] });
  }
  return out;
}

const TYPE_STYLES: Record<
  HolidayType,
  { bg: string; text: string; ring: string; border: string; dot: string }
> = {
  National: {
    bg: "bg-amber-100 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    ring: "ring-amber-500",
    border: "border-amber-300 dark:border-amber-700/60",
    dot: "bg-amber-500",
  },
  Religious: {
    bg: "bg-pink-100 dark:bg-pink-950/40",
    text: "text-pink-700 dark:text-pink-300",
    ring: "ring-pink-500",
    border: "border-pink-300 dark:border-pink-700/60",
    dot: "bg-pink-500",
  },
  School: {
    bg: "bg-sky-100 dark:bg-sky-950/40",
    text: "text-sky-800 dark:text-sky-300",
    ring: "ring-sky-500",
    border: "border-sky-300 dark:border-sky-700/60",
    dot: "bg-sky-500",
  },
  Vacation: {
    bg: "bg-emerald-100 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    ring: "ring-emerald-500",
    border: "border-emerald-300 dark:border-emerald-700/60",
    dot: "bg-emerald-500",
  },
};

const TYPE_ICONS: Record<HolidayType, typeof Sun> = {
  National: Star,
  Religious: Sparkles,
  School: BookOpen,
  Vacation: Palmtree,
};

const MONTH_NAMES = [
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

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ──────────────────────── CBSE Master Holidays (2026-27) ──────────────────────── */

const CBSE_HOLIDAYS_MASTER: HolidayEntry[] = [
  // April 2026
  {
    id: "cbse-01",
    name: "Good Friday",
    startDate: "2026-04-03",
    endDate: "2026-04-03",
    type: "Religious",
    description: "Christian holiday observing the crucifixion of Jesus Christ",
  },
  {
    id: "cbse-02",
    name: "Dr. B.R. Ambedkar Jayanti",
    startDate: "2026-04-14",
    endDate: "2026-04-14",
    type: "National",
    description: "National tribute commemorating Dr. Bhimrao Ramji Ambedkar",
  },
  {
    id: "cbse-03",
    name: "Ram Navami",
    startDate: "2026-04-15",
    endDate: "2026-04-15",
    type: "Religious",
    description: "Celebration of the birth of Lord Rama",
  },
  {
    id: "cbse-04",
    name: "Mahavir Jayanti",
    startDate: "2026-04-21",
    endDate: "2026-04-21",
    type: "Religious",
    description: "Birth anniversary of Lord Mahavira, 24th Jain Tirthankara",
  },

  // May & June 2026
  {
    id: "cbse-05",
    name: "Buddha Purnima",
    startDate: "2026-05-01",
    endDate: "2026-05-01",
    type: "Religious",
    description: "Commemoration of Gautama Buddha's birth and enlightenment",
  },
  {
    id: "cbse-06",
    name: "Summer Vacation",
    startDate: "2026-05-18",
    endDate: "2026-06-30",
    type: "Vacation",
    description: "Annual Summer Vacation (44 days) for students and faculty",
  },
  {
    id: "cbse-07",
    name: "International Yoga Day",
    startDate: "2026-06-21",
    endDate: "2026-06-21",
    type: "School",
    description: "Special morning Yoga assembly and wellness observance",
  },

  // July 2026
  {
    id: "cbse-08",
    name: "School Reopens",
    startDate: "2026-07-01",
    endDate: "2026-07-01",
    type: "School",
    description: "School resumes after summer vacation for all grades",
  },
  {
    id: "cbse-09",
    name: "Muharram (Ashura)",
    startDate: "2026-07-28",
    endDate: "2026-07-28",
    type: "Religious",
    description: "Islamic gazetted holiday honoring the martyrdom of Imam Hussain",
  },

  // August 2026
  {
    id: "cbse-10",
    name: "Independence Day",
    startDate: "2026-08-15",
    endDate: "2026-08-15",
    type: "National",
    description: "National flag hoisting, patriotic assembly, and cultural activities",
  },
  {
    id: "cbse-11",
    name: "Raksha Bandhan",
    startDate: "2026-08-28",
    endDate: "2026-08-28",
    type: "Religious",
    description: "Traditional festival celebrating sibling bonds",
  },

  // September 2026
  {
    id: "cbse-12",
    name: "Janmashtami",
    startDate: "2026-09-04",
    endDate: "2026-09-04",
    type: "Religious",
    description: "Celebration of the birth of Lord Krishna",
  },
  {
    id: "cbse-13",
    name: "Teachers' Day",
    startDate: "2026-09-05",
    endDate: "2026-09-05",
    type: "School",
    description: "School celebration honoring Dr. Radhakrishnan and our faculty",
  },
  {
    id: "cbse-14",
    name: "Milad-un-Nabi (Eid-e-Milad)",
    startDate: "2026-09-25",
    endDate: "2026-09-25",
    type: "Religious",
    description: "Birth anniversary of the Prophet Muhammad",
  },

  // October 2026
  {
    id: "cbse-15",
    name: "Mahatma Gandhi Jayanti",
    startDate: "2026-10-02",
    endDate: "2026-10-02",
    type: "National",
    description: "National holiday celebrating the Father of the Nation",
  },
  {
    id: "cbse-16",
    name: "Autumn / Dussehra Break",
    startDate: "2026-10-18",
    endDate: "2026-10-22",
    type: "Vacation",
    description: "Autumn Break including Maha Navami & Vijayadashami (5 days)",
  },
  {
    id: "cbse-17",
    name: "Karva Chauth",
    startDate: "2026-10-29",
    endDate: "2026-10-29",
    type: "Religious",
    description: "Restricted holiday / traditional fasting observance",
    isOptional: true,
  },

  // November 2026
  {
    id: "cbse-18",
    name: "Diwali & Chhath Break",
    startDate: "2026-11-06",
    endDate: "2026-11-10",
    type: "Vacation",
    description: "Festival of lights, Govardhan Puja, and Bhai Dooj break (5 days)",
  },
  {
    id: "cbse-19",
    name: "Children's Day (Bal Diwas)",
    startDate: "2026-11-14",
    endDate: "2026-11-14",
    type: "School",
    description: "School cultural fair and sports events honoring Pt. Jawaharlal Nehru",
  },
  {
    id: "cbse-20",
    name: "Guru Nanak Jayanti",
    startDate: "2026-11-24",
    endDate: "2026-11-24",
    type: "Religious",
    description: "Prakash Parv of Sri Guru Nanak Dev Ji",
  },

  // December 2026 & January 2027
  {
    id: "cbse-21",
    name: "Christmas Day",
    startDate: "2026-12-25",
    endDate: "2026-12-25",
    type: "Religious",
    description: "Christian festive holiday celebrating the birth of Jesus Christ",
  },
  {
    id: "cbse-22",
    name: "Winter Vacation",
    startDate: "2026-12-28",
    endDate: "2027-01-06",
    type: "Vacation",
    description: "Annual Winter Vacation (10 days) for cold wave respite",
  },
  {
    id: "cbse-23",
    name: "School Reopens after Winter Break",
    startDate: "2027-01-07",
    endDate: "2027-01-07",
    type: "School",
    description: "Resumption of regular classes after winter break",
  },
  {
    id: "cbse-24",
    name: "Makar Sankranti / Pongal",
    startDate: "2027-01-14",
    endDate: "2027-01-14",
    type: "Religious",
    description: "Harvest festival celebrated across India",
  },
  {
    id: "cbse-25",
    name: "Republic Day",
    startDate: "2027-01-26",
    endDate: "2027-01-26",
    type: "National",
    description: "National day celebration, flag hoisting, and parade viewing",
  },

  // February 2027
  {
    id: "cbse-26",
    name: "Basant Panchami / Saraswati Puja",
    startDate: "2027-02-11",
    endDate: "2027-02-11",
    type: "Religious",
    description: "Special morning assembly worshipping Goddess of Learning, Saraswati",
  },
  {
    id: "cbse-27",
    name: "National Science Day",
    startDate: "2027-02-28",
    endDate: "2027-02-28",
    type: "School",
    description: "Annual school science exhibition and project displays",
  },

  // March 2027
  {
    id: "cbse-28",
    name: "Maha Shivratri",
    startDate: "2027-03-06",
    endDate: "2027-03-06",
    type: "Religious",
    description: "Auspicious Hindu festival honoring Lord Shiva",
  },
  {
    id: "cbse-29",
    name: "Holi & Dhulandi",
    startDate: "2027-03-22",
    endDate: "2027-03-23",
    type: "Religious",
    description: "Festival of colors holiday (2 days)",
  },
  {
    id: "cbse-30",
    name: "Session Concludes & Annual Results",
    startDate: "2027-03-31",
    endDate: "2027-03-31",
    type: "School",
    description: "Formal conclusion of Academic Session 2026-27 and report card distribution",
  },
];

/* ──────────────────────── Date & Calculation Helpers ──────────────────────── */

function parseDate(str: string): Date {
  const parts = str.split("-");
  const y = parseInt(parts[0] ?? "2026", 10);
  const m = parseInt(parts[1] ?? "1", 10);
  const d = parseInt(parts[2] ?? "1", 10);
  return new Date(y, m - 1, d);
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateFriendly(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateRange(startStr: string, endStr: string): string {
  if (startStr === endStr) {
    const d = parseDate(startStr);
    return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }
  const s = parseDate(startStr);
  const e = parseDate(endStr);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.getDate()} ${MONTH_SHORT[s.getMonth()]} ${s.getFullYear()}`;
  }
  return `${s.getDate()} ${MONTH_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`;
}

function countDays(startStr: string, endStr: string): number {
  const s = parseDate(startStr).getTime();
  const e = parseDate(endStr).getTime();
  const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

/* ──────────────────────── Calendar Component ──────────────────────── */

interface DayInfo {
  holiday: HolidayEntry;
  isStart: boolean;
  isEnd: boolean;
  dayIndex: number;
  totalDays: number;
}

// Calendar colours follow the holiday's category — the same colours as the Holiday
// Categories cards (National amber, Religious pink, School sky, Vacation green).
function holidayTone(type: HolidayType) {
  const style = TYPE_STYLES[type];
  return { cell: `${style.bg} ${style.text}`, dot: style.dot };
}

function MonthCalendar({
  year,
  month,
  holidayMap,
  selectedDate,
  onSelectDate,
}: {
  year: number;
  month: number;
  holidayMap: Map<string, DayInfo>;
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="w-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            className={cn(
              "py-1 text-[11px] font-bold uppercase tracking-wider",
              d === "Su" ? "text-destructive font-black" : "text-muted-foreground",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayInfo = holidayMap.get(dateStr);
          const isHol = Boolean(dayInfo);
          const isTod = isCurrentMonth && day === todayDate;
          const isSun = new Date(year, month, day).getDay() === 0;
          const isSelected = selectedDate === dateStr;

          const holStyle = dayInfo ? holidayTone(dayInfo.holiday.type) : null;
          const col = i % 7;

          return (
            <div key={day} className="group relative">
              <button
                type="button"
                aria-label={
                  dayInfo
                    ? `${day}: ${dayInfo.holiday.name}`
                    : isSun
                      ? `${day}: Sunday`
                      : String(day)
                }
                onClick={() => onSelectDate(isSelected ? null : dateStr)}
                className={cn(
                  "relative aspect-square w-full flex flex-col items-center justify-center rounded-xl text-xs font-semibold transition-all duration-150 select-none active:scale-95",
                  !isHol && !isTod && "hover:bg-muted/70",
                  isSun && !isHol && "text-destructive/80 font-bold",
                  // Today styling
                  isTod &&
                    !isHol &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-background font-black text-primary bg-primary/10",
                  // Holiday styling
                  isHol && holStyle && `${holStyle.cell} font-bold`,
                  // Selection styling
                  isSelected && "ring-2 ring-foreground ring-offset-2 scale-105 shadow-md z-10",
                )}
              >
                <span className="leading-none">{day}</span>

                {/* Holiday indicator dot / multi-day badge */}
                {isHol && holStyle && (
                  <span
                    className={cn(
                      "absolute bottom-1 h-1.5 w-1.5 rounded-full transition-transform",
                      holStyle.dot,
                    )}
                  />
                )}
              </button>

              {/* Hover card with the day's details */}
              <div
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute bottom-full z-30 mb-2 hidden w-max max-w-[200px] rounded-xl bg-foreground px-3 py-2 text-left text-background shadow-lg group-hover:block",
                  col === 0 ? "left-0" : col === 6 ? "right-0" : "left-1/2 -translate-x-1/2",
                )}
              >
                <p className="text-[10px] font-medium opacity-70">
                  {new Date(year, month, day).toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                {dayInfo ? (
                  <>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", holStyle?.dot)} />
                      {dayInfo.holiday.name}
                    </p>
                    <p className="mt-0.5 text-[10px] opacity-80">
                      {dayInfo.holiday.type} holiday
                      {dayInfo.totalDays > 1
                        ? ` · day ${dayInfo.dayIndex} of ${dayInfo.totalDays}`
                        : ""}
                    </p>
                    {dayInfo.totalDays > 1 && (
                      <p className="text-[10px] opacity-70">
                        {formatDateRange(dayInfo.holiday.startDate, dayInfo.holiday.endDate)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-0.5 text-xs font-semibold">
                    {isSun ? "Sunday — no school" : isTod ? "Today · school day" : "School day"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────── Main Page Component ──────────────────────── */

export default function HolidaysPage() {
  const { data: apiHolidays, isLoading: holidaysLoading } = useHolidays();
  const { data: years } = useAcademicYears();
  const { days: workingDays } = useSchoolTimings();
  const { user } = useAuth();
  const isAdmin = user?.role === "SCHOOL_ADMIN";
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Only the school's own holidays — never sample data.
  const masterHolidays = useMemo<HolidayEntry[]>(
    () => groupHolidayRows((apiHolidays ?? []) as ApiHoliday[]),
    [apiHolidays],
  );

  // The academic session comes from the school's active academic year (April–March otherwise).
  const session = useMemo(() => {
    const active = (years ?? []).find((y) => y.status === "ACTIVE");
    const now = new Date();
    const fallbackStart = new Date(
      now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1,
      3,
      1,
    );
    const start = active?.start_date ? parseDate(active.start_date.slice(0, 10)) : fallbackStart;
    const end = active?.end_date
      ? parseDate(active.end_date.slice(0, 10))
      : new Date(start.getFullYear() + 1, start.getMonth(), 0);
    const name = active?.name ?? `${start.getFullYear()}-${start.getFullYear() + 1}`;
    const months: { year: number; month: number; label: string }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end && months.length < 24) {
      months.push({
        year: cur.getFullYear(),
        month: cur.getMonth(),
        label: MONTH_SHORT[cur.getMonth()]!,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return { start, end, name, months };
  }, [years]);
  const isWorkingWeekday = (d: Date) =>
    d.getDay() !== 0 && workingDays.includes(d.toLocaleDateString("en-US", { weekday: "long" }));

  async function invalidateHolidays() {
    await queryClient.invalidateQueries({ queryKey: ["holidays"] });
  }

  async function deleteHoliday(h: HolidayEntry) {
    const days = countDays(h.startDate, h.endDate);
    if (!confirm(`Delete "${h.name}"${days > 1 ? ` (${days} days)` : ""}?`)) return;
    try {
      await Promise.all((h.ids ?? [h.id]).map((id) => api.delete(`/holidays/${id}`)));
      await invalidateHolidays();
      toast.success(`${h.name} deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete holiday");
    }
  }

  /** Loads the standard CBSE list for the session dates (skips dates already added). */
  async function importStandardList() {
    setImporting(true);
    try {
      const taken = new Set((apiHolidays ?? []).map((h) => h.date.slice(0, 10)));
      const rows: { name: string; date: string; day: string; type: string; session: string }[] = [];
      for (const h of CBSE_HOLIDAYS_MASTER) {
        const cur = parseDate(h.startDate);
        const last = parseDate(h.endDate);
        while (cur <= last) {
          const iso = formatDateISO(cur);
          if (cur >= session.start && cur <= session.end && !taken.has(iso)) {
            rows.push({
              name: h.name,
              date: iso,
              day: cur.toLocaleDateString("en-US", { weekday: "long" }),
              type: h.type,
              session: session.name,
            });
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
      if (!rows.length) {
        toast.info("Nothing to add — these dates are outside the session or already added");
        return;
      }
      for (let i = 0; i < rows.length; i += 10) {
        await Promise.all(rows.slice(i, i + 10).map((r) => api.post("/holidays", r)));
      }
      await invalidateHolidays();
      toast.success(`${rows.length} holiday dates added`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add holidays");
    } finally {
      setImporting(false);
    }
  }

  // Expand multi-day holidays so every single date is mapped
  const expandedHolidayMap = useMemo(() => {
    const map = new Map<string, DayInfo>();
    for (const h of masterHolidays) {
      const start = parseDate(h.startDate);
      const end = parseDate(h.endDate);
      const total = countDays(h.startDate, h.endDate);

      const cur = new Date(start);
      let dayIndex = 1;
      while (cur <= end) {
        const iso = formatDateISO(cur);
        map.set(iso, {
          holiday: h,
          isStart: dayIndex === 1,
          isEnd: dayIndex === total,
          dayIndex,
          totalDays: total,
        });
        cur.setDate(cur.getDate() + 1);
        dayIndex++;
      }
    }
    return map;
  }, [masterHolidays]);

  const today = new Date();
  const todayStr = formatDateISO(today);

  // Calendar Year & Month state
  const [calYear, setCalYear] = useState(
    today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1,
  );
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<HolidayType | "All">("All");

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

  function selectMonthTab(y: number, m: number) {
    setCalYear(y);
    setCalMonth(m);
    setSelectedDate(null);
  }

  /* ──────────────────────── CBSE Calculations ──────────────────────── */

  // 1. Session-wide calculation (Apr 1, 2026 to Mar 31, 2027)
  const sessionStats = useMemo(() => {
    const start = new Date(session.start);
    const end = new Date(session.end);
    let totalDays = 0;
    let sundays = 0;
    let holidayDates = 0;
    let vacationDays = 0;
    let nationalDays = 0;

    const cur = new Date(start);
    while (cur <= end) {
      totalDays++;
      const isSun = !isWorkingWeekday(cur);
      if (isSun) sundays++;

      const iso = formatDateISO(cur);
      const info = expandedHolidayMap.get(iso);
      if (info) {
        if (!isSun) holidayDates++; // only count non-Sunday holidays as deduction
        if (info.holiday.type === "Vacation") vacationDays++;
        if (info.holiday.type === "National") nationalDays++;
      }
      cur.setDate(cur.getDate() + 1);
    }

    const workingDays = totalDays - sundays - holidayDates;
    return {
      totalDays,
      sundays,
      holidayDates,
      vacationDays,
      nationalDays,
      workingDays,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedHolidayMap, session, workingDays]);

  // 2. Active Month Calculation
  const monthStats = useMemo(() => {
    const daysInCurrentMonth = new Date(calYear, calMonth + 1, 0).getDate();
    let sundays = 0;
    let holidays = 0;

    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dt = new Date(calYear, calMonth, d);
      const isSun = !isWorkingWeekday(dt);
      if (isSun) sundays++;

      const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const info = expandedHolidayMap.get(iso);
      if (info && !isSun) {
        holidays++;
      }
    }

    const workingDays = daysInCurrentMonth - sundays - holidays;
    return {
      daysInMonth: daysInCurrentMonth,
      sundays,
      holidays,
      workingDays,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calYear, calMonth, expandedHolidayMap, workingDays]);

  // Distinct holidays occurring in the selected calendar month
  const monthHolidays = useMemo(() => {
    const startIso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`;
    const daysCount = new Date(calYear, calMonth + 1, 0).getDate();
    const endIso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(daysCount).padStart(2, "0")}`;

    return masterHolidays.filter((h) => {
      return h.startDate <= endIso && h.endDate >= startIso;
    });
  }, [masterHolidays, calYear, calMonth]);

  // Selected date info
  const selectedDayInfo = useMemo(() => {
    if (!selectedDate) return null;
    return expandedHolidayMap.get(selectedDate) ?? null;
  }, [selectedDate, expandedHolidayMap]);

  // Filtered Holiday Table / Card list
  const filteredList = useMemo(() => {
    const list = [...masterHolidays].sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (listFilter === "All") return list;
    return list.filter((h) => h.type === listFilter);
  }, [masterHolidays, listFilter]);

  // Counts by category
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      National: 0,
      Religious: 0,
      School: 0,
      Vacation: 0,
    };
    for (const h of masterHolidays) {
      counts[h.type] = (counts[h.type] ?? 0) + 1;
    }
    return counts;
  }, [masterHolidays]);

  return (
    <div className="w-full pb-8">
      {/* ── Page Header ── */}
      <PageHeader
        title="Holiday Calendar"
        description={`Academic session ${session.name} · holidays, breaks and working days`}
        breadcrumb={["Dashboard", "Holidays"]}
        actions={
          isAdmin ? (
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Holiday
            </Button>
          ) : undefined
        }
      />

      {!holidaysLoading && masterHolidays.length === 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarHeart className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">No holidays added yet</p>
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? "Add your school's holidays one by one, or start from the standard CBSE list and edit it."
                  : "Your school hasn't published its holiday list yet."}
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              disabled={importing}
              onClick={importStandardList}
            >
              <Download className="h-4 w-4" />
              {importing ? "Adding…" : "Add standard CBSE holidays"}
            </Button>
          )}
        </div>
      )}

      {/* ── Academic Session Calculation Dashboard ── */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <InfoCard label="School Days" value={sessionStats.workingDays} icon={School} tone="navy" />
        <InfoCard
          label="Holidays"
          value={sessionStats.holidayDates}
          icon={CalendarHeart}
          tone="gold"
        />
        <InfoCard
          label="Sundays & Off Days"
          value={sessionStats.sundays}
          icon={CalendarX2}
          tone="danger"
        />
        <InfoCard
          label="Vacation Days"
          value={sessionStats.vacationDays}
          icon={Palmtree}
          tone="success"
        />
      </div>

      {/* ── Academic Year Month Quick Jump Bar ── */}
      <div className="mb-4 panel overflow-hidden p-2 sm:p-2.5">
        <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar py-0.5">
          {session.months.map(({ year, month, label }) => {
            const isActive = calYear === year && calMonth === month;
            return (
              <button
                key={`${year}-${month}`}
                type="button"
                onClick={() => selectMonthTab(year, month)}
                className={cn(
                  "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label}
                {year !== session.start.getFullYear() ? ` '${String(year).slice(-2)}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Grid: Calendar Panel + Month Stats & Upcoming ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left Column: Interactive Calendar (2 cols on desktop) */}
        <div className="lg:col-span-2">
          <div className="panel overflow-hidden">
            {/* Calendar Navigation Header */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5 sm:px-5 sm:py-3">
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 sm:h-8 sm:w-8 shrink-0"
                  onClick={prevMonth}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-center font-display text-sm font-bold sm:text-base px-1">
                  {MONTH_NAMES[calMonth]} {calYear}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 sm:h-8 sm:w-8 shrink-0"
                  onClick={nextMonth}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Today Quick Button */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs font-semibold shrink-0 sm:h-8 sm:px-3"
                onClick={goToToday}
              >
                <Clock className="mr-1 h-3.5 w-3.5" />
                <span>Today</span>
              </Button>
            </div>

            {/* Monthly Calculation Bar (Dynamic for the visible month) */}
            <div className="grid grid-cols-4 divide-x divide-border border-b border-border bg-muted/20 text-center text-[11px] font-semibold py-2">
              <div>
                <p className="text-muted-foreground text-[10px]">Total Days</p>
                <p className="font-bold text-foreground text-xs sm:text-sm">
                  {monthStats.daysInMonth}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px]">Working Days</p>
                <p className="font-bold text-primary text-xs sm:text-sm">
                  {monthStats.workingDays}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px]">Holidays</p>
                <p className="font-bold text-amber-600 dark:text-amber-400 text-xs sm:text-sm">
                  {monthStats.holidays}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px]">Sundays</p>
                <p className="font-bold text-destructive text-xs sm:text-sm">
                  {monthStats.sundays}
                </p>
              </div>
            </div>

            {/* Interactive Month Grid */}
            <div className="p-3 sm:p-5">
              <MonthCalendar
                year={calYear}
                month={calMonth}
                holidayMap={expandedHolidayMap}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </div>

            {/* Legend: Mobile Wrap & Responsive */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5 sm:px-5 sm:py-3 bg-muted/10">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {(
                  Object.entries(TYPE_STYLES) as [HolidayType, (typeof TYPE_STYLES)[HolidayType]][]
                ).map(([type, style]) => {
                  const Icon = TYPE_ICONS[type];
                  return (
                    <div key={type} className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          "grid h-5 w-5 place-items-center rounded-md border text-[10px]",
                          style.bg,
                          style.text,
                          style.border,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                      </span>
                      <span className="font-medium text-muted-foreground">{type}</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="grid h-5 w-5 place-items-center rounded-md text-destructive bg-destructive/10 text-[10px] font-bold">
                    Su
                  </span>
                  <span className="font-medium text-muted-foreground">Weekly off</span>
                </div>
              </div>
            </div>

            {/* Selected Date Detail Banner */}
            {selectedDate && (
              <div className="border-t border-border bg-muted/30 px-3 py-3 sm:px-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Selected: {formatDateFriendly(selectedDate)}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => setSelectedDate(null)}
                  >
                    Clear
                  </Button>
                </div>

                {selectedDayInfo ? (
                  <div
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3",
                      TYPE_STYLES[selectedDayInfo.holiday.type].bg,
                      TYPE_STYLES[selectedDayInfo.holiday.type].border,
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-lg shadow-xs",
                        TYPE_STYLES[selectedDayInfo.holiday.type].text,
                        "bg-white/70 dark:bg-black/40",
                      )}
                    >
                      {(() => {
                        const Icon = TYPE_ICONS[selectedDayInfo.holiday.type];
                        return <Icon className="h-5 w-5" />;
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className={cn(
                            "font-display text-sm font-bold sm:text-base",
                            TYPE_STYLES[selectedDayInfo.holiday.type].text,
                          )}
                        >
                          {selectedDayInfo.holiday.name}
                        </h4>
                        <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-bold">
                          {selectedDayInfo.holiday.type}
                        </span>
                        {selectedDayInfo.totalDays > 1 && (
                          <span className="rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[10px] font-bold">
                            Day {selectedDayInfo.dayIndex} of {selectedDayInfo.totalDays}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Duration:{" "}
                        {formatDateRange(
                          selectedDayInfo.holiday.startDate,
                          selectedDayInfo.holiday.endDate,
                        )}{" "}
                        ({selectedDayInfo.totalDays}{" "}
                        {selectedDayInfo.totalDays === 1 ? "day" : "days"})
                      </p>
                      {selectedDayInfo.holiday.description && (
                        <p className="mt-1 text-xs text-foreground/80">
                          {selectedDayInfo.holiday.description}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>
                      {isWorkingWeekday(parseDate(selectedDate))
                        ? "A normal school working day."
                        : "Weekly off — no school."}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Holidays in this Month List */}
            {monthHolidays.length > 0 && !selectedDate && (
              <div className="border-t border-border px-3 py-3 sm:px-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {monthHolidays.length} Holiday Events in {MONTH_NAMES[calMonth]} {calYear}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {monthHolidays.map((h) => {
                    const style = TYPE_STYLES[h.type];
                    const tone = holidayTone(h.type);
                    const Icon = TYPE_ICONS[h.type];
                    const days = countDays(h.startDate, h.endDate);
                    return (
                      <div
                        key={h.id}
                        onClick={() => setSelectedDate(h.startDate)}
                        className="cursor-pointer flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 transition-all hover:bg-muted/50 hover:shadow-xs active:scale-[0.99]"
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                            tone.cell,
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">{h.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDateRange(h.startDate, h.endDate)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[10px] font-bold shrink-0",
                            style.bg,
                            style.text,
                          )}
                        >
                          {days > 1 ? `${days}d` : h.type}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Upcoming Holidays + Breakdown */}
        <div className="space-y-4">
          {/* Upcoming Holidays */}
          <SectionCard title="Upcoming Holidays" subtitle="Next scheduled breaks & gazetted days">
            {(() => {
              const upcoming = masterHolidays
                .filter((h) => h.endDate >= todayStr)
                .sort((a, b) => a.startDate.localeCompare(b.startDate));

              if (upcoming.length === 0) {
                return (
                  <EmptyState
                    title="Session Completed"
                    description={`No more holidays left in session ${session.name}.`}
                    icon={CalendarHeart}
                  />
                );
              }

              return (
                <div className="space-y-2">
                  {upcoming.slice(0, 6).map((h) => {
                    const style = TYPE_STYLES[h.type];
                    const Icon = TYPE_ICONS[h.type];
                    const isTodayActive = h.startDate <= todayStr && h.endDate >= todayStr;
                    const days = countDays(h.startDate, h.endDate);
                    const startObj = parseDate(h.startDate);

                    return (
                      <div
                        key={h.id}
                        onClick={() => {
                          setCalYear(startObj.getFullYear());
                          setCalMonth(startObj.getMonth());
                          setSelectedDate(h.startDate);
                        }}
                        className={cn(
                          "cursor-pointer flex items-center gap-3 rounded-xl border border-border p-2.5 transition-all hover:bg-muted/40",
                          isTodayActive && "ring-2 ring-primary/40 bg-primary/5",
                        )}
                      >
                        {/* Date badge */}
                        <div
                          className={cn(
                            "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border font-mono",
                            style.bg,
                            style.border,
                          )}
                        >
                          <span
                            className={cn(
                              "text-[9px] font-bold uppercase leading-none",
                              style.text,
                            )}
                          >
                            {MONTH_SHORT[startObj.getMonth()]}
                          </span>
                          <span className={cn("text-sm font-extrabold leading-tight", style.text)}>
                            {startObj.getDate()}
                          </span>
                        </div>

                        {/* Title and duration */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold sm:text-sm">{h.name}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <span>{formatDateRange(h.startDate, h.endDate)}</span>
                            {days > 1 && (
                              <span className="rounded-full bg-muted px-1.5 py-0.2 text-[9px] font-semibold">
                                {days} days
                              </span>
                            )}
                            {isTodayActive && (
                              <span className="rounded-full bg-primary px-1.5 py-0.2 text-[9px] font-bold text-primary-foreground">
                                TODAY
                              </span>
                            )}
                          </p>
                        </div>

                        <Icon className={cn("h-4 w-4 shrink-0", style.text)} />
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </SectionCard>

          {/* Category Summary Cards */}
          <SectionCard title="Holiday Categories" subtitle="Academic Distribution">
            <div className="grid grid-cols-2 gap-2">
              {(["National", "Religious", "School", "Vacation"] as HolidayType[]).map((type) => {
                const style = TYPE_STYLES[type];
                const Icon = TYPE_ICONS[type];
                const count = typeCounts[type] ?? 0;
                return (
                  <div
                    key={type}
                    onClick={() => setListFilter(type)}
                    className={cn(
                      "cursor-pointer flex items-center gap-2.5 rounded-xl border p-2.5 transition-all hover:shadow-xs active:scale-[0.98]",
                      style.bg,
                      style.border,
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-lg shadow-xs",
                        style.text,
                        "bg-white/80 dark:bg-black/40",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className={cn("text-base font-extrabold leading-tight", style.text)}>
                        {count}
                      </p>
                      <p className="text-[10px] font-medium text-muted-foreground truncate">
                        {type}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Complete CBSE Holiday Table & Filterable Master List ── */}
      <div className="mt-4 panel overflow-hidden">
        {/* Filter header */}
        <div className="flex flex-col gap-2.5 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div>
            <h3 className="font-display text-sm font-bold sm:text-base">All Holidays & Breaks</h3>
            <p className="text-[11px] text-muted-foreground">
              Session {session.name} · {filteredList.length} holiday
              {filteredList.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {(["All", "National", "Religious", "School", "Vacation"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setListFilter(type)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  listFilter === type
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {type} {type !== "All" && `(${typeCounts[type] ?? 0})`}
              </button>
            ))}
          </div>
        </div>

        {filteredList.length === 0 ? (
          <EmptyState title="No holidays in this category" icon={CalendarHeart} />
        ) : (
          <>
            {/* Mobile View: Clean Touch Cards */}
            <div className="divide-y divide-border md:hidden">
              {filteredList.map((h) => {
                const style = TYPE_STYLES[h.type];
                const Icon = TYPE_ICONS[h.type];
                const days = countDays(h.startDate, h.endDate);
                const isPast = h.endDate < todayStr;
                const isCurrent = h.startDate <= todayStr && h.endDate >= todayStr;
                const startObj = parseDate(h.startDate);

                return (
                  <div
                    key={h.id}
                    onClick={() => {
                      setCalYear(startObj.getFullYear());
                      setCalMonth(startObj.getMonth());
                      setSelectedDate(h.startDate);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={cn(
                      "flex items-center gap-3 p-3 transition-colors active:bg-muted/50",
                      isPast && "opacity-60",
                      isCurrent && "bg-primary/5",
                    )}
                  >
                    {/* Date Badge */}
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border font-mono",
                        style.bg,
                        style.border,
                      )}
                    >
                      <span
                        className={cn("text-[9px] font-bold uppercase leading-none", style.text)}
                      >
                        {MONTH_SHORT[startObj.getMonth()]}
                      </span>
                      <span className={cn("text-sm font-extrabold leading-tight", style.text)}>
                        {startObj.getDate()}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{h.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDateRange(h.startDate, h.endDate)}
                      </p>
                      {h.description && (
                        <p className="truncate text-[10px] text-muted-foreground/80">
                          {h.description}
                        </p>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={cn(
                          "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                          style.bg,
                          style.text,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {days > 1 ? `${days}d` : h.type}
                      </span>
                      {isCurrent ? (
                        <span className="rounded-full bg-primary px-1.5 py-0.2 text-[9px] font-bold text-primary-foreground">
                          Today
                        </span>
                      ) : isPast ? (
                        <span className="text-[10px] text-muted-foreground">Passed</span>
                      ) : (
                        <span className="text-[10px] text-primary font-medium">Upcoming</span>
                      )}
                    </div>
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-destructive"
                        aria-label={`Delete ${h.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteHoliday(h);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop View: Full Data Table */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Holiday / Event Name</TableHead>
                    <TableHead>Date Schedule</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    {isAdmin && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredList.map((h, idx) => {
                    const style = TYPE_STYLES[h.type];
                    const Icon = TYPE_ICONS[h.type];
                    const days = countDays(h.startDate, h.endDate);
                    const isPast = h.endDate < todayStr;
                    const isCurrent = h.startDate <= todayStr && h.endDate >= todayStr;
                    const startObj = parseDate(h.startDate);

                    return (
                      <TableRow
                        key={h.id}
                        onClick={() => {
                          setCalYear(startObj.getFullYear());
                          setCalMonth(startObj.getMonth());
                          setSelectedDate(h.startDate);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isPast && "opacity-60",
                          isCurrent && "bg-primary/5 font-semibold",
                        )}
                      >
                        <TableCell className="text-muted-foreground tabular-nums text-xs">
                          {idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={cn(
                                "grid h-7 w-7 shrink-0 place-items-center rounded-lg border",
                                style.bg,
                                style.text,
                                style.border,
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <div>
                              <p className="font-semibold text-xs text-foreground">{h.name}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-xs font-medium">
                          {formatDateRange(h.startDate, h.endDate)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[11px] font-bold",
                              days > 1
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {days} {days === 1 ? "day" : "days"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={h.type} />
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                          {h.description ?? `${h.type} holiday`}
                        </TableCell>
                        <TableCell className="text-right">
                          {isCurrent ? (
                            <StatusBadge status="Today" />
                          ) : isPast ? (
                            <span className="text-xs text-muted-foreground">Passed</span>
                          ) : (
                            <StatusBadge status="Upcoming" />
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              title="Delete holiday"
                              aria-label={`Delete ${h.name}`}
                              onClick={() => deleteHoliday(h)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        {addOpen && (
          <AddHolidayDialog
            sessionName={session.name}
            onDone={async () => {
              await invalidateHolidays();
              setAddOpen(false);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

/** Add a holiday — one day, or a range like a vacation (saved as one row per day). */
function AddHolidayDialog({ sessionName, onDone }: { sessionName: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<HolidayType>("School");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !from) {
      toast.error("Enter a name and a date");
      return;
    }
    const end = to || from;
    if (end < from) {
      toast.error("The end date is before the start date");
      return;
    }
    if (countDays(from, end) > 90) {
      toast.error("A holiday can be at most 90 days long");
      return;
    }
    setSaving(true);
    try {
      const cur = parseDate(from);
      const last = parseDate(end);
      const rows = [];
      while (cur <= last) {
        rows.push({
          name: name.trim(),
          date: formatDateISO(cur),
          day: cur.toLocaleDateString("en-US", { weekday: "long" }),
          type,
          session: sessionName,
        });
        cur.setDate(cur.getDate() + 1);
      }
      for (let i = 0; i < rows.length; i += 10) {
        await Promise.all(rows.slice(i, i + 10).map((r) => api.post("/holidays", r)));
      }
      toast.success(`${name.trim()} added`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add holiday");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Add Holiday</DialogTitle>
        <DialogDescription>
          For a break like summer vacation, pick a start and an end date.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="holiday-name">Holiday name</Label>
          <Input
            id="holiday-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Diwali, Summer Vacation"
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as HolidayType)}>
            <SelectTrigger className="bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOLIDAY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="holiday-from">From</Label>
            <Input
              id="holiday-from"
              type="date"
              className="w-full min-w-0"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="holiday-to">To (optional)</Label>
            <Input
              id="holiday-to"
              type="date"
              className="w-full min-w-0"
              min={from || undefined}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {from && (
          <p className="text-xs text-muted-foreground">
            {countDays(from, to || from)} day{countDays(from, to || from) === 1 ? "" : "s"} ·{" "}
            {formatDateRange(from, to || from)}
          </p>
        )}
        <DialogFooter>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Add Holiday"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
