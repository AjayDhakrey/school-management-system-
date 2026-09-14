"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Layers, Plus } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePlans } from "@/hooks/useApi";
import { api } from "@/lib/api";

function AddPlanForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [billingCycle, setBillingCycle] = useState("MONTHLY");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/plans", { name, price: Number(price), billingCycle });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success(`${name} plan added`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add plan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="plan-name">Plan Name</Label>
        <Input id="plan-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Growth" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="plan-price">Price</Label>
        <Input id="plan-price" type="number" min={0} required value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Billing Cycle</Label>
        <Select value={billingCycle} onValueChange={setBillingCycle}>
          <SelectTrigger className="bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MONTHLY">Monthly</SelectItem>
            <SelectItem value="YEARLY">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Add Plan
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function PlansPage() {
  const queryClient = useQueryClient();
  const { data: plans, isLoading } = usePlans();
  const [open, setOpen] = useState(false);

  const rows = plans ?? [];
  const active = rows.filter((p) => p.status === "ACTIVE").length;

  async function toggleStatus(id: string, current: string) {
    try {
      await api.patch(`/plans/${id}`, { status: current === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update plan");
    }
  }

  return (
    <div>
      <PageHeader
        title="Plans"
        description="Subscription plans available to sell to schools."
        breadcrumb={["Dashboard", "Plans"]}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Plan</DialogTitle>
              </DialogHeader>
              <AddPlanForm onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <InfoCard label="Total Plans" value={rows.length} icon={Layers} tone="navy" />
        <InfoCard label="Active Plans" value={active} icon={Layers} tone="success" />
      </div>

      <div className="panel">
        {isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState title="No plans yet" description="Add your first subscription plan." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Billing Cycle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>₹{p.price.toLocaleString()}</TableCell>
                    <TableCell>{p.billing_cycle === "YEARLY" ? "Yearly" : "Monthly"}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch checked={p.status === "ACTIVE"} onCheckedChange={() => toggleStatus(p.id, p.status)} />
                    </TableCell>
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
