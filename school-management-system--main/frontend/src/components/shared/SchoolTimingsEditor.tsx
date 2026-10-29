import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TIMINGS,
  fromMinutes,
  periodLabel,
  timingProblems,
  toMinutes,
  useSchoolTimings,
  WEEK_DAYS,
  type PeriodTime,
  type SchoolTimings,
} from "@/lib/school-timings";

/**
 * Edit the school day: working days and each period's start / end time. Used in School
 * Settings and from the Timetable page. Saving updates every class's timetable.
 */
export function SchoolTimingsEditor({ onSaved }: { onSaved?: () => void }) {
  const saved = useSchoolTimings();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SchoolTimings>(saved.raw);
  const [busy, setBusy] = useState(false);

  // Quick setup
  const [firstStart, setFirstStart] = useState(saved.raw.periods[0]?.start ?? "08:00");
  const [length, setLength] = useState("45");
  const [gap, setGap] = useState("5");
  const [count, setCount] = useState(String(saved.raw.periods.length || 7));
  const [lunchAfter, setLunchAfter] = useState("4");
  const [lunchLength, setLunchLength] = useState("30");

  // Pick up the saved timings once they've loaded.
  const savedKey = JSON.stringify(saved.raw);
  useEffect(() => {
    setDraft(saved.raw);
    setCount(String(saved.raw.periods.length));
    setFirstStart(saved.raw.periods[0]?.start ?? "08:00");
  }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = timingProblems(draft);
  const changed = JSON.stringify(draft) !== savedKey;

  const setPeriod = (i: number, patch: Partial<PeriodTime>) =>
    setDraft((d) => ({
      ...d,
      periods: d.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    }));

  const addPeriod = () =>
    setDraft((d) => {
      const last = d.periods.at(-1);
      const start = last ? toMinutes(last.end) + 5 : toMinutes("08:00");
      return {
        ...d,
        periods: [...d.periods, { start: fromMinutes(start), end: fromMinutes(start + 45) }],
      };
    });

  const toggleDay = (day: string) =>
    setDraft((d) => ({
      ...d,
      days: WEEK_DAYS.filter((w) => (w === day ? !d.days.includes(day) : d.days.includes(w))),
    }));

  function generate() {
    const n = Math.min(12, Math.max(1, Number(count) || 0));
    const len = Math.max(5, Number(length) || 0);
    const between = Math.max(0, Number(gap) || 0);
    const lunchAt = Number(lunchAfter) || 0;
    const lunch = Math.max(0, Number(lunchLength) || 0);
    let t = toMinutes(firstStart || "08:00");
    const periods: PeriodTime[] = [];
    for (let i = 1; i <= n; i++) {
      periods.push({ start: fromMinutes(t), end: fromMinutes(t + len) });
      t += len + (i === lunchAt ? lunch : between);
    }
    setDraft((d) => ({ ...d, periods }));
    toast.success(`${n} periods filled in — review and save`);
  }

  async function save() {
    if (problems.length) {
      toast.error(problems[0]!);
      return;
    }
    setBusy(true);
    try {
      await api.patch("/school-profile", { timings: draft });
      await queryClient.invalidateQueries({ queryKey: ["school-profile"] });
      toast.success("School timings saved — every class timetable now uses them");
      onSaved?.();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save timings";
      toast.error(
        /timings/i.test(message) && /column|schema/i.test(message)
          ? "The database isn't ready for school timings yet — run migration 62_school_timings.sql in Supabase."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Working days */}
      <section className="space-y-2">
        <Label>Working days</Label>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_DAYS.map((day) => {
            const on = draft.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={on}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40",
                )}
              >
                {day.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Quick setup */}
      <section className="space-y-2 rounded-2xl border border-dashed border-border p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Wand2 className="h-4 w-4 text-primary" /> Quick setup
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">School starts</Label>
            <Input type="time" value={firstStart} onChange={(e) => setFirstStart(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Periods</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Period length (min)</Label>
            <Input
              type="number"
              min={5}
              value={length}
              onChange={(e) => setLength(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Gap between (min)</Label>
            <Input type="number" min={0} value={gap} onChange={(e) => setGap(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Lunch after period</Label>
            <Input
              type="number"
              min={0}
              value={lunchAfter}
              onChange={(e) => setLunchAfter(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Lunch length (min)</Label>
            <Input
              type="number"
              min={0}
              value={lunchLength}
              onChange={(e) => setLunchLength(e.target.value)}
            />
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={generate}>
          <Wand2 className="h-3.5 w-3.5" /> Fill in periods
        </Button>
      </section>

      {/* Periods */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Periods ({draft.periods.length})</Label>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={addPeriod}>
            <Plus className="h-3.5 w-3.5" /> Add period
          </Button>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {draft.periods.map((p, i) => {
            const prev = draft.periods[i - 1];
            const breakBefore = prev ? toMinutes(p.start) - toMinutes(prev.end) : 0;
            const minutes = toMinutes(p.end) - toMinutes(p.start);
            return (
              <li key={i}>
                {breakBefore >= 15 && (
                  <p className="bg-muted/40 px-3 py-1 text-center text-[11px] font-medium text-muted-foreground">
                    ☕ Break · {breakBefore} min
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <Input
                    type="time"
                    aria-label={`Period ${i + 1} start`}
                    value={p.start}
                    onChange={(e) => setPeriod(i, { start: e.target.value })}
                    className="h-9 w-[7.5rem]"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="time"
                    aria-label={`Period ${i + 1} end`}
                    value={p.end}
                    onChange={(e) => setPeriod(i, { end: e.target.value })}
                    className="h-9 w-[7.5rem]"
                  />
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {minutes > 0 ? `${minutes} min` : "—"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title={`Remove period ${i + 1}`}
                    aria-label={`Remove period ${i + 1}`}
                    disabled={draft.periods.length <= 1}
                    onClick={() =>
                      setDraft((d) => ({ ...d, periods: d.periods.filter((_, j) => j !== i) }))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {draft.periods.length < saved.raw.periods.length && (
          <p className="text-[11px] text-warning">
            Periods {draft.periods.length + 1}–{saved.raw.periods.length} will be hidden from
            timetables; anything already assigned to them stays saved.
          </p>
        )}
        {problems.length > 0 && (
          <ul className="space-y-0.5 text-[11px] font-medium text-destructive">
            {problems.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          School day:{" "}
          {draft.periods.length
            ? periodLabel({ start: draft.periods[0]!.start, end: draft.periods.at(-1)!.end })
            : "—"}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={() => setDraft(DEFAULT_TIMINGS)}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Defaults
          </Button>
          <Button type="button" disabled={busy || !changed} onClick={save}>
            {busy ? "Saving…" : "Save Timings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
