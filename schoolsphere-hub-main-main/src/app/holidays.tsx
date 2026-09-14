"use client";

import { useMemo } from "react";
import { CalendarHeart, Hourglass } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHolidays } from "@/hooks/useApi";

export default function HolidaysPage() {
  const { data: holidays, isLoading } = useHolidays();

  const rows = holidays ?? [];
  const upcoming = useMemo(() => rows.filter((h) => new Date(h.date) >= new Date(new Date().toDateString())), [rows]);

  return (
    <div>
      <PageHeader title="Holidays" description="School-declared holidays for the academic session." breadcrumb={["Dashboard", "Holidays"]} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Holidays" value={rows.length} icon={CalendarHeart} tone="navy" />
        <InfoCard label="Upcoming" value={upcoming.length} icon={Hourglass} tone="gold" />
      </div>

      <div className="panel">
        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState title="No holidays declared yet" description="Your school hasn't published the holiday calendar." icon={CalendarHeart} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Holiday</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Session</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell className="text-muted-foreground">{h.date}</TableCell>
                    <TableCell className="text-muted-foreground">{h.day ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={h.type ?? "Holiday"} tone="info" />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{h.session ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
