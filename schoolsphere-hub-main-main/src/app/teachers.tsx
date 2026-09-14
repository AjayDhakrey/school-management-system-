"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users,
  GraduationCap,
  Briefcase,
  UserX,
  MoreHorizontal,
  Plus,
  Mail,
  Phone,
  Calendar,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  EmptyState,
  Pager,
  Initials,
  usePaged,
  TableSkeleton,
} from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useTeachers,
  useStaff,
  useSubjects,
  useClasses,
  type ApiTeacher,
  type ApiStaff,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

type Mode = "Teaching" | "Non-Teaching";

const TEACHER_DESIGNATIONS = ["PGT", "TGT", "PRT", "Senior Teacher", "Subject Coordinator"];
const STAFF_DEPARTMENTS = ["Administration", "Accounts", "Library", "Transport"];
const STAFF_DESIGNATIONS = [
  "Accountant",
  "Librarian",
  "Transport Manager",
  "Receptionist",
  "Office Assistant",
  "Administrative Staff",
];

// Portal logins for STAFF are scoped to one of these four backend permission departments — a
// separate, fixed concept from the free-text profile "Department" above. Only these four map
// cleanly; a custom (+ Add New) department has no matching permission set.
const STAFF_DEPARTMENT_TO_PERMISSION_DEPT: Record<
  string,
  "ADMIN" | "ACCOUNTS" | "LIBRARY" | "TRANSPORT"
> = {
  Administration: "ADMIN",
  Accounts: "ACCOUNTS",
  Library: "LIBRARY",
  Transport: "TRANSPORT",
};

const TEACHER_DESIGNATIONS_KEY = "teacher-designations";
const STAFF_DEPARTMENTS_KEY = "staff-departments";
const STAFF_DESIGNATIONS_KEY = "staff-designations";

const ADD_NEW_VALUE = "__add_new__";

/** A Select that also offers a "+ Add New" item, which swaps in a text field to create and pick a value not in the list. */
function CreatableSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  onCreate,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder: string;
  onCreate: (value: string) => void | Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);

  async function confirmAdd() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await onCreate(trimmed);
      onValueChange(trimmed);
      setAdding(false);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add new option");
    } finally {
      setCreating(false);
    }
  }

  if (adding) {
    return (
      <div className="flex gap-1.5">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type new value"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void confirmAdd();
            }
            if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => void confirmAdd()}
          disabled={creating || !draft.trim()}
        >
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setAdding(false);
            setDraft("");
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => (v === ADD_NEW_VALUE ? setAdding(true) : onValueChange(v))}
    >
      <SelectTrigger id={id} className="bg-surface">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
        <SelectItem value={ADD_NEW_VALUE} className="font-medium text-primary">
          + Add New
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

// Unified row shape the UI renders, backed by either a teacher or staff record.
type StaffRow = {
  id: string;
  name: string;
  department: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  subjects: string[];
  classes: string[];
  joinedOn: string | null;
  raw: ApiTeacher | ApiStaff;
};

