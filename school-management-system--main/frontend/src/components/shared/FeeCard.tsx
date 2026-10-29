import type { ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { ProgressBar } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

/** Mobile replacement for a fee table row — title, status, payment progress and one action. */
export function FeeCard({
  title,
  status,
  dueDate,
  total,
  paid,
  action,
}: {
  title: string;
  status: string;
  dueDate: string | null;
  total: number;
  paid: number;
  action?: ReactNode;
}) {
  const remaining = Math.max(0, total - paid);
  const percent = total > 0 ? Math.min(100, (paid / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{title}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            Due {dueDate ?? "—"}
          </p>
        </div>
        <div className="shrink-0">
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar value={percent} tone="success" />
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-border rounded-xl bg-muted/40 py-2 text-center">
        <Stat label="Total" value={total} />
        <Stat label="Paid" value={paid} className="text-success" />
        <Stat
          label="Remaining"
          value={remaining}
          className={remaining > 0 ? "text-destructive" : "text-success"}
        />
      </div>

      {action && <div className="mt-3 [&>button]:w-full">{action}</div>}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="min-w-0 px-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("truncate text-sm font-semibold tabular-nums", className)}>
        ₹{value.toLocaleString()}
      </p>
    </div>
  );
}
