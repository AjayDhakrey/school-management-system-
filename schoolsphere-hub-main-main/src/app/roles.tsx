"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save, ShieldCheck } from "lucide-react";
import { PageHeader, CardSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";
import { useRoles, useUsers, type Role, type StaffDepartment, type ApiRolePermissionSet } from "@/hooks/useApi";

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  SCHOOL_ADMIN: "School Admin",
  TEACHER: "Teacher",
  STAFF: "Staff",
  PARENT: "Parent",
  STUDENT: "Student",
};

const DEPARTMENT_LABELS: Record<StaffDepartment, string> = {
  ADMIN: "Admin",
  ACCOUNTS: "Accounts",
  LIBRARY: "Library",
  TRANSPORT: "Transport",
};

function permissionLabel(p: string) {
  const action = p.split(".")[1] ?? p;
  return action
    .split(/[_-]/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function resourceLabel(resource: string) {
  return resource
    .split(/[_-]/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Groups the flat permission list into { resource -> [permission, ...] } for a readable checkbox grid. */
function groupByResource(permissions: string[]) {
  const groups = new Map<string, string[]>();
  for (const p of permissions) {
    const resource = p.split(".")[0] ?? p;
    if (!groups.has(resource)) groups.set(resource, []);
    groups.get(resource)!.push(p);
  }
  return groups;
}

type SelectionKey = string; // `${role}` or `${role}:${department}`

function keyFor(role: Role, department: StaffDepartment | null) {
  return department ? `${role}:${department}` : role;
}

export default function Page() {
  const { data: roleData, isLoading } = useRoles();
  const { data: users } = useUsers();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<SelectionKey>("TEACHER");
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);

  const roleCounts: Record<string, number> = {};
  for (const u of users ?? []) roleCounts[u.role] = (roleCounts[u.role] ?? 0) + 1;

  const entries: ApiRolePermissionSet[] = roleData?.roles ?? [];
  const current = entries.find((e) => keyFor(e.role, e.department) === selected) ?? null;
  const allPermissions = roleData?.permissions ?? [];
  const grouped = useMemo(() => groupByResource(allPermissions), [allPermissions]);

  // Reset the local editing draft whenever the selected role/department (or its server data) changes.
  useEffect(() => {
    setDraft(current ? new Set(current.permissions) : null);
  }, [selected, current?.permissions.join(",")]);

  const isDirty = current && draft ? !setsEqual(draft, new Set(current.permissions)) : false;

  function toggle(permission: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  async function handleSave() {
    if (!current || !draft) return;
    setSaving(true);
    try {
      await api.put(`/roles/${current.role}`, {
        permissions: [...draft],
        ...(current.department ? { department: current.department } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success(`${roleDisplayName(current)} permissions updated`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!current) return;
    setSaving(true);
    try {
      await api.post(`/roles/${current.role}/reset`, current.department ? { department: current.department } : {});
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success(`${roleDisplayName(current)} reset to default`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to reset permissions");
    } finally {
      setSaving(false);
    }
  }

  function roleDisplayName(e: ApiRolePermissionSet) {
    return e.department ? `${ROLE_LABELS[e.role]} — ${DEPARTMENT_LABELS[e.department]}` : ROLE_LABELS[e.role];
  }

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Manage what each role can access in your school. School Admin's own access is fixed and not shown here."
        breadcrumb={["Dashboard", "Roles & Permissions"]}
      />

      {isLoading ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {entries.map((e) => {
              const k = keyFor(e.role, e.department);
              return (
                <button
                  key={k}
                  onClick={() => setSelected(k)}
                  className={cn(
                    "panel shrink-0 p-3 text-left transition-colors lg:shrink lg:w-full",
                    selected === k ? "border-primary ring-1 ring-primary" : "hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className={cn("h-4 w-4 shrink-0", selected === k ? "text-primary" : "text-muted-foreground")} />
                      <p className="whitespace-nowrap text-sm font-semibold lg:whitespace-normal">{roleDisplayName(e)}</p>
                    </div>
                    {e.customized && <Badge variant="secondary" className="text-[10px]">Customized</Badge>}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {roleCounts[e.role] ?? 0} users · {e.permissions.length} permissions
                  </p>
                </button>
              );
            })}
          </div>

          <SectionCard
            title={current ? `Permissions — ${roleDisplayName(current)}` : "Permissions"}
            subtitle={current?.customized ? "Customized for your school — differs from the default." : "Using the default permission set."}
            action={
              current && (
                <div className="flex gap-2">
                  {current.customized && (
                    <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
                      <RotateCcw className="h-3.5 w-3.5" /> Reset to Default
                    </Button>
                  )}
                  <Button size="sm" onClick={handleSave} disabled={saving || !isDirty}>
                    <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              )
            }
          >
            {current && draft ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[...grouped.entries()].map(([resource, perms]) => (
                  <div key={resource} className="rounded-xl border border-border p-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{resourceLabel(resource)}</p>
                    <div className="space-y-1.5">
                      {perms.map((p) => (
                        <label key={p} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={draft.has(p)} onCheckedChange={() => toggle(p)} />
                          {permissionLabel(p)}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a role to manage its permissions.</p>
            )}
          </SectionCard>

          <SectionCard
            className="lg:col-span-2"
            title="School Admin"
            subtitle="Not editable — School Admin always has full access to every school-management feature except platform/SaaS administration, so there's no safe subset to restrict here."
          >
            <div className="flex flex-wrap gap-2">
              {(roleData?.schoolAdminPermissions ?? []).map((p) => (
                <Badge key={p} variant="outline" className="text-[11px] font-medium text-muted-foreground">
                  {permissionLabel(p)}
                </Badge>
              ))}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