function parseJsonArray(value: string | undefined | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toRow(t: ApiTeacher): StaffRow {
  return {
    id: t.id,
    name: t.name,
    department: t.department,
    designation: t.designation,
    email: t.email,
    phone: t.phone,
    status: t.employment_status,
    subjects: parseJsonArray(t.assigned_subjects),
    classes: parseJsonArray(t.assigned_classes),
    joinedOn: t.joining_date,
    raw: t,
  };
}

function staffToRow(s: ApiStaff): StaffRow {
  return {
    id: s.id,
    name: s.name,
    department: s.department,
    designation: s.designation,
    email: s.email,
    phone: s.phone,
    status: s.employment_status,
    subjects: [],
    classes: [],
    joinedOn: null,
    raw: s,
  };
}

export default function Page({ mode: initialMode = "Teaching" }: { mode?: Mode }) {
  // Merged into one page — mode is switched in-place via the tabs below, no navigation involved.
  // The sidebar still links to /teaching-staff and /non-teaching-staff separately (unchanged),
  // each just seeds which tab this shared page opens on.
  const [mode, setMode] = useState<Mode>(initialMode);
  const isTeaching = mode === "Teaching";
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [designation, setDesignation] = useState("all");
  const [status, setStatus] = useState("all");
  const { data: teachers, isLoading: teachersLoading } = useTeachers(isTeaching, {
    ...(search ? { q: search } : {}),
    ...(department !== "all" ? { department } : {}),
    ...(status !== "all" ? { status } : {}),
  });
  const { data: staff, isLoading: staffLoading } = useStaff(!isTeaching, {
    ...(search ? { q: search } : {}),
    ...(department !== "all" ? { department } : {}),
    ...(status !== "all" ? { status } : {}),
  });
  const { data: subjects } = useSubjects(isTeaching);
  const { data: classes } = useClasses(isTeaching);
  const queryClient = useQueryClient();

  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? id;
  const classLabel = (id: string) => {
    const c = classes?.find((c) => c.id === id);
    return c ? `${c.name}-${c.section}` : id;
  };

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<StaffRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const isLoading = isTeaching ? teachersLoading : staffLoading;
  const allRows: StaffRow[] = useMemo(
    () => (isTeaching ? (teachers ?? []).map(toRow) : (staff ?? []).map(staffToRow)),
    [isTeaching, teachers, staff],
  );

  const departmentOptions = useMemo(
    () =>
      Array.from(new Set(allRows.map((r) => r.department).filter((d): d is string => Boolean(d)))),
    [allRows],
  );
  const designationOptions = useMemo(
    () =>
      Array.from(new Set(allRows.map((r) => r.designation).filter((d): d is string => Boolean(d)))),
    [allRows],
  );

  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      if (
        search &&
        !r.name.toLowerCase().includes(search.toLowerCase()) &&
        !r.id.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (department !== "all" && r.department !== department) return false;
      if (designation !== "all" && r.designation !== designation) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [allRows, search, department, designation, status]);

  const { rows, pageCount } = usePaged(filtered, page, 8);

  const totalFaculty = allRows.length;
  const teachingCount = isTeaching ? allRows.length : 0;
  const nonTeachingCount = isTeaching ? 0 : allRows.length;
  const onLeave = allRows.filter(
    (r) => r.status === "On Leave" || r.status === "INACTIVE" || r.status === "Inactive",
  ).length;

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: [isTeaching ? "teachers" : "staff"] });
  }

  async function handleToggleStatus(row: StaffRow) {
    const isActive = row.status.toLowerCase() === "active";
    const nextStatus = isActive ? "INACTIVE" : "ACTIVE";
    try {
      const basePath = isTeaching ? "/teachers" : "/staff";
      await api.patch(`${basePath}/${row.id}`, { employmentStatus: nextStatus });
      await invalidate();
      toast.success(`${row.name} marked ${nextStatus.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update status");
    }
  }

  async function handleDelete(row: StaffRow) {
    try {
      const basePath = isTeaching ? "/teachers" : "/staff";
      const result = await api.delete<{ archived: boolean }>(`${basePath}/${row.id}`);
      await invalidate();
      setSelected(null);
      toast.success(
        result.archived
          ? `${row.name} archived because linked records exist`
          : `${row.name} removed`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove staff member");
    }
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    // Filters from the previous tab rarely make sense on the other one (e.g. a teaching-only
    // department), so start clean on switch.
    setSearch("");
    setDepartment("all");
    setDesignation("all");
    setStatus("all");
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Staff Management"
        description="Manage your school's teaching and non-teaching staff in one place."
        breadcrumb={["Dashboard", "Staff Management"]}
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Staff
              </Button>
            </DialogTrigger>
            <StaffFormDialog
              isTeaching={isTeaching}
              onDone={async () => {
                await invalidate();
                setAddOpen(false);
              }}
              onClose={() => setAddOpen(false)}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Faculty" value={totalFaculty} icon={Users} tone="navy" />
        <InfoCard label="Teaching Staff" value={teachingCount} icon={GraduationCap} tone="info" />
        <InfoCard
          label="Non-Teaching Staff"
          value={nonTeachingCount}
          icon={Briefcase}
          tone="gold"
        />
        <InfoCard label="On Leave" value={onLeave} icon={UserX} tone="warning" />
      </div>

      <div className="mt-5">
        <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="Teaching">Teaching Staff</TabsTrigger>
            <TabsTrigger value="Non-Teaching">Non-Teaching Staff</TabsTrigger>
          </TabsList>
          <TabsContent value={mode} className="mt-4">
            <SectionCard
              title={mode === "Teaching" ? "Teaching Staff" : "Non-Teaching Staff"}
              subtitle={`${filtered.length} staff members`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <SearchInput
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setPage(1);
                    }}
                    placeholder="Search staff…"
                  />
                  <FilterSelect
                    value={department}
                    onChange={(v) => {
                      setDepartment(v);
                      setPage(1);
                    }}
                    options={departmentOptions}
                    placeholder="Department"
                  />
                  <FilterSelect
                    value={designation}
                    onChange={(v) => {
                      setDesignation(v);
                      setPage(1);
                    }}
                    options={designationOptions}
                    placeholder="Designation"
                  />
                  <FilterSelect
                    value={status}
                    onChange={(v) => {
                      setStatus(v);
                      setPage(1);
                    }}
                    options={["Active", "On Leave", "Inactive"]}
                    placeholder="Status"
                  />
                </div>
              }
              bodyClassName="p-0"
            >
              {isLoading ? (
                <TableSkeleton rows={6} cols={9} />
              ) : rows.length === 0 ? (
                <EmptyState
                  title="No staff found"
                  description="Try adjusting your search or filters."
                />
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Staff</th>
                          <th className="px-4 py-2.5 font-medium">Designation</th>
                          <th className="px-4 py-2.5 font-medium">Department</th>
                          {isTeaching && <th className="px-4 py-2.5 font-medium">Subjects</th>}
                          {isTeaching && <th className="px-4 py-2.5 font-medium">Classes</th>}
                          <th className="px-4 py-2.5 font-medium">Contact</th>
                          {isTeaching && <th className="px-4 py-2.5 font-medium">Joined</th>}
                          <th className="px-4 py-2.5 font-medium">Status</th>
                          <th className="px-4 py-2.5 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((t) => (
                          <tr
                            key={t.id}
                            className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                            onClick={() => setSelected(t)}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <Initials name={t.name} tone="navy" />
                                <span className="truncate font-medium">{t.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">{t.designation ?? "—"}</td>
                            <td className="px-4 py-2.5">{t.department ?? "—"}</td>
                            {isTeaching && (
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap gap-1">
                                  {t.subjects.length > 0 ? (
                                    t.subjects.map((s) => (
                                      <span
                                        key={s}
                                        className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] text-info"
                                      >
                                        {subjectName(s)}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                              </td>
                            )}
                            {isTeaching && (
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap gap-1">
                                  {t.classes.length > 0 ? (
                                    t.classes.map((c) => (
                                      <span
                                        key={c}
                                        className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
                                      >
                                        {classLabel(c)}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                              </td>
                            )}
                            <td className="px-4 py-2.5 text-muted-foreground">{t.phone ?? "—"}</td>
                            {isTeaching && (
                              <td className="px-4 py-2.5 text-muted-foreground">
                                {t.joinedOn ?? "—"}
                              </td>
                            )}
                            <td className="px-4 py-2.5">
                              <StatusBadge status={t.status} />
                            </td>
                            <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <RowActions
                                t={t}
                                onEdit={() => setEditing(t)}
                                onToggleStatus={() => handleToggleStatus(t)}
                                onDelete={() => handleDelete(t)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 p-4 md:hidden">
                    {rows.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelected(t)}
                        className="panel flex items-start gap-3 p-3 text-left"
                      >
                        <Initials name={t.name} tone="navy" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{t.name}</p>
                            <StatusBadge status={t.status} />
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {t.designation ?? "—"} · {t.department ?? "—"}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {t.phone ?? "—"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>

                  <Pager
                    page={Math.min(page, pageCount)}
                    pageCount={pageCount}
                    onPage={setPage}
                    total={filtered.length}
                  />
                </>
              )}
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <StaffProfile
              t={selected}
              isTeaching={isTeaching}
              onEdit={() => {
                setEditing(selected);
                setSelected(null);
              }}
              onToggleStatus={() => handleToggleStatus(selected)}
              onDelete={() => handleDelete(selected)}
              subjectName={subjectName}
              classLabel={classLabel}
            />
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <StaffFormDialog
            isTeaching={isTeaching}
            initial={editing}
            onDone={async () => {
              await invalidate();
              setEditing(null);
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function RowActions({
  t,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  t: StaffRow;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const isActive = t.status.toLowerCase() === "active";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleStatus}>
          {isActive ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StaffProfile({
  t,
  isTeaching,
  onEdit,
  onToggleStatus,
  onDelete,
  subjectName,
  classLabel,
}: {
  t: StaffRow;
  isTeaching: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  subjectName: (id: string) => string;
  classLabel: (id: string) => string;
}) {
  const isActive = t.status.toLowerCase() === "active";
  return (
    <div>
      <SheetHeader className="mb-4 text-left">
        <SheetTitle>Staff Profile</SheetTitle>
      </SheetHeader>
      <div className="flex items-center gap-3">
        <Initials name={t.name} tone="gold" className="h-14 w-14 text-base" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold">{t.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {t.designation ?? "—"} · {t.department ?? "—"}
          </p>
          <div className="mt-1">
            <StatusBadge status={t.status} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="panel p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> Email
          </p>
          <p className="mt-1 truncate font-medium">{t.email ?? "—"}</p>
        </div>
        <div className="panel p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5" /> Contact
          </p>
          <p className="mt-1 truncate font-medium">{t.phone ?? "—"}</p>
        </div>
        {isTeaching && (
          <div className="panel col-span-2 p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Joining Date
            </p>
            <p className="mt-1 font-medium">{t.joinedOn ?? "—"}</p>
          </div>
        )}
      </div>

      {isTeaching && t.subjects.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Subjects</p>
          <div className="flex flex-wrap gap-1.5">
            {t.subjects.map((s) => (
              <span key={s} className="rounded-full bg-info-soft px-2.5 py-1 text-xs text-info">
                {subjectName(s)}
              </span>
            ))}
          </div>
        </div>
      )}

      {isTeaching && t.classes.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Assigned Classes</p>
          <div className="flex flex-wrap gap-1.5">
            {t.classes.map((c) => (
              <span key={c} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {classLabel(c)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="outline" onClick={onToggleStatus}>
          {isActive ? "Deactivate" : "Activate"}
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={onDelete}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function StaffFormDialog({
  isTeaching,
  initial,
  onDone,
  onClose,
}: {
  isTeaching: boolean;
  initial?: StaffRow;
  onDone: () => void;
  onClose: () => void;
}) {
  const isEdit = Boolean(initial);
  const [submitting, setSubmitting] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState<string[]>(initial?.classes ?? []);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(initial?.subjects ?? []);
  const [classTeacherOf, setClassTeacherOf] = useState<string>("");
  const [designation, setDesignation] = useState(initial?.designation ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [createLogin, setCreateLogin] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  const { data: classes } = useClasses(isTeaching);
  const { data: subjects } = useSubjects(isTeaching);
  const queryClient = useQueryClient();

  const designationKey = isTeaching ? TEACHER_DESIGNATIONS_KEY : STAFF_DESIGNATIONS_KEY;
  const [extraDesignations, setExtraDesignations] = useState<string[]>([]);
  const [extraDepartments, setExtraDepartments] = useState<string[]>([]);
  useEffect(() => {
    api
      .get<Record<string, string[]>>("/school-options")
      .then((options) => {
        setExtraDesignations(options[designationKey] ?? []);
        setExtraDepartments(options[STAFF_DEPARTMENTS_KEY] ?? []);
      })
      .catch(() => undefined);
  }, [designationKey]);

  const designationOptions = Array.from(
    new Set([...(isTeaching ? TEACHER_DESIGNATIONS : STAFF_DESIGNATIONS), ...extraDesignations]),
  );
  // Teaching "Department" mirrors the school's real Subjects list (same data as the Subjects
  // checkboxes below), so adding one there creates an actual Subject rather than a local-only label.
  const departmentOptions = isTeaching
    ? (subjects ?? []).map((s) => s.name)
    : Array.from(new Set([...STAFF_DEPARTMENTS, ...extraDepartments]));

  async function addDesignation(value: string) {
    await api.post("/school-options", { type: designationKey, value });
    setExtraDesignations((current) => (current.includes(value) ? current : [...current, value]));
  }

  async function addDepartment(value: string) {
    if (isTeaching) {
      await api.post("/subjects", { name: value });
      await queryClient.invalidateQueries({ queryKey: ["subjects"] });
    } else {
      await api.post("/school-options", { type: STAFF_DEPARTMENTS_KEY, value });
      setExtraDepartments((current) => (current.includes(value) ? current : [...current, value]));
    }
  }

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();

    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (createLogin && !email) {
      toast.error("Add an email above to create a portal login");
      return;
    }
    if (createLogin && portalPassword.length < 6) {
      toast.error("Portal password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      if (isTeaching) {
        const body = {
          name,
          department: department || null,
          designation: designation || null,
          email: email || null,
          phone: phone || null,
          assignedClasses: selectedClasses,
          assignedSubjects: selectedSubjects,
          ...(createLogin ? { login: { email, password: portalPassword } } : {}),
          ...(isEdit ? {} : { employmentStatus: "Active" }),
        };
        let teacherId: string;
        if (isEdit) {
          await api.patch(`/teachers/${initial!.id}`, body);
          teacherId = initial!.id;
        } else {
          teacherId = (await api.post<{ id: string }>("/teachers", body)).id;
        }
        if (classTeacherOf) {
          await api.patch(`/classes/${classTeacherOf}`, { classTeacherId: teacherId });
          await queryClient.invalidateQueries({ queryKey: ["classes"] });
        }
      } else {
        const body = {
          name,
          department: department || null,
          designation: designation || null,
          email: email || null,
          phone: phone || null,
          ...(createLogin ? { login: { email, password: portalPassword } } : {}),
          ...(isEdit ? {} : { employmentStatus: "Active" }),
        };
        let staffId: string;
        if (isEdit) {
          await api.patch(`/staff/${initial!.id}`, body);
          staffId = initial!.id;
        } else {
          staffId = (await api.post<{ id: string }>("/staff", body)).id;
        }
      }
      toast.success(
        isEdit ? "Staff member updated successfully" : "Staff member added successfully",
      );
      onDone();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : `Failed to ${isEdit ? "update" : "add"} staff member`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${initial!.name}` : "Add Staff"}</DialogTitle>
      </DialogHeader>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="s-name">Full Name</Label>
          <Input
            id="s-name"
            name="name"
            defaultValue={initial?.name}
            placeholder="e.g. Amelia Ross"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-des">Designation</Label>
          <CreatableSelect
            id="s-des"
            value={designation}
            onValueChange={setDesignation}
            options={designationOptions}
            placeholder="Select designation"
            onCreate={addDesignation}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-dep">Department</Label>
          <CreatableSelect
            id="s-dep"
            value={department}
            onValueChange={setDepartment}
            options={departmentOptions}
            placeholder="Select department"
            onCreate={addDepartment}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-con">Contact</Label>
          <Input
            id="s-con"
            name="phone"
            defaultValue={initial?.phone ?? ""}
            placeholder="+1 (555) 000-0000"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="s-email">Email</Label>
          <Input
            id="s-email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            placeholder="name@everbright.edu"
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Portal Access</Label>
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox checked={createLogin} onCheckedChange={(v) => setCreateLogin(v === true)} />
              Create Portal Login (uses the email above)
            </label>
            {createLogin && !isTeaching && !STAFF_DEPARTMENT_TO_PERMISSION_DEPT[department] && (
              <p className="text-[11px] text-muted-foreground">
                Department "{department || "none selected"}" has no default permission set — pick
                Administration, Accounts, Library or Transport for standard access, or set
                permissions manually afterwards from Roles &amp; Permissions.
              </p>
            )}
            {createLogin && (
              <div className="space-y-2 border-t border-border pt-2">
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
                    {showPortalPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {isTeaching && (
          <>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Subjects</Label>
              <div className="flex flex-wrap gap-3 rounded-lg border border-border p-2.5">
                {(subjects ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">No subjects set up yet.</span>
                )}
                {(subjects ?? []).map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={selectedSubjects.includes(s.id)}
                      onCheckedChange={() => toggle(selectedSubjects, setSelectedSubjects, s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Assigned Classes</Label>
              <div className="flex flex-wrap gap-3 rounded-lg border border-border p-2.5">
                {(classes ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">No classes set up yet.</span>
                )}
                {(classes ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={selectedClasses.includes(c.id)}
                      onCheckedChange={() => toggle(selectedClasses, setSelectedClasses, c.id)}
                    />
                    {c.name}-{c.section}
                  </label>
                ))}
              </div>
            </div>

            {selectedClasses.length > 0 && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Make Class Teacher Of (optional)</Label>
                <Select value={classTeacherOf} onValueChange={setClassTeacherOf}>
                  <SelectTrigger className="bg-surface">
                    <SelectValue placeholder="Not a class teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedClasses.map((cid) => {
                      const c = classes?.find((x) => x.id === cid);
                      return c ? (
                        <SelectItem key={cid} value={cid}>
                          {c.name}-{c.section}
                        </SelectItem>
                      ) : null;
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (isEdit ? "Saving…" : "Adding…") : isEdit ? "Save Changes" : "Add Staff"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
