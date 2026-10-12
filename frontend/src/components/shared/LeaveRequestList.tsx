import { CalendarDays, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ApiLeaveRequest } from "@/hooks/useApi";

const STATUS_STYLE: Record<string, { icon: typeof Clock3; tone: string }> = {
  Approved: { icon: CheckCircle2, tone: "bg-success-soft text-success" },
  Rejected: { icon: XCircle, tone: "bg-destructive-soft text-destructive" },
  Pending: { icon: Clock3, tone: "bg-warning-soft text-warning" },
};

/** Splits "Sick Leave: fever" (the convention every apply-leave form uses) into type + free-text reason. */
function splitReason(reason: string | null) {
  if (!reason) return { type: "Leave", text: "" };
  const idx = reason.indexOf(":");
  if (idx === -1) return { type: "Leave", text: reason };
  return { type: reason.slice(0, idx).trim() || "Leave", text: reason.slice(idx + 1).trim() };
}

/** "2026-10-28" → local Date (avoids the UTC shift of `new Date("2026-10-28")`). */
function parseDate(value: string | null) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

function formatDate(value: string | null) {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

function dayCount(from: string | null, to: string | null) {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** A requester's own leave history — cards on mobile, a table on wider screens. */
export function LeaveRequestList({ rows }: { rows: ApiLeaveRequest[] }) {
  return (
    <>
      <div className="space-y-2.5 p-3 md:hidden">
        {rows.map((l) => {
          const { type, text } = splitReason(l.reason);
          const style = STATUS_STYLE[l.status] ?? STATUS_STYLE["Pending"]!;
          const Icon = style.icon;
          const days = dayCount(l.from_date, l.to_date);
          return (
            <div
              key={l.id}
              className="rounded-2xl border border-border bg-card p-3.5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", style.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{type}</p>
                    <StatusBadge status={l.status} />
                  </div>
                  {text && (
                    <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">{text}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {formatDate(l.from_date)}
                    {l.to_date && l.to_date !== l.from_date && <> → {formatDate(l.to_date)}</>}
                  </span>
                </span>
                {days !== null && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                    {days} {days === 1 ? "day" : "days"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => {
              const { type, text } = splitReason(l.reason);
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium whitespace-nowrap">{type}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-muted-foreground">{text || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(l.from_date)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(l.to_date)}</TableCell>
                  <TableCell className="text-muted-foreground">{dayCount(l.from_date, l.to_date) ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
