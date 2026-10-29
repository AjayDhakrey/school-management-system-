"use client";

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, Phone, MapPin, KeyRound, Ban, CheckCircle2, PauseCircle } from "lucide-react";
import { PageHeader, Initials } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchool, usePlans } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { niceDate } from "@/lib/utils";

/** One billing period after `from` (a month, or a year for yearly plans). */
function periodEnd(from: Date, cycle: string | null | undefined) {
  const end = new Date(from);
  if (cycle === "YEARLY") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end.toISOString();
}

function ResetAdminDialog({ schoolId, hasAdmin }: { schoolId: string; hasAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/schools/${schoolId}/admin`, { name, email, password });
      await queryClient.invalidateQueries({ queryKey: [`school-${schoolId}`] });
      toast.success(hasAdmin ? "School Admin access reset" : "School Admin created");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save School Admin");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="h-4 w-4" /> {hasAdmin ? "Reset Access" : "Create School Admin"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {hasAdmin ? "Reset School Admin Access" : "Create School Admin"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="admin-name">Name</Label>
            <Input
              id="admin-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="admin-password">{hasAdmin ? "New Password" : "Password"}</Label>
            <Input
              id="admin-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: school, isLoading } = useSchool(id);
  const { data: plans } = usePlans();

  async function changeStatus(status: string) {
    if (!id) return;
    try {
      await api.patch(`/schools/${id}/status`, { status });
      // An active school is a paid-up school: settle the payment and make sure the current
      // period has an end date.
      if (status === "ACTIVE" && school) {
        const start = school.subscription_started_at ?? new Date().toISOString();
        await api.patch(`/schools/${id}`, {
          payment_status: "PAID",
          subscription_started_at: start,
          subscription_expires_at:
            school.subscription_expires_at ?? periodEnd(new Date(start), school.billing_cycle),
        });
      }
      await queryClient.invalidateQueries({ queryKey: [`school-${id}`] });
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
      toast.success(`School marked ${status.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function changePayment(payment: string) {
    if (!id) return;
    try {
      await api.patch(`/schools/${id}`, { payment_status: payment });
      await queryClient.invalidateQueries({ queryKey: [`school-${id}`] });
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
      toast.success(`Payment marked ${payment.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update payment");
    }
  }

  async function changePlan(plan: string) {
    if (!id) return;
    try {
      const chosen = (plans ?? []).find((p) => p.name === plan);
      const cycle = chosen?.billing_cycle ?? school?.billing_cycle ?? "MONTHLY";
      const now = new Date();
      await api.patch(`/schools/${id}`, {
        plan,
        billing_cycle: cycle,
        subscription_started_at: now.toISOString(),
        subscription_expires_at: periodEnd(now, cycle),
        ...(school?.status === "ACTIVE" ? { payment_status: "PAID" } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: [`school-${id}`] });
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
      toast.success(`Plan changed to ${plan}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change plan");
    }
  }

  if (isLoading || !school) {
    return (
      <div>
        <PageHeader title="School" breadcrumb={["Dashboard", "Schools", "…"]} />
        <div className="panel bg-card p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={school.name}
        description={school.id}
        breadcrumb={["Dashboard", "Schools", school.short_name]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/super-admin/schools")}>
            Back to Schools
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title="School Information">
          <div className="flex items-start gap-3">
            <Initials name={school.short_name} className="h-12 w-12" tone="info" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{school.name}</p>
              <p className="text-xs text-muted-foreground">{school.id}</p>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {school.email && (
                  <p className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> {school.email}
                  </p>
                )}
                {school.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {school.phone}
                  </p>
                )}
                {school.address && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {school.address}
                  </p>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="School Admin"
          action={<ResetAdminDialog schoolId={school.id} hasAdmin={Boolean(school.admin)} />}
        >
          {school.admin ? (
            <div className="flex items-center gap-3">
              <Initials name={school.admin.name} tone="gold" />
              <div>
                <p className="text-sm font-semibold">{school.admin.name}</p>
                <p className="text-xs text-muted-foreground">{school.admin.email}</p>
              </div>
              <StatusBadge status="Active" className="ml-auto" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No School Admin account yet — create one to let this school sign in.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Subscription">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted-foreground">Current Plan</dt>
              <dd className="mt-1">
                <Select value={school.plan} onValueChange={changePlan}>
                  <SelectTrigger className="h-8 w-full bg-surface text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(plans ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Billing Cycle</dt>
              <dd className="mt-1 text-sm font-medium">
                {school.billing_cycle === "YEARLY" ? "Yearly" : "Monthly"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Start Date</dt>
              <dd className="mt-1 text-sm font-medium">
                {niceDate(school.subscription_started_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Expiry Date</dt>
              <dd className="mt-1 text-sm font-medium">
                {school.subscription_expires_at
                  ? niceDate(school.subscription_expires_at)
                  : "Renews automatically"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Payment Status</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                {/* An active school counts as paid unless it's been marked otherwise. */}
                <Select
                  value={
                    school.status === "ACTIVE" && (school.payment_status ?? "PENDING") === "PENDING"
                      ? "PAID"
                      : (school.payment_status ?? "PENDING")
                  }
                  onValueChange={changePayment}
                >
                  <SelectTrigger className="h-8 w-[150px] bg-surface text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="OVERDUE">Overdue</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground">
                  Activating the school marks it paid automatically.
                </span>
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Account">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd className="mt-1 text-sm font-medium">{niceDate(school.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <StatusBadge status={school.status} />
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => changeStatus("ACTIVE")}
              disabled={school.status === "ACTIVE"}
            >
              <CheckCircle2 className="h-4 w-4" /> Activate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => changeStatus("SUSPENDED")}
              disabled={school.status === "SUSPENDED"}
            >
              <PauseCircle className="h-4 w-4" /> Suspend
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => changeStatus("INACTIVE")}
              disabled={school.status === "INACTIVE"}
            >
              <Ban className="h-4 w-4" /> Deactivate
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
