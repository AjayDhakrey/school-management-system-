"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Hourglass, AlertTriangle } from "lucide-react";
import { PageHeader, SearchInput, EmptyState, TableSkeleton, Initials } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchools, type ApiSchool } from "@/hooks/useApi";
import { api } from "@/lib/api";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function RenewDialog({ school, onDone }: { school: ApiSchool; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("30");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/payments", { schoolId: school.id, amount: Number(amount), method: "Renewal", plan: school.plan, extendsDays: Number(days) });
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success(`${school.name} renewed for ${days} days`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to renew");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="renew-amount">Amount</Label>
        <Input id="renew-amount" type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="renew-days">Extend By (days)</Label>
        <Input id="renew-days" type="number" min={1} required value={days} onChange={(e) => setDays(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Renew
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function RenewalsPage() {
  const { data: schools, isLoading } = useSchools();
  const [search, setSearch] = useState("");
  const [renewTarget, setRenewTarget] = useState<ApiSchool | null>(null);

  const rows = useMemo(() => {
    return (schools ?? [])
      .filter((s) => {
        const d = daysUntil(s.subscription_expires_at);
        return d !== null && d <= 90;
      })
      .sort((a, b) => (daysUntil(a.subscription_expires_at) ?? 0) - (daysUntil(b.subscription_expires_at) ?? 0));
  }, [schools]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [rows, search]);

  const within30 = rows.filter((s) => (daysUntil(s.subscription_expires_at) ?? 99) <= 30).length;
  const overdue = rows.filter((s) => (daysUntil(s.subscription_expires_at) ?? 0) < 0).length;

  return (
    <div>
      <PageHeader title="Renewals" description="Subscriptions expiring within 90 days." breadcrumb={["Dashboard", "Renewals"]} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Upcoming Renewals" value={rows.length} icon={RefreshCw} tone="navy" />
        <InfoCard label="Within 30 Days" value={within30} icon={Hourglass} tone="gold" />
        <InfoCard label="Overdue" value={overdue} icon={AlertTriangle} tone="danger" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search school…" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState title="Nothing due for renewal" description="No subscriptions expire within the next 90 days." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Days Left</TableHead>
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
                      <TableCell className="text-muted-foreground">{s.subscription_expires_at ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={d !== null && d < 0 ? "OVERDUE" : d !== null && d <= 30 ? "PENDING" : "TRIAL"} />
                        <span className="ml-2 text-xs text-muted-foreground">{d !== null ? `${d}d` : "—"}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => setRenewTarget(s)}>
                          Renew
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

      <Dialog open={Boolean(renewTarget)} onOpenChange={(open) => !open && setRenewTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renew — {renewTarget?.name}</DialogTitle>
          </DialogHeader>
          {renewTarget && <RenewDialog school={renewTarget} onDone={() => setRenewTarget(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
