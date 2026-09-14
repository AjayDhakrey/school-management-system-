"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Users as UsersIcon, UserCheck, UserX, ShieldCheck, MoreHorizontal, Plus, Copy, Eye, EyeOff } from "lucide-react";
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  EmptyState,
  TableSkeleton,
  Pager,
  Initials,
  usePaged,
} from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useUsers,
  useTeachers,
  useParents,
  useStudents,
  useStaff,
  type ApiUser,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const ROLE_OPTIONS = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STAFF", "PARENT", "STUDENT"];
const CREATABLE_ROLES = ["TEACHER", "PARENT", "STUDENT", "STAFF", "SCHOOL_ADMIN"] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];
const DEPARTMENTS = ["ADMIN", "ACCOUNTS", "LIBRARY", "TRANSPORT"];

function roleLabel(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export default function Page() {
  const { data: users, isLoading } = useUsers();
  const { data: teachers } = useTeachers();
  const { data: parents } = useParents();
  const { data: students } = useStudents();
  const { data: staff } = useStaff();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState<CreatableRole>("TEACHER");
  const [createLinkedId, setCreateLinkedId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createDepartment, setCreateDepartment] = useState("ADMIN");
  const [creating, setCreating] = useState(false);

  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<ApiUser | null>(null);

  const rows = users ?? [];

  const filtered = useMemo(() => {
    return rows.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      const matchesStatus = statusFilter === "all" || u.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [rows, search, roleFilter, statusFilter]);

  const { rows: paged, pageCount } = usePaged(filtered, page, 8);

  const total = rows.length;
  const active = rows.filter((u) => u.status === "ACTIVE").length;
  const suspended = rows.filter((u) => u.status === "SUSPENDED").length;
  const rolesCount = new Set(rows.map((u) => u.role)).size;

  // Teachers with no login account yet — the "Teaching Staff" roster is a separate table from
  // logins, so a teacher can exist there with zero rows here. Surfaced below so it's obvious why
  // filtering by Teacher role doesn't list every teacher, with a one-click way to fix it.
  const teachersWithoutLogin = useMemo(() => {
    const linked = new Set(rows.filter((u) => u.linked_teacher_id).map((u) => u.linked_teacher_id));
    return (teachers ?? []).filter((t) => !linked.has(t.id));
  }, [rows, teachers]);

  // Records of the selected role that don't yet have a login account.
  const availableLinkTargets = useMemo(() => {
    if (createRole === "TEACHER") {
      return teachersWithoutLogin.map((t) => ({ id: t.id, label: t.name }));
    }
    if (createRole === "PARENT") {
      const linked = new Set(rows.filter((u) => u.linked_parent_id).map((u) => u.linked_parent_id));
      return (parents ?? []).filter((p) => !linked.has(p.id)).map((p) => ({ id: p.id, label: p.name }));
    }
    if (createRole === "STUDENT") {
      const linked = new Set(rows.filter((u) => u.linked_student_id).map((u) => u.linked_student_id));
      return (students ?? []).filter((s) => !linked.has(s.id)).map((s) => ({ id: s.id, label: s.name }));
    }
    if (createRole === "STAFF") {
      // There's no linked_staff_id column tracking staff logins back to a specific
      // staff row, so we can't filter out staff who already have a login here —
      // just let the admin pick from the full staff list.
      return (staff ?? []).map((s) => ({ id: s.id, label: s.name }));
    }
    return [];
  }, [createRole, rows, teachers, parents, students, staff]);

  function resetCreateForm() {
    setCreateRole("TEACHER");
    setCreateLinkedId("");
    setCreateName("");
    setCreateEmail("");
    setCreateDepartment("ADMIN");
  }

  function openCreateLoginFor(teacher: { id: string; name: string; email: string | null }) {
    setCreateRole("TEACHER");
    setCreateLinkedId(teacher.id);
    setCreateName(teacher.name);
    setCreateEmail(teacher.email ?? "");
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!createName || !createEmail) {
      toast.error("Please fill in name and email");
      return;
    }
    if (createRole !== "SCHOOL_ADMIN" && !createLinkedId) {
      toast.error("Please select a record to link this login to");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        role: createRole,
        name: createName,
        email: createEmail,
      };
      if (createRole !== "SCHOOL_ADMIN") body["linkedId"] = createLinkedId;
      if (createRole === "STAFF") body["department"] = createDepartment;

      const result = await api.post<{ id: string; tempPassword: string }>("/users", body);
      toast.success("Login created");
      setCreateOpen(false);
      const email = createEmail;
      resetCreateForm();
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setTempPassword({ email, password: result.tempPassword });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create login";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleSuspend(user: ApiUser) {
    const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await api.patch(`/users/${user.id}`, { status: nextStatus });
      toast.success(`User ${nextStatus === "ACTIVE" ? "activated" : "suspended"}`);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to update status";
      toast.error(message);
    }
  }

  async function savePassword(user: ApiUser, password: string) {
    await api.patch(`/users/${user.id}`, { password });
    toast.success(`Password updated for ${user.name}`);
    setResetTarget(null);
  }

  async function deleteUser(user: ApiUser) {
    try {
      await api.delete(`/users/${user.id}`);
      toast.success("User deleted");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to delete user";
      toast.error(message);
    }
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Manage system accounts, roles and access status."
        breadcrumb={["Dashboard", "User Management"]}
        actions={
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreateForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Create Login
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a login</DialogTitle>
                <DialogDescription>
                  Attach a new login account to an existing teacher, parent, student or staff record.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label>Role</Label>
                  <Select value={createRole} onValueChange={(v) => { setCreateRole(v as CreatableRole); setCreateLinkedId(""); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CREATABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {createRole !== "SCHOOL_ADMIN" && (
                  <div className="grid gap-1.5">
                    <Label>Link to {roleLabel(createRole)} record</Label>
                    <Select value={createLinkedId} onValueChange={setCreateLinkedId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={`Select a ${roleLabel(createRole).toLowerCase()}…`} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLinkTargets.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">No available records without a login.</div>
                        ) : (
                          availableLinkTargets.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {createRole === "STAFF" && (
                  <div className="grid gap-1.5">
                    <Label>Department</Label>
                    <Select value={createDepartment} onValueChange={setCreateDepartment}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label>Full name</Label>
                  <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Email</Label>
                  <Input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="jane@everbright.edu" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating…" : "Create login"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Users" value={total} icon={UsersIcon} tone="navy" />
        <InfoCard label="Active" value={active} icon={UserCheck} tone="success" />
        <InfoCard label="Suspended" value={suspended} icon={UserX} tone="danger" />
        <InfoCard label="Roles" value={rolesCount} icon={ShieldCheck} tone="gold" />
      </div>

      {teachersWithoutLogin.length > 0 && (
        <div className="panel mt-5 border-warning/30 bg-warning-soft/40 p-4">
          <div className="flex items-start gap-2">
            <UserX className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {teachersWithoutLogin.length} teacher{teachersWithoutLogin.length === 1 ? "" : "s"} without a login account
              </p>
              <p className="text-xs text-muted-foreground">
                Filtering by "Teacher" below only lists accounts that can sign in — these teachers exist on the Teaching Staff roster
                but have no login yet.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {teachersWithoutLogin.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openCreateLoginFor(t)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  >
                    {t.name}
                    <Plus className="h-3 w-3 text-primary" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel mt-5 overflow-hidden">
        <div className="grid gap-2 border-b border-border p-4 sm:flex sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search users…" />
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              value={roleFilter}
              onChange={(v) => { setRoleFilter(v); setPage(1); }}
              options={ROLE_OPTIONS}
              placeholder="Role"
            />
            <FilterSelect
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={["ACTIVE", "SUSPENDED"]}
              placeholder="Status"
            />
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : paged.length === 0 ? (
          <EmptyState title="No users found" description="Try adjusting your search or filters." />
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">User</th>
                    <th className="px-4 py-2.5 font-medium">Role</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Initials name={u.name} tone="navy" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{u.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="font-medium">
                          {roleLabel(u.role)}
                          {u.department ? ` · ${u.department}` : ""}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{u.created_at?.slice(0, 10) ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <UserActions user={u} onToggle={toggleSuspend} onReset={setResetTarget} onDelete={deleteUser} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-4 sm:hidden">
              {paged.map((u) => (
                <div key={u.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Initials name={u.name} tone="navy" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <UserActions user={u} onToggle={toggleSuspend} onReset={setResetTarget} onDelete={deleteUser} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{roleLabel(u.role)}</Badge>
                    <StatusBadge status={u.status} />
                    <span className="text-xs text-muted-foreground">{u.created_at?.slice(0, 10) ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>

            <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
          </>
        )}
      </div>

      <Dialog open={Boolean(tempPassword)} onOpenChange={(o) => !o && setTempPassword(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>
              Share this password with {tempPassword?.email}. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {tempPassword && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
              <code className="flex-1 select-all break-all text-sm font-semibold">{tempPassword.password}</code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(tempPassword.password);
                  toast.success("Copied to clipboard");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setTempPassword(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="max-w-sm">
          {resetTarget && (
            <ResetPasswordForm user={resetTarget} onSave={(password) => savePassword(resetTarget, password)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function generateRandomPassword() {
  return (Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8)).slice(0, 10);
}

function ResetPasswordForm({ user, onSave }: { user: ApiUser; onSave: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSubmitting(true);
    try {
      await onSave(password);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <DialogHeader>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogDescription>Set a new password for {user.name} ({user.email}).</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="reset-password">New Password</Label>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => {
              setPassword(generateRandomPassword());
              setShowPassword(true);
            }}
          >
            Generate
          </button>
        </div>
        <div className="relative">
          <Input
            id="reset-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save New Password"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function UserActions({
  user,
  onToggle,
  onReset,
  onDelete,
}: {
  user: ApiUser;
  onToggle: (user: ApiUser) => void;
  onReset: (user: ApiUser) => void;
  onDelete: (user: ApiUser) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onReset(user)}>Reset password</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onToggle(user)}>
          {user.status === "ACTIVE" ? "Suspend" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => e.preventDefault()}
            >
              Delete
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this user?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the login for {user.name}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(user)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
