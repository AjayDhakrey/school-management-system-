import { LogIn, LogOut } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

type HistoryRow = {
  id: string;
  date: string;
  status: string;
  check_in?: string | null;
  check_out?: string | null;
};

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** "11:53" / "11:53:20" → "11:53 AM" */
function clock(time: string | null | undefined) {
  if (!time) return null;
  const [h = 0, m = 0] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Own attendance history: compact day rows on phones, a table on larger screens. */
export function AttendanceHistory({ rows }: { rows: HistoryRow[] }) {
  return (
    <>
      {/* Phones */}
      <ul className="divide-y divide-border md:hidden">
        {rows.map((r) => {
          const d = asDate(r.date);
          const inAt = clock(r.check_in);
          const outAt = clock(r.check_out);
          return (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted">
                <span className="text-center leading-none">
                  <span className="block font-display text-base font-bold">{d.getUTCDate()}</span>
                  <span className="block text-[9px] font-semibold uppercase text-muted-foreground">
                    {d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}
                  </span>
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {d.toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <LogIn className="h-3 w-3" /> {inAt ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <LogOut className="h-3 w-3" /> {outAt ?? "—"}
                  </span>
                </p>
              </div>
              <StatusBadge status={r.status} />
            </li>
          );
        })}
      </ul>

      {/* Tablets & desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Day</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Check In</th>
              <th className="px-4 py-2.5">Check Out</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = asDate(r.date);
              return (
                <tr
                  key={r.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {d.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {d.toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 whitespace-nowrap",
                      !r.check_in && "text-muted-foreground",
                    )}
                  >
                    {clock(r.check_in) ?? "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 whitespace-nowrap",
                      !r.check_out && "text-muted-foreground",
                    )}
                  >
                    {clock(r.check_out) ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
