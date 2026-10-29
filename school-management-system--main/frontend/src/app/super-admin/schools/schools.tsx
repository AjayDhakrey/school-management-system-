"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CheckCircle2, Hourglass, Plus } from "lucide-react";
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  EmptyState,
  TableSkeleton,
  Initials,
} from "@/components/shared/ui-kit";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSchools, usePlans, type ApiSchool } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { PhoneInput } from "@/components/shared/PhoneInput";

function AddSchoolForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: plans } = usePlans();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState("");
  // Default to the cheapest active plan once plans load — never a name that isn't a plan.
  useEffect(() => {
    if (plan || !plans?.length) return;
    const cheapest = [...plans]
      .filter((p) => p.status === "ACTIVE")
      .sort((a, b) => a.price - b.price)[0];
    if (cheapest) setPlan(cheapest.name);
  }, [plans, plan]);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) {
      toast.error("Choose a subscription plan");
      return;
    }
    setSubmitting(true);
    try {
      const school = await api.post<{ id: string }>("/schools", {
        name,
        shortName,
        email,
        phone,
        plan,
      });
      await api.post(`/schools/${school.id}/admin`, {
        name: adminName,
        email: adminEmail,
        password: adminPassword,
      });
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
      toast.success(`${name} added with School Admin ${adminEmail}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add school");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="name">School Name</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Maple Leaf Academy"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="shortName">Short Name</Label>
        <Input
          id="shortName"
          required
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          placeholder="Maple Leaf"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Contact Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="info@school.edu"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="phone">Contact Number</Label>
        <PhoneInput id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label>Subscription Plan</Label>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="bg-surface">
            <SelectValue placeholder="Choose a plan" />
          </SelectTrigger>
          <SelectContent>
            {(plans ?? [])
              .filter((p) => p.status === "ACTIVE")
              .map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.name} — ₹{p.price.toLocaleString("en-IN")}/
                  {p.billing_cycle === "YEARLY" ? "yr" : "mo"}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="sm:col-span-2">
        <p className="text-xs font-semibold text-muted-foreground">School Admin Account</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="adminName">Admin Name</Label>
        <Input
          id="adminName"
          required
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          placeholder="Full name"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="adminEmail">Admin Email</Label>
        <Input
          id="adminEmail"
          type="email"
          required
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="admin@school.edu"
        />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="adminPassword">Admin Password</Label>
        <Input
          id="adminPassword"
          type="password"
          required
          minLength={6}
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
      </div>

      <DialogFooter className="sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Add School
        </Button>
      </DialogFooter>
    </form>
  );
}

const DAY_MS = 86_400_000;
const EXPIRY_WARNING_DAYS = 30;

/** Days from today until `iso` (negative once past), or null for no/invalid date. */
function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return Math.ceil((when.getTime() - Date.now()) / DAY_MS);
}

/** Things a platform admin should fix for this school, most urgent first. */
function schoolIssues(s: ApiSchool, planNames: Set<string>) {
  const issues: string[] = [];
  const live = s.status === "ACTIVE" || s.status === "TRIAL";
  const days = daysUntil(s.subscription_expires_at);
  if (live && days !== null && days < 0) issues.push("Subscription expired");
  else if (live && days !== null && days <= EXPIRY_WARNING_DAYS) issues.push(`Expires in ${days}d`);
  if (live && days === null) issues.push("No expiry date");
  if (s.plan?.trim() && planNames.size && !planNames.has(s.plan.trim().toLowerCase()))
    issues.push("Plan not listed");
  if (!s.admin) issues.push("No school admin");
  return issues;
}

function ExpiryCell({ iso, live }: { iso: string | null | undefined; live: boolean }) {
  const days = daysUntil(iso);
  if (days === null) return <span className="text-muted-foreground">—</span>;
  const date = new Date(iso!).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const relative =
    days < 0
      ? `Expired ${-days}d ago`
      : days === 0
        ? "Expires today"
        : `in ${days} day${days === 1 ? "" : "s"}`;
  return (
    <div className="whitespace-nowrap">
      <p className="text-sm">{date}</p>
      <p
        className={cn(
          "text-[11px]",
          !live
            ? "text-muted-foreground"
            : days < 0
              ? "font-semibold text-destructive"
              : days <= EXPIRY_WARNING_DAYS
                ? "font-semibold text-warning"
                : "text-muted-foreground",
        )}
      >
        {relative}
      </p>
    </div>
  );
}

export default function SchoolsPage() {
  const { data: schools, isLoading } = useSchools();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const { data: plans } = usePlans();

  const rows = useMemo(() => schools ?? [], [schools]);
  const planNames = useMemo(
    () => new Set((plans ?? []).map((p) => p.name.trim().toLowerCase())),
    [plans],
  );
  const issuesById = useMemo(
    () => new Map(rows.map((s) => [s.id, schoolIssues(s, planNames)])),
    [rows, planNames],
  );
  const needsAttention = rows.filter((s) => issuesById.get(s.id)!.length > 0).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      const matchesQ = !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const matchesAttention = !attentionOnly || issuesById.get(s.id)!.length > 0;
      return matchesQ && matchesStatus && matchesAttention;
    });
  }, [rows, search, statusFilter, attentionOnly, issuesById]);

  const active = rows.filter((s) => s.status === "ACTIVE").length;
  const trial = rows.filter((s) => s.status === "TRIAL").length;

  return (
    <div>
      <PageHeader
        title="Schools"
        description="Manage every school running on this platform."
        breadcrumb={["Dashboard", "Schools"]}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add School
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add School</DialogTitle>
              </DialogHeader>
              <AddSchoolForm onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InfoCard label="Total Schools" value={rows.length} icon={Building2} tone="navy" />
        <InfoCard label="Active" value={active} icon={CheckCircle2} tone="success" />
        <InfoCard label="Trial" value={trial} icon={Hourglass} tone="gold" />
        <InfoCard
          label="Needs attention"
          value={needsAttention}
          icon={AlertTriangle}
          tone={needsAttention ? "danger" : "success"}
        />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search school name / ID…" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAttentionOnly((v) => !v)}
              aria-pressed={attentionOnly}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors",
                attentionOnly
                  ? "border-warning bg-warning text-white"
                  : "border-warning/40 bg-warning-soft/40 text-warning hover:bg-warning-soft",
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Needs attention
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                  attentionOnly ? "bg-white/25" : "bg-warning/15",
                )}
              >
                {needsAttention}
              </span>
            </button>
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={["ACTIVE", "TRIAL", "INACTIVE", "SUSPENDED", "EXPIRED"]}
              placeholder="Status"
            />
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              attentionOnly && !search && statusFilter === "all"
                ? "Nothing needs attention"
                : "No schools found"
            }
            description={
              attentionOnly && !search && statusFilter === "all"
                ? "Every school has an admin, a listed plan and a valid expiry."
                : "Try adjusting your search or filters."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>School Admin</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const issues = issuesById.get(s.id)!;
                  const planUnlisted = issues.includes("Plan not listed");
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/super-admin/schools/${s.id}`)}
                    >
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Initials name={s.short_name} tone="info" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{s.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{s.id}</p>
                            {issues.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {issues.map((issue) => (
                                  <span
                                    key={issue}
                                    className={cn(
                                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                      issue === "Subscription expired"
                                        ? "bg-destructive-soft text-destructive"
                                        : "bg-warning-soft text-warning",
                                    )}
                                  >
                                    {issue}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.admin?.email ?? <span className="text-warning">Not assigned</span>}
                      </TableCell>
                      <TableCell>
                        <span className={cn(planUnlisted && "text-warning")}>{s.plan || "—"}</span>
                        {planUnlisted && (
                          <p className="text-[10px] text-muted-foreground">Not a current plan</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell>
                        <ExpiryCell
                          iso={s.subscription_expires_at}
                          live={s.status === "ACTIVE" || s.status === "TRIAL"}
                        />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
