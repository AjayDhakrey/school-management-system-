import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Family Function", "Emergency", "Other"];
const REASON_MAX = 500;

const todayIso = () => new Date().toISOString().slice(0, 10);

/** "2026-10-28" → local Date (avoids the UTC shift of `new Date("2026-10-28")`). */
function parseDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/**
 * A tappable date tile. The native date input sits invisibly on top, so phones still get their
 * own date picker — but the tile shows a readable date instead of the browser's "dd-mm-yyyy".
 */
function DateTile({
  id,
  label,
  value,
  min,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min: string;
  onChange: (value: string) => void;
}) {
  const date = value ? parseDate(value) : null;
  return (
    <div className="relative min-w-0">
      <div
        className={cn(
          "flex h-full items-center gap-2.5 rounded-xl border bg-surface p-2.5 transition-colors",
          date ? "border-primary/40" : "border-border",
        )}
      >
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            date ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <CalendarDays className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "truncate text-sm font-semibold",
              !date && "font-medium text-muted-foreground",
            )}
          >
            {date
              ? date.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Select date"}
          </p>
        </div>
      </div>
      <input
        id={id}
        type="date"
        required
        aria-label={label}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

/** Leave application fields shared by the student and parent portals. */
export function ApplyLeaveForm({
  idPrefix,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  onSubmit: (values: { fromDate: string; toDate: string; reason: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState(LEAVE_TYPES[0]!);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = fromDate ? parseDate(fromDate) : null;
  const to = toDate ? parseDate(toDate) : null;
  const days =
    from && to && to >= from ? Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1 : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromDate || !toDate) {
      toast.error("Select start and end dates");
      return;
    }
    if (toDate < fromDate) {
      toast.error("End date must be after start date");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ fromDate, toDate, reason: `${type}: ${reason.trim()}` });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <Label className="text-xs font-semibold text-muted-foreground">Leave type</Label>
        <div className="flex flex-wrap gap-2">
          {LEAVE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors active:scale-95",
                type === t
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-surface text-foreground/80 hover:bg-muted",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground">Dates</Label>
          {days !== null && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {days} {days === 1 ? "day" : "days"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <DateTile
            id={`${idPrefix}-from`}
            label="From"
            value={fromDate}
            min={todayIso()}
            onChange={(v) => {
              setFromDate(v);
              if (toDate && v > toDate) setToDate("");
            }}
          />
          <DateTile
            id={`${idPrefix}-to`}
            label="To"
            value={toDate}
            min={fromDate || todayIso()}
            onChange={setToDate}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor={`${idPrefix}-reason`}
            className="text-xs font-semibold text-muted-foreground"
          >
            Reason
          </Label>
          <span className="text-[11px] text-muted-foreground">
            {reason.length}/{REASON_MAX}
          </span>
        </div>
        <Textarea
          id={`${idPrefix}-reason`}
          required
          maxLength={REASON_MAX}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Briefly describe the reason"
          className="min-h-24 resize-none rounded-xl bg-surface text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} className="h-11 gap-2 rounded-xl">
          <Send className="h-4 w-4" />
          {submitting ? "Sending…" : "Submit"}
        </Button>
      </div>
    </form>
  );
}
