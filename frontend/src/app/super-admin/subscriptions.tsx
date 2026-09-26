"use client";

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Hourglass, AlertTriangle } from "lucide-react";
import { PageHeader, SearchInput, FilterSelect, EmptyState, TableSkeleton, Initials } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchools } from "@/hooks/useApi";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export default function SubscriptionsPage() {
  const { data: schools, isLoading } = useSchools();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  const rows = schools ?? [];
  const planOptions = useMemo(() => Array.from(new Set(rows.map((s) => s.plan))), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      const matchesQ = !q || s.name.toLowerCase().includes(q);
      const matchesPlan = planFilter === "all" || s.plan === planFilter;
      return matchesQ && matchesPlan;
    });
  }, [rows, search, planFilter]);

  const activeSubs = rows.filter((s) => s.payment_status === "PAID").length;
  const expiringSoon = rows.filter((s) => {
    const d = daysUntil(s.subscription_expires_at);
    return d !== null && d >= 0 && d <= 30;
  }).length;
  const overdue = rows.filter((s) => s.payment_status === "OVERDUE").length;

  return (
    <div>
      <PageHeader title="Subscriptions" description="Subscription status across every school." breadcrumb={["Dashboard", "Subscriptions"]} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Active Subscriptions" value={activeSubs} icon={CreditCard} tone="success" />
        <InfoCard label="Expiring Within 30 Days" value={expiringSoon} icon={Hourglass} tone="gold" />
        <InfoCard label="Overdue Payments" value={overdue} icon={AlertTriangle} tone="danger" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search school…" />
          <FilterSelect value={planFilter} onChange={setPlanFilter} options={planOptions} placeholder="Plan" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No subscriptions found" description="Try adjusting your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Billing Cycle</TableHead>
                  <TableHead>Payment Status</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const d = daysUntil(s.subscription_expires_at);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Initials name={s.short_name} tone="info" />
                          <span className="truncate font-medium">{s.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{s.plan}</TableCell>
                      <TableCell>{s.billing_cycle === "YEARLY" ? "Yearly" : "Monthly"}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.payment_status ?? "PENDING"} />
                      </TableCell>
                      <TableCell className={d !== null && d <= 30 ? "font-medium text-warning" : "text-muted-foreground"}>
                        {s.subscription_expires_at ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/super-admin/schools/${s.id}`}>Manage</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
