"use client";

import { useMemo, type ReactNode } from "react";
import { Clock, Coffee, CalendarHeart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSchoolTimings } from "@/lib/school-timings";
import { useHolidays } from "@/hooks/useApi";

// Curated distinct colors for common school subjects to guarantee high visual contrast
export const SUBJECT_PRESETS: Record<string, string> = {
  // Mathematics (Indigo)
  mathematics:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40",
  math: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40",
  maths:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40",
  algebra:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40",
  geometry:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40",

  // English & Literature (Sky Blue)
  english:
    "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/40",
  literature:
    "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/40",

  // Hindi & Languages (Warm Pink / Rose)
  hindi:
    "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/40",
  sanskrit:
    "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/40",
  french:
    "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/40",
  german:
    "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/40",
  spanish:
    "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/40",
  language:
    "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/40",

  // Technology / Computers (Teal / Cyan)
  tech: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/40",
  computer:
    "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/40",
  it: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/40",
  information:
    "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/40",
  coding:
    "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/40",
  ai: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/40",

  // Science & Nature (Emerald Green)
  science:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40",
  physics:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40",
  chemistry:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40",
  biology:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40",
  evs: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40",

  // Social Studies (Amber Gold)
  social:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",
  sst: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",
  history:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",
  geography:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",
  civics:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",

  // Arts & Music (Violet)
  art: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40",
  drawing:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40",
  craft:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40",
  music:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40",
  dance:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40",

  // Physical Education & Sports (Orange)
  pe: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/40",
  sports:
    "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/40",
  games:
    "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/40",
  yoga: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/40",

  // General Knowledge & Library (Fuchsia)
  gk: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 border border-fuchsia-200/60 dark:border-fuchsia-800/40",
  library:
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 border border-fuchsia-200/60 dark:border-fuchsia-800/40",
  moral:
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 border border-fuchsia-200/60 dark:border-fuchsia-800/40",
};

// 12 distinct harmonious tones for any other subject name
export const DIVERSE_PALETTE = [
  "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/40",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40",
  "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/40",
  "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/40",
  "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40",
  "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40",
  "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/40",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200/60 dark:border-cyan-800/40",
  "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 border border-fuchsia-200/60 dark:border-fuchsia-800/40",
  "bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-300 border border-lime-200/60 dark:border-lime-800/40",
];

export function toneFor(subject: string | null | undefined): string {
  if (!subject) return "bg-muted text-muted-foreground border border-border";
  if (subject === "Break" || subject === "Free period")
    return "bg-muted text-muted-foreground border border-border";

  const lower = subject.toLowerCase().trim();

  // Check exact or partial match in curated presets
  for (const [key, className] of Object.entries(SUBJECT_PRESETS)) {
    if (lower === key || lower.includes(key)) {
      return className;
    }
  }

  // Fallback to high-entropy DJB2 hash among 12 diverse colors
  let hash = 5381;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash << 5) + hash + lower.charCodeAt(i);
  }
  const idx = Math.abs(hash) % DIVERSE_PALETTE.length;
  return DIVERSE_PALETTE[idx]!;
}

export const WEEK_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function weekLabel(offset: number, dayCount = 6) {
  // Monday of the current week, moved by `offset` weeks.
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + offset * 7);
  const end = new Date(base);
  end.setDate(base.getDate() + (dayCount - 1));
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const prefix = offset === 0 ? "This week · " : "";
  return `${prefix}${fmt(base)} – ${fmt(end)} ${end.getFullYear()}`;
}

/**
 * Dates and holidays for one week (0 = this week). `on("Monday")` gives that day's date and,
 * if the school has a holiday then, the holiday.
 */
export function useWeekHolidays(offset = 0) {
  const { data: holidays } = useHolidays();
  return useMemo(() => {
    const today = new Date();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
    const byDate = new Map((holidays ?? []).map((h) => [h.date.slice(0, 10), h]));
    return (dayName: string) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + Math.max(0, WEEK_ORDER.indexOf(dayName)));
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { date: d, holiday: byDate.get(iso) ?? null };
    };
  }, [holidays, offset]);
}

/** Shown instead of a day's periods when the school is closed for a holiday. */
export function HolidayDay({ name, date }: { name: string; date: Date }) {
  return (
    <div className="col-span-full flex flex-col items-center rounded-2xl border border-pink-300/50 bg-pink-50 px-4 py-8 text-center dark:bg-pink-950/30">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-pink-500/15 text-pink-600">
        <CalendarHeart className="h-5 w-5" />
      </span>
      <p className="mt-3 font-display text-base font-bold">Holiday — {name}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        No classes on{" "}
        {date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}.
      </p>
    </div>
  );
}

export function todayName(days: string[]) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  return days.includes(today) ? today : (days[0] ?? "Monday");
}

export function MetaItem({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 text-[11px] text-foreground/85 sm:text-xs">
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground sm:h-3.5 sm:w-3.5" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** One period in the schedule — a badge with the period number, subject and details. */
export function PeriodCard({
  period,
  subject,
  live,
  customTime,
  children,
}: {
  period: number;
  subject: string | null;
  live?: boolean;
  customTime?: string;
  children?: ReactNode;
}) {
  const { periods } = useSchoolTimings();
  const time = customTime ?? periods[period - 1]?.time ?? `Period ${period}`;

  if (subject === "Break") {
    return (
      <div className="col-span-full flex items-center gap-3 px-1 py-1 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1.5 font-medium">
          <Coffee className="h-3.5 w-3.5 text-muted-foreground" /> Break · {time}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-stretch gap-3 rounded-2xl border bg-card p-3 shadow-xs transition-all hover:shadow-md sm:p-3.5",
        live ? "border-primary/60 ring-2 ring-primary/15" : "border-border",
        !subject && "border-dashed bg-transparent shadow-none",
      )}
    >
      <div
        className={cn(
          "flex w-12 shrink-0 flex-col items-center justify-center rounded-xl py-2 sm:w-14",
          subject ? toneFor(subject) : "bg-muted text-muted-foreground",
        )}
      >
        <span className="text-[9px] font-semibold uppercase tracking-wider opacity-75">Per</span>
        <span className="font-display text-lg font-bold leading-tight">{period}</span>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              !subject && "font-medium text-muted-foreground",
            )}
          >
            {subject ?? "Free period"}
          </p>
          {live && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Now
            </span>
          )}
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" /> {time}
        </p>
        {subject && children && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/80">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
