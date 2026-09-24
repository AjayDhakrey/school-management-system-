"use client";

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Hourglass, Plus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchools, usePlans } from "@/hooks/useApi";
import { api } from "@/lib/api";

function AddSchoolForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: plans } = usePlans();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState("Basic");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const school = await api.post<{ id: string }>("/schools", { name, shortName, email, phone, plan });
      await api.post(`/schools/${school.id}/admin`, { name: adminName, email: adminEmail, password: adminPassword });
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
        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maple Leaf Academy" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="shortName">Short Name</Label>
        <Input id="shortName" required value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Maple Leaf" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Contact Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@school.edu" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="phone">Contact Number</Label>
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label>Subscription Plan</Label>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(plans ?? []).map((p) => (
              <SelectItem key={p.id} value={p.name}>
                {p.name} — ₹{p.price.toLocaleString()}/{p.billing_cycle === "YEARLY" ? "yr" : "mo"}
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
        <Input id="adminName" required value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Full name" />
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

export default function SchoolsPage() {
  const { data: schools, isLoading } = useSchools();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = schools ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      const matchesQ = !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      return matchesQ && matchesStatus;
    });
  }, [rows, search, statusFilter]);

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

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Schools" value={rows.length} icon={Building2} tone="navy" />
        <InfoCard label="Active" value={active} icon={CheckCircle2} tone="success" />
        <InfoCard label="Trial" value={trial} icon={Hourglass} tone="gold" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search school name / ID…" />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={["ACTIVE", "TRIAL", "INACTIVE", "SUSPENDED", "EXPIRED"]}
            placeholder="Status"
          />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No schools found" description="Try adjusting your search or filters." />
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
                {filtered.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/super-admin/schools/${s.id}`)}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={s.short_name} tone="info" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{s.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{s.id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.admin?.email ?? "Not assigned"}</TableCell>
                    <TableCell>{s.plan}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.subscription_expires_at ?? "—"}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/super-admin/schools/${s.id}`}>Manage</Link>
                      </Button>
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
