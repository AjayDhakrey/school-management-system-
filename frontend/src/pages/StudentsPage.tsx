import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Users, UserCheck, UserX, Percent, MoreHorizontal, Plus, Eye, EyeOff, Pencil, Trash2, ListFilter } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStudents, useParents, useClasses, useTransport, type ApiStudent } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const PER_PAGE = 8;
const NONE = "__none__";
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function StudentFormDialog({
  initial,
  onDone,
  onClose,
}: {
  initial?: ApiStudent;
  onDone: () => void;
  onClose: () => void;
}) {
  const isEdit = Boolean(initial);
  const { data: classes } = useClasses();
  const { data: parents } = useParents();
  const { data: vehicles } = useTransport();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [classId, setClassId] = useState(initial?.class_id ?? NONE);
  const [status, setStatus] = useState(initial?.status ?? "Active");
  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? NONE);
  const [bloodGroup, setBloodGroup] = useState(initial?.blood_group ?? NONE);

  // Most students get a brand-new parent record; only siblings of an already-enrolled
  // student need the "existing parent" list, so that's opt-in rather than the default.
  const [parentMode, setParentMode] = useState<"new" | "existing">(initial?.parent_id ? "existing" : "new");
  const [existingParentId, setExistingParentId] = useState(initial?.parent_id ?? NONE);
  const [newParentName, setNewParentName] = useState("");
  const [newParentPhone, setNewParentPhone] = useState("");
  const [newParentEmail, setNewParentEmail] = useState("");

  // Student + parent portal logins created together (e.g. for a brand-new family) share one
  // password field — only the emails differ, since that's what actually distinguishes the accounts.
  const [createStudentLogin, setCreateStudentLogin] = useState(false);
  const [createParentLogin, setCreateParentLogin] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");
  const [showPortalPassword, setShowPortalPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const admissionNo = String(form.get("admissionNo") ?? "").trim();
    const rollRaw = String(form.get("roll") ?? "").trim();
    const admittedOn = String(form.get("admittedOn") ?? "").trim();
    const dob = String(form.get("dob") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const pickupPoint = String(form.get("pickupPoint") ?? "").trim();
    const dropPoint = String(form.get("dropPoint") ?? "").trim();

    if (!name) {
      toast.error("Name is required");
      return;
    }

    const trimmedParentName = newParentName.trim();
    const trimmedParentPhone = newParentPhone.trim();
    const trimmedParentEmail = newParentEmail.trim();
    const willCreateParentLogin = parentMode === "new" && trimmedParentName && createParentLogin;
    if (parentMode === "new" && trimmedParentName) {
      if (!trimmedParentPhone && !trimmedParentEmail) {
        toast.error("Enter the parent's mobile number or email");
        return;
      }
      if (createParentLogin && !trimmedParentEmail) {
        toast.error("Email is required to create a parent portal login");
        return;
      }
    }
    if (createStudentLogin && !email) {
      toast.error("Add the student's email above to create a student portal login");
      return;
    }
    if ((willCreateParentLogin || createStudentLogin) && portalPassword.length < 6) {
      toast.error("Portal password must be at least 6 characters");
      return;
    }

    const selectedClass = classId !== NONE ? classes?.find((c) => c.id === classId) : undefined;

    setSubmitting(true);
    try {
      let resolvedParentId: string | null =
        parentMode === "existing" ? (existingParentId !== NONE ? existingParentId : null) : null;

      if (parentMode === "new" && trimmedParentName) {
        const createdParent = await api.post<{ id: string }>("/parents", {
          name: trimmedParentName,
          phone: trimmedParentPhone || null,
          email: trimmedParentEmail || null,
        });
        resolvedParentId = createdParent.id;
        if (createParentLogin) {
          await api.post("/users", {
            role: "PARENT",
            linkedId: createdParent.id,
            name: trimmedParentName,
            email: trimmedParentEmail,
            password: portalPassword,
          });
          queryClient.invalidateQueries({ queryKey: ["users"] });
        }
        queryClient.invalidateQueries({ queryKey: ["parents"] });
      }

      const body = {
        name,
        admissionNo: admissionNo || null,
        classId: classId !== NONE ? classId : null,
        className: selectedClass ? selectedClass.name : null,
        section: selectedClass ? selectedClass.section : null,
        roll: rollRaw ? Number(rollRaw) : null,
        parentId: resolvedParentId,
        admittedOn: admittedOn || null,
        dob: dob || null,
        email: email || null,
        phone: phone || null,
        bloodGroup: bloodGroup !== NONE ? bloodGroup : null,
        address: address || null,
        ...(isEdit
          ? {
              status,
              vehicleId: vehicleId !== NONE ? vehicleId : null,
              pickupPoint: pickupPoint || null,
              dropPoint: dropPoint || null,
            }
          : {}),
      };

      let studentId: string;
      if (isEdit) {
        await api.patch(`/students/${initial!.id}`, body);
        studentId = initial!.id;
      } else {
        const createdStudent = await api.post<{ id: string }>("/students", body);
        studentId = createdStudent.id;
      }

      if (createStudentLogin) {
        await api.post("/users", {
          role: "STUDENT",
          linkedId: studentId,
          name,
          email,
          password: portalPassword,
        });
        queryClient.invalidateQueries({ queryKey: ["users"] });
      }

      toast.success(isEdit ? "Student updated successfully" : "Student added successfully");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${isEdit ? "update" : "add"} student`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${initial!.name}` : "Add Student"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" name="name" required defaultValue={initial?.name} placeholder="e.g. Aarav Mehta" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="admissionNo">Admission No.</Label>
          <Input
            id="admissionNo"
            name="admissionNo"
            defaultValue={initial?.admission_no ?? ""}
            placeholder="ADM/2026/001"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not assigned</SelectItem>
              {(classes ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}-{c.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="roll">Roll No.</Label>
          <Input id="roll" name="roll" type="number" defaultValue={initial?.roll ?? ""} placeholder="12" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="admittedOn">Admission Date</Label>
          <Input
            id="admittedOn"
            name="admittedOn"
            type="date"
            // Only block past dates for a brand-new admission — editing an existing student must
            // keep allowing their real (already-past) admission date, or the form can't be saved.
            min={isEdit ? undefined : new Date().toISOString().slice(0, 10)}
            defaultValue={initial?.admitted_on ?? (isEdit ? "" : new Date().toISOString().slice(0, 10))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dob">Date of Birth</Label>
          <Input id="dob" name="dob" type="date" defaultValue={initial?.dob ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} placeholder="student@example.com" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={initial?.phone ?? ""} placeholder="+1 (555) 123-4567" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bloodGroup">Blood Group</Label>
          <Select value={bloodGroup} onValueChange={setBloodGroup}>
            <SelectTrigger id="bloodGroup" className="bg-surface">
              <SelectValue placeholder="Select blood group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not specified</SelectItem>
              {BLOOD_GROUPS.map((bg) => (
                <SelectItem key={bg} value={bg}>
                  {bg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" defaultValue={initial?.address ?? ""} placeholder="123 Maple Street, Springfield" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label>Parent / Guardian</Label>
            <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setParentMode("new")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  parentMode === "new" ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                New Parent
              </button>
              <button
                type="button"
                onClick={() => setParentMode("existing")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  parentMode === "existing" ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                Existing Parent (Sibling)
              </button>
            </div>
          </div>

          {parentMode === "existing" ? (
            <Select value={existingParentId} onValueChange={setExistingParentId}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Select parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not linked</SelectItem>
                {(parents ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.phone ?? "no phone"} · {p.email ?? "no email"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Creates a new parent record for this student. Leave the name blank to skip linking a parent for now.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={newParentName}
                  onChange={(e) => setNewParentName(e.target.value)}
                  placeholder="Parent full name"
                  className="bg-surface"
                />
                <Input
                  value={newParentPhone}
                  onChange={(e) => setNewParentPhone(e.target.value)}
                  placeholder="Mobile number"
                  className="bg-surface"
                />
              </div>
              <Input
                type="email"
                value={newParentEmail}
                onChange={(e) => setNewParentEmail(e.target.value)}
                placeholder="Email address"
                className="bg-surface"
              />
              <p className="text-[11px] text-muted-foreground">Provide at least a mobile number or an email.</p>

              <label className="flex items-center gap-2 pt-1 text-xs font-medium">
                <Checkbox checked={createParentLogin} onCheckedChange={(v) => setCreateParentLogin(v === true)} />
                Create Parent Portal login (uses the parent's email above)
              </label>
            </div>
          )}
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Portal Access</Label>
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox checked={createStudentLogin} onCheckedChange={(v) => setCreateStudentLogin(v === true)} />
              Create Student Portal login (uses the student's email above)
            </label>
            {parentMode === "new" && newParentName.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Tip: tick the checkbox above the parent's email to set up their account at the same time — both will
                share the password below, signing in with their own emails.
              </p>
            )}

            {(createStudentLogin || (parentMode === "new" && newParentName.trim() && createParentLogin)) && (
              <div className="space-y-2 border-t border-border pt-2">
                <p className="text-[11px] text-muted-foreground">
                  Shared by every portal login checked above — each still signs in with their own email.
                </p>
                <div className="relative">
                  <Input
                    type={showPortalPassword ? "text" : "password"}
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder="Set a password (min. 6 characters)"
                    className="bg-surface pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPortalPassword((s) => !s)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPortalPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {isEdit && (
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {isEdit && (
          <>
            <div className="grid gap-1.5">
              <Label>Bus Route</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="bg-surface">
                  <SelectValue placeholder="Select route" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {(vehicles ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.route ?? v.number ?? v.id} {v.number ? `(${v.number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pickupPoint">Pickup Point</Label>
              <Input id="pickupPoint" name="pickupPoint" defaultValue={initial?.pickup_point ?? ""} placeholder="e.g. Maple Junction" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dropPoint">Drop Point</Label>
              <Input id="dropPoint" name="dropPoint" defaultValue={initial?.drop_point ?? ""} placeholder="e.g. Maple Junction" />
            </div>
          </>
        )}
        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (isEdit ? "Saving…" : "Adding…") : isEdit ? "Save Changes" : "Add Student"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const searchTerm = search.trim();
  const isSearching = searchTerm.length > 0;
  const { data: students, isLoading } = useStudents(true, {
    ...(isSearching ? { q: searchTerm } : {}),
    ...(!isSearching && classFilter ? { className: classFilter } : {}),
    ...(!isSearching && sectionFilter ? { section: sectionFilter } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
  });
  const { data: classes } = useClasses();
  const { data: parents } = useParents();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ApiStudent | null>(null);
  const [page, setPage] = useState(1);

  const hasSelection = Boolean(classFilter) && Boolean(sectionFilter);

  function handleClassChange(value: string) {
    setClassFilter(value);
    setSectionFilter("");
  }

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["students"] });
  }

  const parentsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parents ?? []) map.set(p.id, p.name);
    return map;
  }, [parents]);

  const classOptions = useMemo(
    () => Array.from(new Set((classes ?? []).map((c) => c.name))),
    [classes],
  );
  const sectionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (classes ?? [])
            .filter((c) => !classFilter || c.name === classFilter)
            .map((c) => c.section)
            .filter((c): c is string => Boolean(c)),
        ),
      ),
    [classes, classFilter],
  );

  const filtered = useMemo(() => {
    if (!hasSelection && !isSearching) return [];
    return students ?? [];
  }, [students, hasSelection, isSearching]);

  useEffect(() => {
    setPage(1);
  }, [search, classFilter, sectionFilter, statusFilter]);

  const { rows, pageCount } = usePaged(filtered, page, PER_PAGE);

  const total = students?.length ?? 0;
  const active = (students ?? []).filter((s) => s.status === "Active").length;
  const inactive = total - active;
  const avgAttendance = total ? Math.round((students ?? []).reduce((a, s) => a + (s.attendance ?? 0), 0) / total) : 0;

  async function handleDelete(s: ApiStudent) {
    try {
      const result = await api.delete<{ archived: boolean }>(`/students/${s.id}`);
      await invalidate();
      toast.success(result.archived ? `${s.name} archived because linked records exist` : `${s.name} deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete student");
    }
  }

  return (
    <div>
      <PageHeader
        title="Students"
        description="Manage enrolled students, profiles and records."
        breadcrumb={["Dashboard", "Students"]}
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add Student
              </Button>
            </DialogTrigger>
            <StudentFormDialog onDone={async () => { await invalidate(); setAddOpen(false); }} onClose={() => setAddOpen(false)} />
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <InfoCard label="Total Students" value={total} icon={Users} tone="navy" />
        <InfoCard label="Active" value={active} icon={UserCheck} tone="success" />
        <InfoCard label="Inactive" value={inactive} icon={UserX} tone="danger" />
        <InfoCard label="Avg Attendance" value={`${avgAttendance}%`} icon={Percent} tone="gold" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={classFilter} onValueChange={handleClassChange}>
              <SelectTrigger className="h-9 w-full bg-surface text-sm sm:w-[160px]">
                <SelectValue placeholder="Select Class" />
              </SelectTrigger>
              <SelectContent>
                {classOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sectionFilter} onValueChange={setSectionFilter} disabled={!classFilter}>
              <SelectTrigger className="h-9 w-full bg-surface text-sm sm:w-[160px]">
                <SelectValue placeholder="Select Section" />
              </SelectTrigger>
              <SelectContent>
                {sectionOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search any student by name…"
            />
            {(hasSelection || isSearching) && (
              <FilterSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={["Active", "Inactive"]}
                placeholder="Status"
              />
            )}
          </div>
        </div>

        {!hasSelection && !isSearching ? (
          <EmptyState
            icon={ListFilter}
            title="Search or select a class and section"
            description="Search by student name across the school, or choose a class and section to browse its students."
          />
        ) : isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState title="No students found" description="Try adjusting your search or filters." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Admission No.</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Fee Status</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Initials name={s.name} />
                          <Link
                            to={`/students/${s.id}`}
                            className="truncate font-medium hover:underline"
                          >
                            {s.name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.admission_no}</TableCell>
                      <TableCell>{s.class_name}</TableCell>
                      <TableCell>{s.section}</TableCell>
                      <TableCell className="truncate">{s.parent_id ? parentsById.get(s.parent_id) : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.fee_status ?? "Pending"} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status ?? "Active"} />
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions student={s} onEdit={() => setEditing(s)} onDelete={() => handleDelete(s)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 p-4 md:hidden">
              {rows.map((s) => (
                <div key={s.id} className="panel p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Initials name={s.name} />
                      <div className="min-w-0">
                        <Link
                          to={`/students/${s.id}`}
                          className="block truncate text-sm font-semibold hover:underline"
                        >
                          {s.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{s.admission_no}</p>
                      </div>
                    </div>
                    <RowActions student={s} onEdit={() => setEditing(s)} onDelete={() => handleDelete(s)} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <p>Class: <span className="text-foreground">{s.class_name} {s.section}</span></p>
                    <p>Parent: <span className="text-foreground">{s.parent_id ? parentsById.get(s.parent_id) : "—"}</span></p>
                  </div>
                  <div className="mt-3">
                    <StatusBadge status={s.status ?? "Active"} />
                  </div>
                </div>
              ))}
            </div>

            <Pager page={Math.min(page, pageCount)} pageCount={pageCount} onPage={setPage} total={filtered.length} />
          </>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <StudentFormDialog
            initial={editing}
            onDone={async () => { await invalidate(); setEditing(null); }}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function RowActions({
  student,
  onEdit,
  onDelete,
}: {
  student: ApiStudent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to={`/students/${student.id}`}>
              <Eye className="mr-2 h-4 w-4" /> View Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {student.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently remove the student record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete();
                setConfirmOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
