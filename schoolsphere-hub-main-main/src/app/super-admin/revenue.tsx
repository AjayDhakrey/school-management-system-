"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { IndianRupee, TrendingUp, AlertTriangle, Plus } from "lucide-react";
import { PageHeader, SearchInput, EmptyState, TableSkeleton, Initials } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePayments, useSchools } from "@/hooks/useApi";
import { api } from "@/lib/api";

function RecordPaymentForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: schools } = useSchools();
  const [schoolId, setSchoolId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Card");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return toast.error("Select a school");
    setSubmitting(true);
    try {
      await api.post("/payments", { schoolId, amount: Number(amount), method });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
      toast.success("Payment recorded");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label>School</Label>
        <Select value={schoolId} onValueChange={setSchoolId}>
          <SelectTrigger className="bg-surface">
            <SelectValue placeholder="Select a school" />
          </SelectTrigger>
          <SelectContent>
            {(schools ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pay-amount">Amount</Label>
        <Input id="pay-amount" type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Method</Label>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["Card", "Bank Transfer", "UPI", "Cheque", "Cash"].map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Record Payment
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function RevenuePage() {
  const { data: payments, isLoading } = usePayments();
  const { data: schools } = useSchools();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const rows = payments ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => !q || (p.school_name ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  const totalRevenue = rows.reduce((sum, p) => sum + p.amount, 0);
  const thisMonth = rows
    .filter((p) => new Date(p.paid_on).getMonth() === new Date().getMonth() && new Date(p.paid_on).getFullYear() === new Date().getFullYear())
    .reduce((sum, p) => sum + p.amount, 0);
  const overdueSchools = (schools ?? []).filter((s) => s.payment_status === "OVERDUE").length;

  return (
    <div>
      <PageHeader
        title="Revenue & Payments"
        description="Every payment recorded across the platform."
        breadcrumb={["Dashboard", "Revenue & Payments"]}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Record Payment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
              </DialogHeader>
              <RecordPaymentForm onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Revenue" value={`₹${totalRevenue.toLocaleString()}`} icon={IndianRupee} tone="navy" />
        <InfoCard label="This Month" value={`₹${thisMonth.toLocaleString()}`} icon={TrendingUp} tone="success" />
        <InfoCard label="Overdue Schools" value={overdueSchools} icon={AlertTriangle} tone="danger" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search school…" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No payments found" description="Record a payment to see it here." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Paid On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={p.school_name ?? "—"} tone="info" />
                        <span className="truncate font-medium">{p.school_name ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">₹{p.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{p.method ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.plan ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.paid_on}</TableCell>
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
