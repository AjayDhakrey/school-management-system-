"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, KeyRound } from "lucide-react";
import { PageHeader, FilterSelect, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuditLog } from "@/hooks/useApi";
import { api } from "@/lib/api";

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch("/auth/password", { currentPassword, newPassword });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-md gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="current-password">Current Password</Label>
        <Input
          id="current-password"
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="new-password">New Password</Label>
        <Input
          id="new-password"
          type="password"
          required
          minLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
      </div>
      <div>
        <Button type="submit" disabled={submitting}>
          Update Password
        </Button>
      </div>
    </form>
  );
}

export default function SecurityPage() {
  const { data: entries, isLoading } = useAuditLog();
  const [actionFilter, setActionFilter] = useState("all");

  const rows = entries ?? [];
  const actionOptions = useMemo(() => Array.from(new Set(rows.map((e) => e.action))), [rows]);

  const filtered = useMemo(() => {
    return actionFilter === "all" ? rows : rows.filter((e) => e.action === actionFilter);
  }, [rows, actionFilter]);

  return (
    <div>
      <PageHeader title="Security & Audit" description="Platform activity log and your account security." breadcrumb={["Dashboard", "Security & Audit"]} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <InfoCard label="Logged Actions" value={rows.length} icon={ShieldCheck} tone="navy" />
      </div>

      <SectionCard title="Change Password" subtitle="Update your Super Admin login credentials" className="mb-4">
        <ChangePasswordForm />
      </SectionCard>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4" /> Audit Log
          </h3>
          <FilterSelect value={actionFilter} onChange={setActionFilter} options={actionOptions} placeholder="Action" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No activity recorded yet" description="Actions taken by Super Admins will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.actor_name ?? "System"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.action}</TableCell>
                    <TableCell className="text-muted-foreground">{e.target ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.created_at}</TableCell>
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
