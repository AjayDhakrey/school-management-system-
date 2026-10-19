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
  BookOpen,
  AlertTriangle,
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
  useSubjectMappings,
  type ApiTeacher,
  type ApiStaff,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/shared/PhoneInput";

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

const MAX_CLASS_CHIPS = 3;

const STAFF_STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  ACTIVE: { label: "Active", tone: "success" },
  ON_LEAVE: { label: "On Leave", tone: "warning" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
};

// A steady colour per class, so each class teacher's tag is easy to tell apart.
const CLASS_TONES = [
  "border-sky-500/30 bg-sky-500/10 text-sky-700",
  "border-violet-500/30 bg-violet-500/10 text-violet-700",
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  "border-amber-500/30 bg-amber-500/10 text-amber-700",
  "border-rose-500/30 bg-rose-500/10 text-rose-700",
  "border-cyan-500/30 bg-cyan-500/10 text-cyan-700",
  "border-orange-500/30 bg-orange-500/10 text-orange-700",
  "border-teal-500/30 bg-teal-500/10 text-teal-700",
];
function classTone(label: string) {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CLASS_TONES[hash % CLASS_TONES.length]!;
}

/** "2025-09-07" → "7 Sep 2025". */
function formatJoined(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Page({ mode = "Teaching" }: { mode?: Mode }) {
  // One page per sidebar link: /teaching-staff and /non-teaching-staff each show only their own
  // list (App.tsx keys the routes so filters start fresh when switching between them).
  const isTeaching = mode === "Teaching";
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [designation, setDesignation] = useState("all");
  const [status, setStatus] = useState("all");
  // Search and filters apply client-side below; the rows have no `q`/`status` columns to query.
  const { data: teachers, isLoading: teachersLoading } = useTeachers(isTeaching);
  const { data: staff, isLoading: staffLoading } = useStaff(!isTeaching);
  const { data: subjects } = useSubjects(isTeaching);
  const { data: classes } = useClasses(isTeaching);
  const queryClient = useQueryClient();

  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? id;
  const classLabel = (id: string) => {
    const c = classes?.find((c) => c.id === id);
    return c ? `${c.name}-${c.section}` : id;
  };
  // Which section each teacher is Class Teacher of (one at most).
  const classTeacherOf = new Map(
    (classes ?? [])
      .filter((c) => c.class_teacher_id && c.status !== "ARCHIVED")
      .map((c) => [c.class_teacher_id!, `${c.name}-${c.section}`]),
  );

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
      // Stored as ACTIVE / ON_LEAVE / INACTIVE; the filter offers "Active" / "On Leave" / "Inactive".
      if (status !== "all" && r.status !== status.toUpperCase().replace(/\s+/g, "_")) return false;
      return true;
    });
  }, [allRows, search, department, designation, status]);

  const { rows, pageCount } = usePaged(filtered, page, 8);

  const totalCount = allRows.length;
  const activeCount = allRows.filter((r) => r.status === "ACTIVE").length;
  const onLeave = allRows.filter((r) => r.status === "ON_LEAVE" || r.status === "INACTIVE").length;

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

  return (
    <div>
      <PageHeader
        title={isTeaching ? "Teaching Staff" : "Non-Teaching Staff"}
        description={
          isTeaching
            ? "Manage your school's teachers, their subjects and classes."
            : "Manage your school's administrative and support staff."
        }
        breadcrumb={["Dashboard", isTeaching ? "Teaching Staff" : "Non-Teaching Staff"]}
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
        <InfoCard
          label={isTeaching ? "Total Teachers" : "Total Staff"}
          value={totalCount}
          icon={isTeaching ? GraduationCap : Briefcase}
          tone="navy"
        />
        <InfoCard label="Active" value={activeCount} icon={Users} tone="success" />
        <InfoCard
          label="Departments"
          value={departmentOptions.length}
          icon={Briefcase}
          tone="info"
        />
        <InfoCard label="On Leave" value={onLeave} icon={UserX} tone="warning" />
      </div>

      <div className="mt-5">
        <SectionCard
          title={mode === "Teaching" ? "Teaching Staff" : "Non-Teaching Staff"}
          subtitle={`${filtered.length} staff members`}
          action={
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <SearchInput
                className="col-span-2"
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
                className="col-span-2"
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
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3">Staff member</th>
                      {isTeaching && <th className="px-4 py-3">Class teacher</th>}
                      {isTeaching && <th className="px-4 py-3">Teaches</th>}
                      <th className="px-4 py-3">Phone</th>
                      {isTeaching && <th className="px-4 py-3">Joined</th>}
                      <th className="px-4 py-3">Status</th>
                      <th className="w-12 px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const shownClasses = t.classes.slice(0, MAX_CLASS_CHIPS);
                      const hiddenClasses = t.classes.slice(MAX_CLASS_CHIPS);
                      const st = STAFF_STATUS[t.status] ?? {
                        label: t.status,
                        tone: "neutral" as const,
                      };
                      const niceName = t.name.replace(/\b\w/g, (ch) => ch.toUpperCase());
                      const dot =
                        st.tone === "success"
                          ? "bg-success"
                          : st.tone === "warning"
                            ? "bg-warning"
                            : "bg-muted-foreground/50";
                      return (
                        <tr
                          key={t.id}
                          className="group cursor-pointer border-b border-border/60 align-middle transition-colors last:border-0 hover:bg-primary/[0.03]"
                          onClick={() => setSelected(t)}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex min-w-[220px] items-center gap-3">
                              <Initials name={niceName} tone="navy" className="h-10 w-10" />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground group-hover:text-primary">
                                  {niceName}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  {t.designation && (
                                    <span className="rounded-md bg-primary/10 px-1.5 py-px text-[10px] font-bold tracking-wide text-primary uppercase">
                                      {t.designation}
                                    </span>
                                  )}
                                  <span className="truncate text-xs text-muted-foreground">
                                    {t.department ?? "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {isTeaching && (
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {classTeacherOf.get(t.id) ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold capitalize",
                                    classTone(classTeacherOf.get(t.id)!),
                                  )}
                                >
                                  <GraduationCap className="h-3.5 w-3.5" />
                                  {classTeacherOf.get(t.id)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground/60">—</span>
                              )}
                            </td>
                          )}
                          {isTeaching && (
                            <td className="px-4 py-3.5">
                              {t.subjects.length || t.classes.length ? (
                                <div className="max-w-[300px] space-y-1.5">
                                  {t.subjects.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {t.subjects.map((sid) => (
                                        <span
                                          key={sid}
                                          className="inline-flex items-center gap-1 rounded-full border border-info/20 bg-info-soft px-2 py-0.5 text-[11px] font-semibold capitalize text-info"
                                        >
                                          <BookOpen className="h-3 w-3" />
                                          {subjectName(sid)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {t.classes.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1">
                                      {shownClasses.map((c) => (
                                        <span
                                          key={c}
                                          className="whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium capitalize text-foreground/80"
                                        >
                                          {classLabel(c)}
                                        </span>
                                      ))}
                                      {hiddenClasses.length > 0 && (
                                        <span
                                          title={hiddenClasses.map(classLabel).join(", ")}
                                          className="whitespace-nowrap rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"
                                        >
                                          +{hiddenClasses.length}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/70">
                                  Not assigned
                                </span>
                              )}
                            </td>
                          )}

                          <td className="px-4 py-3.5">
                            <p className="flex items-center gap-1.5 whitespace-nowrap text-foreground/85">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              {t.phone ? (
                                <span className="tabular-nums">
                                  {t.phone.replace(/^(\d{5})(\d{5})$/, "$1 $2")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60">No phone</span>
                              )}
                            </p>
                          </td>

                          {isTeaching && (
                            <td className="whitespace-nowrap px-4 py-3.5">
                              <p className="text-foreground/85">{formatJoined(t.joinedOn)}</p>
                            </td>
                          )}

                          <td className="whitespace-nowrap px-4 py-3.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium">
                              <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                            <RowActions
                              t={t}
                              onEdit={() => setEditing(t)}
                              onToggleStatus={() => handleToggleStatus(t)}
                              onDelete={() => handleDelete(t)}
                            />
                          </td>
                        </tr>
                      );
                    })}
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
                        <StatusBadge
                          status={STAFF_STATUS[t.status]?.label ?? t.status}
                          tone={STAFF_STATUS[t.status]?.tone ?? "neutral"}
                        />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.designation ?? "—"} · {t.department ?? "—"}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {t.phone ?? "—"}
                      </p>
                      {isTeaching && classTeacherOf.get(t.id) && (
                        <span
                          className={cn(
                            "mt-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold capitalize",
                            classTone(classTeacherOf.get(t.id)!),
                          )}
                        >
                          <GraduationCap className="h-3 w-3" />
                          Class teacher · {classTeacherOf.get(t.id)}
                        </span>
                      )}
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
              classTeacherOf={(classes ?? [])
                .filter((c) => c.class_teacher_id === selected.id && c.status !== "ARCHIVED")
                .map((c) => `${c.name}-${c.section}`)}
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
  classTeacherOf = [],
}: {
  t: StaffRow;
  isTeaching: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  subjectName: (id: string) => string;
  classLabel: (id: string) => string;
  /** Classes this teacher is the Class Teacher of. */
  classTeacherOf?: string[];
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
            <StatusBadge
              status={STAFF_STATUS[t.status]?.label ?? t.status}
              tone={STAFF_STATUS[t.status]?.tone ?? "neutral"}
            />
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

      {isTeaching && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Class Teacher of</p>
            {classTeacherOf.length ? (
              <p className="truncate font-semibold capitalize">{classTeacherOf.join(", ")}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Not a class teacher</p>
            )}
          </div>
        </div>
      )}

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
  const { data: classes } = useClasses(isTeaching);
  // Blank by default; when editing, starts on the class this teacher already heads (if any).
  const currentClassTeacherOf =
    (initial &&
      (classes ?? []).find((c) => c.class_teacher_id === initial.id && c.status !== "ARCHIVED")
        ?.id) ||
    "";
  const [classTeacherOf, setClassTeacherOf] = useState<string>(currentClassTeacherOf);
  const [classTeacherTouched, setClassTeacherTouched] = useState(false);
  useEffect(() => {
    if (!classTeacherTouched) setClassTeacherOf(currentClassTeacherOf);
  }, [currentClassTeacherOf, classTeacherTouched]);
  // Subjects in the picked classes that another teacher already teaches.
  const { data: mappingsData } = useSubjectMappings(undefined, isTeaching);
  const [replaceOthers, setReplaceOthers] = useState(false);
  const conflicts = (mappingsData ?? []).filter(
    (m) =>
      m.teacher_id &&
      m.teacher_id !== initial?.id &&
      selectedClasses.includes(m.class_id) &&
      selectedSubjects.includes(m.subject_id),
  );

  // Unticking that class under Assigned Classes also clears it here.
  useEffect(() => {
    if (classTeacherOf && !selectedClasses.includes(classTeacherOf)) setClassTeacherOf("");
  }, [selectedClasses, classTeacherOf]);
  const [designation, setDesignation] = useState(initial?.designation ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [createLogin, setCreateLogin] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");
  const [showPortalPassword, setShowPortalPassword] = useState(false);
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
    const joiningDate = String(form.get("joiningDate") ?? "").trim();

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
    if (isTeaching && conflicts.length && !replaceOthers) {
      toast.error(
        "Some subjects are already taught by another teacher — tick “Replace them” or untick those classes/subjects",
      );
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
          joiningDate: joiningDate || null,
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
        // One class per Class Teacher: clear the old class first, then set the new one.
        if (classTeacherOf !== currentClassTeacherOf) {
          if (currentClassTeacherOf) {
            await api.patch(`/classes/${currentClassTeacherOf}`, { classTeacherId: null });
          }
          if (classTeacherOf) {
            await api.patch(`/classes/${classTeacherOf}`, { classTeacherId: teacherId });
          }
          await queryClient.invalidateQueries({ queryKey: ["classes"] });
        }
        await queryClient.invalidateQueries({
          predicate: (q) => String(q.queryKey[0]).startsWith("subject-mappings"),
        });
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
          <PhoneInput id="s-con" name="phone" defaultValue={initial?.phone ?? ""} />
        </div>
        <div className={cn("grid gap-1.5", !isTeaching && "sm:col-span-2")}>
          <Label htmlFor="s-email">Email</Label>
          <Input
            id="s-email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            placeholder="name@everbright.edu"
          />
        </div>
        {isTeaching && (
          <div className="grid gap-1.5">
            <Label htmlFor="s-joined">Joining Date</Label>
            <Input
              id="s-joined"
              name="joiningDate"
              type="date"
              className="w-full min-w-0"
              defaultValue={
                initial?.joinedOn ?? (isEdit ? "" : new Date().toISOString().slice(0, 10))
              }
            />
          </div>
        )}

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

            {conflicts.length > 0 && (
              <div className="rounded-xl border border-warning/40 bg-warning-soft/40 p-3 sm:col-span-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                  <AlertTriangle className="h-4 w-4" /> Already assigned to another teacher
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {conflicts.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-1">
                      <span className="font-semibold">{m.subject_name}</span>
                      <span className="text-muted-foreground">in</span>
                      <span className="font-semibold capitalize">
                        {m.class_name}-{m.section}
                      </span>
                      <span className="text-muted-foreground">is taught by</span>
                      <span className="font-semibold">{m.teacher_name ?? "another teacher"}</span>
                    </li>
                  ))}
                </ul>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                    checked={replaceOthers}
                    onChange={(e) => setReplaceOthers(e.target.checked)}
                  />
                  <span>
                    <b>Replace them</b> — remove the old teacher
                    {conflicts.length === 1 ? "" : "s"} from{" "}
                    {conflicts.length === 1 ? "this subject" : "these subjects"} and assign this
                    teacher instead. Otherwise untick those classes or subjects.
                  </span>
                </label>
              </div>
            )}

            {selectedClasses.length > 0 && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Make Class Teacher Of (optional)</Label>
                <Select
                  value={classTeacherOf || "none"}
                  onValueChange={(v) => {
                    setClassTeacherTouched(true);
                    setClassTeacherOf(v === "none" ? "" : v);
                  }}
                >
                  <SelectTrigger className="bg-surface">
                    <SelectValue placeholder="Not a class teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not a class teacher</SelectItem>
                    {selectedClasses.map((cid) => {
                      const c = classes?.find((x) => x.id === cid);
                      if (!c) return null;
                      // A class that already has a different Class Teacher can't be picked.
                      const other =
                        c.class_teacher_id && c.class_teacher_id !== initial?.id
                          ? c.class_teacher_id
                          : null;
                      return (
                        <SelectItem key={cid} value={cid} disabled={Boolean(other)}>
                          {c.name}-{c.section}
                          {other ? " · already has a class teacher" : ""}
                        </SelectItem>
                      );
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
