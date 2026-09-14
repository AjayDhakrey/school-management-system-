"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { UserCog, CheckCircle2, Ban } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchoolAdmins, type ApiSchoolAdmin } from "@/hooks/useApi";
import { api } from "@/lib/api";

function ResetPasswordDialog({ admin, onDone }: { admin: ApiSchoolAdmin; onDone: () => void }) {
  const [name, setName] = useState(admin.name);
  const [email, setEmail] = useState(admin.email);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/schools/${admin.school_id}/admin`, { name, email, password });
      toast.success(`Password reset for ${email}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="admin-name">Name</Label>
        <Input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="admin-email">Email</Label>
        <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="admin-password">New Password</Label>
        <Input
          id="admin-password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Reset Password
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function SchoolAdminsPage() {
  const { data: admins, isLoading } = useSchoolAdmins();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [resetTarget, setResetTarget] = useState<ApiSchoolAdmin | null>(null);

  const rows = admins ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((a) => {
      const matchesQ = !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.school_name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || a.status === statusFilter;
      return matchesQ && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const active = rows.filter((a) => a.status === "ACTIVE").length;
  const suspended = rows.filter((a) => a.status === "SUSPENDED").length;

  async function toggleStatus(admin: ApiSchoolAdmin) {
    const nextStatus = admin.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await api.patch(`/school-admins/${admin.id}/status`, { status: nextStatus });
      await queryClient.invalidateQueries({ queryKey: ["school-admins"] });
      toast.success(`${admin.name} ${nextStatus === "ACTIVE" ? "reactivated" : "suspended"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  return (
    <div>
      <PageHeader
        title="School Admins"
        description="Every School Admin account across the platform."
        breadcrumb={["Dashboard", "School Admins"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Admins" value={rows.length} icon={UserCog} tone="navy" />
        <InfoCard label="Active" value={active} icon={CheckCircle2} tone="success" />
        <InfoCard label="Suspended" value={suspended} icon={Ban} tone="danger" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name / email / school…" />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={["ACTIVE", "SUSPENDED"]} placeholder="Status" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No School Admins found" description="Try adjusting your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admin</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={a.name} tone="info" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{a.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{a.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.school_name}</TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setResetTarget(a)}>
                          Reset Password
                        </Button>
                        <Button
                          variant={a.status === "ACTIVE" ? "destructive" : "outline"}
                          size="sm"
                          onClick={() => toggleStatus(a)}
                        >
                          {a.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={Boolean(resetTarget)} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password — {resetTarget?.name}</DialogTitle>
          </DialogHeader>
          {resetTarget && <ResetPasswordDialog admin={resetTarget} onDone={() => setResetTarget(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
