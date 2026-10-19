"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CircleCheck,
  CheckCircle2,
  Crown,
  IndianRupee,
  Layers,
  Pencil,
  Plus,
  Rocket,
  School,
  Sparkles,
  Users,
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
    ? "Run migration 64_plan_student_limit.sql in Supabase to enable student limits"
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
// One accent per tier: top bar, icon tile and check marks.
const TIER_TONE = [
  { bar: "bg-sky-500", tile: "bg-sky-500/10 text-sky-600", check: "text-sky-600" },
  { bar: "bg-violet-500", tile: "bg-violet-500/10 text-violet-600", check: "text-violet-600" },
  { bar: "bg-amber-500", tile: "bg-amber-500/10 text-amber-600", check: "text-amber-600" },
  { bar: "bg-emerald-500", tile: "bg-emerald-500/10 text-emerald-600", check: "text-emerald-600" },
];

/** One pricing card: price, what it covers, schools on it, status and edit. */
function PlanCard({
  plan,
  tier,
  schools,
  popular,
  onEdit,
}: {
  plan: ApiPlan;
  tier: number;
  schools: number;
  popular: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const yearly = plan.billing_cycle === "YEARLY";
  const active = plan.status === "ACTIVE";
  const t = Math.min(tier, TIER_ICON.length - 1);
  const Icon = TIER_ICON[t]!;
  const tone = TIER_TONE[t]!;
  const monthly = yearly ? plan.price / 12 : plan.price;
  const perStudent = plan.max_students
    ? Math.round((monthly / plan.max_students) * 100) / 100
    : null;
  const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const points = [
    plan.max_students
      ? `Up to ${plan.max_students.toLocaleString("en-IN")} students`
      : "Unlimited students",
    perStudent !== null ? `${rupees(perStudent)} per student a month` : null,
    yearly
      ? `≈ ${rupees(Math.round(plan.price / 12))} a month`
      : `${rupees(plan.price * 12)} a year`,
    `Billed ${yearly ? "yearly" : "monthly"}`,
  ].filter(Boolean) as string[];

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
        popular ? "border-primary/60 ring-2 ring-primary/15" : "border-border",
        !active && "opacity-60",
      )}
    >
      <span className={cn("h-1.5 w-full", tone.bar)} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <span className={cn("grid h-11 w-11 place-items-center rounded-xl", tone.tile)}>
            <Icon className="h-5 w-5" />
          </span>
          {popular && (
            <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold tracking-wide text-primary-foreground uppercase shadow-sm">
              ★ Most popular
            </span>
          )}
        </div>

        <h3 className="mt-4 font-display text-xl font-bold">{plan.name}</h3>
        <p className="text-xs text-muted-foreground">
          For schools with{" "}
          {plan.max_students
            ? `up to ${plan.max_students.toLocaleString("en-IN")} students`
            : "any number of students"}
        </p>

        <div className="mt-5 flex items-baseline gap-1">
          <span className="font-display text-4xl font-extrabold tracking-tight">
            {rupees(plan.price)}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            /{yearly ? "year" : "month"}
          </span>
        </div>

        <ul className="mt-5 space-y-2.5 border-t border-dashed border-border pt-5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm">
              <CircleCheck className={cn("mt-0.5 h-4 w-4 shrink-0", tone.check)} />
              <span className="text-foreground/85">{p}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-5">
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <School className="h-3.5 w-3.5" /> Schools on plan
            </span>
            <span className="font-display text-sm font-bold tabular-nums">{schools}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  active ? "bg-success" : "bg-muted-foreground/50",
                )}
              />
              {active ? "Available" : "Hidden"}
            </span>
            <Button
              type="button"
              size="sm"
              variant={popular ? "default" : "outline"}
              className="h-8 gap-1.5"
              onClick={onEdit}
            >
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
  const rows = plans ?? [];
  const active = rows.filter((p) => p.status === "ACTIVE").length;
  const sorted = [...rows].sort((a, b) => a.price - b.price);
  const schoolsOn = (planName: string) =>
    (schools ?? []).filter((sc) => (sc.plan ?? "").toLowerCase() === planName.toLowerCase()).length;
  const subscribed = (schools ?? []).filter((sc) =>
    rows.some((p) => p.name.toLowerCase() === (sc.plan ?? "").toLowerCase()),
  ).length;
  // The plan most schools are on gets the "Most popular" ribbon (only when it leads).
  const counts = sorted.map((p) => ({ id: p.id, n: schoolsOn(p.name) }));
  const top = counts.reduce((m, c) => (c.n > m.n ? c : m), { id: "", n: 0 });
  const popularId = counts.filter((c) => c.n === top.n).length === 1 ? top.id : "";

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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InfoCard label="Total Plans" value={rows.length} icon={Layers} tone="navy" />
        <InfoCard label="Active Plans" value={active} icon={CheckCircle2} tone="success" />
        <InfoCard label="Schools Subscribed" value={subscribed} icon={School} tone="info" />
        <InfoCard
          label="Starting Price"
          value={
            rows.length ? `₹${Math.min(...rows.map((p) => p.price)).toLocaleString("en-IN")}` : "—"
          }
          icon={IndianRupee}
          tone="gold"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : rows.length === 0 ? (
        <div className="panel">
          <EmptyState title="No plans yet" description="Add your first subscription plan." />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {sorted.map((p, i) => (
            <PlanCard
              key={p.id}
              plan={p}
              tier={i}
              schools={schoolsOn(p.name)}
              popular={p.id === popularId}
              onToggle={() => toggleStatus(p.id, p.status)}
              onEdit={() => setEditing(p)}
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
