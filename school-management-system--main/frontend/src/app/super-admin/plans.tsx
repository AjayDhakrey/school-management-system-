"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CircleCheck,
  Crown,
  IndianRupee,
  Layers,
  Pencil,
  Plus,
  Rocket,
  School,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePlans, useSchools, type ApiPlan } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

/** Friendly message when the database hasn't got the student-limit column yet. */
function planError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  return /max_students/i.test(message)
    ? "Run migration 68_plan_student_limit.sql in Supabase to enable student limits"
    : message;
}

function AddPlanForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [billingCycle, setBillingCycle] = useState("MONTHLY");
  const [maxStudents, setMaxStudents] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/plans", {
        name,
        price: Number(price),
        billingCycle,
        ...(maxStudents ? { maxStudents: Number(maxStudents) } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success(`${name} plan added`);
      onDone();
    } catch (err) {
      toast.error(planError(err, "Failed to add plan"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="plan-name">Plan Name</Label>
        <Input
          id="plan-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Growth"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="plan-price">Price</Label>
        <Input
          id="plan-price"
          type="number"
          min={0}
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="plan-students">Student limit</Label>
        <Input
          id="plan-students"
          type="number"
          min={1}
          value={maxStudents}
          onChange={(e) => setMaxStudents(e.target.value)}
          placeholder="e.g. 500 — leave empty for unlimited"
        />
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

const TIER_ICON = [Sparkles, Rocket, Crown, Building2];
// One accent per tier: header wash, icon tile, check marks and revenue-mix segment.
const TIER_TONE = [
  {
    head: "from-sky-500/15 via-sky-500/5",
    tile: "bg-sky-500 text-white",
    check: "text-sky-600",
    bar: "bg-sky-500",
  },
  {
    head: "from-violet-500/15 via-violet-500/5",
    tile: "bg-violet-500 text-white",
    check: "text-violet-600",
    bar: "bg-violet-500",
  },
  {
    head: "from-amber-500/15 via-amber-500/5",
    tile: "bg-amber-500 text-white",
    check: "text-amber-600",
    bar: "bg-amber-500",
  },
  {
    head: "from-emerald-500/15 via-emerald-500/5",
    tile: "bg-emerald-500 text-white",
    check: "text-emerald-600",
    bar: "bg-emerald-500",
  },
];
const toneFor = (tier: number) => TIER_TONE[Math.min(tier, TIER_TONE.length - 1)]!;
const iconFor = (tier: number) => TIER_ICON[Math.min(tier, TIER_ICON.length - 1)]!;

type View = "MONTHLY" | "YEARLY";
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
/** What the plan earns per school per month, whatever cycle it is billed on. */
const monthlyPrice = (plan: ApiPlan) =>
  plan.billing_cycle === "YEARLY" ? plan.price / 12 : plan.price;

/** One pricing card: price in the chosen view, what it covers, its revenue and controls. */
function PlanCard({
  plan,
  tier,
  schools,
  mrr,
  share,
  popular,
  view,
  onToggle,
  onEdit,
}: {
  plan: ApiPlan;
  tier: number;
  schools: number;
  /** Monthly revenue from the schools on this plan. */
  mrr: number;
  /** This plan's share of total monthly revenue, 0–100. */
  share: number;
  popular: boolean;
  view: View;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const active = plan.status === "ACTIVE";
  const Icon = iconFor(tier);
  const tone = toneFor(tier);
  const monthly = monthlyPrice(plan);
  const shown = view === "YEARLY" ? monthly * 12 : monthly;
  const billedYearly = plan.billing_cycle === "YEARLY";
  const perStudent = plan.max_students ? monthly / plan.max_students : null;

  const points = [
    plan.max_students
      ? `Up to ${plan.max_students.toLocaleString("en-IN")} students`
      : "Unlimited students",
    perStudent !== null
      ? `${perStudent < 10 ? `₹${perStudent.toFixed(2)}` : rupees(perStudent)} per student / month`
      : null,
    view === "YEARLY" ? `${rupees(monthly)} a month` : `${rupees(monthly * 12)} a year`,
    `Billed ${billedYearly ? "yearly" : "monthly"}`,
  ].filter(Boolean) as string[];

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl",
        popular ? "border-primary/60 ring-2 ring-primary/20" : "border-border",
        !active && "opacity-70 saturate-50",
      )}
    >
      {/* Tinted header */}
      <div className={cn("bg-gradient-to-b to-transparent px-5 pt-5 pb-4", tone.head)}>
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "grid h-11 w-11 place-items-center rounded-xl shadow-md transition-transform group-hover:scale-105",
              tone.tile,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          {popular ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold tracking-wide text-primary-foreground uppercase shadow-sm">
              <Star className="h-3 w-3 fill-current" /> Most popular
            </span>
          ) : (
            !active && (
              <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                Hidden
              </span>
            )
          )}
        </div>
        <h3 className="mt-4 font-display text-xl font-bold">{plan.name}</h3>
        <p className="text-xs text-muted-foreground">
          For schools with{" "}
          {plan.max_students
            ? `up to ${plan.max_students.toLocaleString("en-IN")} students`
            : "any number of students"}
        </p>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="font-display text-[2.5rem] leading-none font-extrabold tracking-tight">
            {rupees(shown)}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            /{view === "YEARLY" ? "year" : "month"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5">
        <ul className="space-y-2.5 border-t border-dashed border-border pt-4">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-2 text-sm">
              <CircleCheck className={cn("mt-0.5 h-4 w-4 shrink-0", tone.check)} />
              <span className="text-foreground/85">{point}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-5">
          {/* What this plan is earning right now */}
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <School className="h-3.5 w-3.5" />
                {schools} school{schools === 1 ? "" : "s"}
              </span>
              <span className="font-semibold tabular-nums">
                {rupees(mrr)}
                <span className="font-normal text-muted-foreground">/mo</span>
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", tone.bar)}
                style={{ width: `${share}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{share}% of platform revenue</p>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <Switch
                checked={active}
                onCheckedChange={onToggle}
                aria-label={`${plan.name} available to schools`}
              />
              <span className={active ? "text-success" : "text-muted-foreground"}>
                {active ? "Available" : "Hidden"}
              </span>
            </label>
            <Button type="button" size="sm" className="h-8 gap-1.5" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit plan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Edit a plan: name, price, billing cycle and which modules it includes. */
function EditPlanDialog({
  plan,
  schools,
  onClose,
}: {
  plan: ApiPlan;
  schools: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(plan.name);
  const [isActive, setIsActive] = useState(plan.status === "ACTIVE");
  const [price, setPrice] = useState(String(plan.price));
  const [billingCycle, setBillingCycle] = useState(plan.billing_cycle || "MONTHLY");
  const [maxStudents, setMaxStudents] = useState(
    plan.max_students ? String(plan.max_students) : "",
  );
  const [saving, setSaving] = useState(false);

  const renamed = name.trim() !== plan.name;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(price);
    if (!name.trim()) {
      toast.error("Enter a plan name");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid price");
      return;
    }
    setSaving(true);
    try {
      const limit = maxStudents.trim() ? Number(maxStudents) : null;
      if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
        toast.error("Student limit must be a whole number, or empty for unlimited");
        setSaving(false);
        return;
      }
      await api.patch(`/plans/${plan.id}`, {
        name: name.trim(),
        price: amount,
        billingCycle,
        maxStudents: limit,
        status: isActive ? "ACTIVE" : "INACTIVE",
      });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success(`${name.trim()} plan updated`);
      onClose();
    } catch (err) {
      toast.error(planError(err, "Failed to update plan"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit Plan</DialogTitle>
      </DialogHeader>
      <form onSubmit={save} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-plan-name">Plan Name</Label>
          <Input id="edit-plan-name" value={name} onChange={(e) => setName(e.target.value)} />
          {renamed && schools > 0 && (
            <p className="text-[11px] text-warning">
              {schools} school{schools === 1 ? " is" : "s are"} on “{plan.name}”. They keep the old
              name until you update them under Schools.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-plan-price">Price (₹)</Label>
            <Input
              id="edit-plan-price"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
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
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium">Plan active</span>
            <span className="block text-[11px] text-muted-foreground">
              {isActive
                ? "Schools can be put on this plan"
                : "Hidden — can't be chosen for schools"}
            </span>
          </span>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </label>
        <div className="grid gap-2">
          <Label htmlFor="edit-plan-students">Student limit</Label>
          <Input
            id="edit-plan-students"
            type="number"
            min={1}
            value={maxStudents}
            onChange={(e) => setMaxStudents(e.target.value)}
            placeholder="Leave empty for unlimited"
          />
          <div className="flex flex-wrap gap-1.5">
            {[100, 500, 1000, 1500].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMaxStudents(String(n))}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  maxStudents === String(n)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                {n.toLocaleString("en-IN")}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function PlansPage() {
  const queryClient = useQueryClient();
  const { data: plans, isLoading } = usePlans();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiPlan | null>(null);

  const { data: schools } = useSchools();
  const [view, setView] = useState<View>("MONTHLY");
  const rows = plans ?? [];
  const active = rows.filter((p) => p.status === "ACTIVE").length;
  const sorted = [...rows].sort((a, b) => monthlyPrice(a) - monthlyPrice(b));
  const schoolsOn = (planName: string) =>
    (schools ?? []).filter((sc) => (sc.plan ?? "").toLowerCase() === planName.toLowerCase()).length;
  const subscribed = (schools ?? []).filter((sc) =>
    rows.some((p) => p.name.toLowerCase() === (sc.plan ?? "").toLowerCase()),
  ).length;
  // Schools naming a plan that no longer exists (e.g. after a rename); no plan at all is fine.
  const unmatched = (schools ?? []).filter(
    (sc) => sc.plan?.trim() && !rows.some((p) => p.name.toLowerCase() === sc.plan!.toLowerCase()),
  ).length;
  // The plan most schools are on gets the "Most popular" ribbon (only when it leads).
  const counts = sorted.map((p) => ({ id: p.id, n: schoolsOn(p.name) }));
  const top = counts.reduce((m, c) => (c.n > m.n ? c : m), { id: "", n: 0 });
  const popularId = counts.filter((c) => c.n === top.n).length === 1 ? top.id : "";

  // Monthly recurring revenue: each school pays its plan's monthly-equivalent price.
  const revenue = sorted.map((p, tier) => ({
    plan: p,
    tier,
    mrr: monthlyPrice(p) * schoolsOn(p.name),
  }));
  const totalMrr = revenue.reduce((sum, r) => sum + r.mrr, 0);
  const shareOf = (mrr: number) => (totalMrr ? Math.round((mrr / totalMrr) * 100) : 0);

  async function toggleStatus(id: string, current: string) {
    try {
      await api.patch(`/plans/${id}`, { status: current === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success(current === "ACTIVE" ? "Plan hidden from schools" : "Plan available again");
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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InfoCard
          label="Monthly revenue"
          value={rupees(totalMrr)}
          icon={IndianRupee}
          tone="success"
        />
        <InfoCard
          label="Avg. per school"
          value={subscribed ? rupees(totalMrr / subscribed) : "—"}
          icon={TrendingUp}
          tone="gold"
        />
        <InfoCard label="Schools subscribed" value={subscribed} icon={School} tone="info" />
        <InfoCard
          label="Active plans"
          value={`${active} / ${rows.length}`}
          icon={Layers}
          tone="navy"
        />
      </div>

      {totalMrr > 0 && (
        <section className="panel mb-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Revenue mix</p>
            <p className="text-xs text-muted-foreground">
              {rupees(totalMrr)}/month · {rupees(totalMrr * 12)}/year
            </p>
          </div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
            {revenue.map(
              (r) =>
                r.mrr > 0 && (
                  <span
                    key={r.plan.id}
                    className={cn("h-full", toneFor(r.tier).bar)}
                    style={{ width: `${(r.mrr / totalMrr) * 100}%` }}
                    title={`${r.plan.name}: ${rupees(r.mrr)}/month`}
                  />
                ),
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {revenue.map((r) => (
              <span key={r.plan.id} className="flex items-center gap-1.5 text-xs">
                <span className={cn("h-2.5 w-2.5 rounded-full", toneFor(r.tier).bar)} />
                <span className="font-medium">{r.plan.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {shareOf(r.mrr)}% · {rupees(r.mrr)}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {unmatched > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft/40 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            <span className="font-semibold">
              {unmatched} school{unmatched === 1 ? " is" : "s are"} on a plan that isn&apos;t listed
              here
            </span>{" "}
            <span className="text-muted-foreground">
              (often after a plan is renamed). Update them under Schools so revenue counts them.
            </span>
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {rows.length} plan{rows.length === 1 ? "" : "s"}
          <span className="font-normal text-muted-foreground"> · cheapest first</span>
        </p>
        <div
          role="radiogroup"
          aria-label="Show prices"
          className="inline-flex rounded-xl border border-border bg-muted/40 p-1"
        >
          {(["MONTHLY", "YEARLY"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                view === v
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "MONTHLY" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : rows.length === 0 ? (
        <div className="panel">
          <EmptyState title="No plans yet" description="Add your first subscription plan." />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {revenue.map(({ plan, tier, mrr }) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              tier={tier}
              schools={schoolsOn(plan.name)}
              mrr={mrr}
              share={shareOf(mrr)}
              popular={plan.id === popularId}
              view={view}
              onToggle={() => toggleStatus(plan.id, plan.status)}
              onEdit={() => setEditing(plan)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditPlanDialog
            key={editing.id}
            plan={editing}
            schools={schoolsOn(editing.name)}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
