"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Users2, Layers, GraduationCap, Pencil, UserRound, Trash2 } from "lucide-react";
import { PageHeader, Initials, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAcademicYears, useClasses, useRooms, useTeachers, useStudents, type ApiClass } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type ClassGroup = {
  name: string;
  academicYearId: string | null;
  academicYearName: string | null;
  sections: ApiClass[];
};

/**
 * Deletes a class-section. The database refuses to delete one that past records still point at
 * (attendance, fees, exams, timetable…); that one is archived instead — it disappears from every
 * list but the history keeps its class.
 */
async function removeClassRow(id: string): Promise<"deleted" | "archived"> {
  try {
    await api.delete(`/classes/${id}`);
    return "deleted";
  } catch (err) {
    const inUse =
      err instanceof ApiError && /in use|archive|foreign key|still referenced/i.test(err.message);
    if (!inUse) throw err;
    await api.patch(`/classes/${id}`, { status: "ARCHIVED", classTeacherId: null });
    return "archived";
  }
}

const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareClasses(a: ApiClass, b: ApiClass) {
  return naturalCollator.compare(a.name, b.name) || naturalCollator.compare(a.section, b.section);
}

export default function Page() {
  const { data: classes, isLoading } = useClasses();
  const { data: teachers } = useTeachers();
  const { data: students } = useStudents();
  const { data: academicYears } = useAcademicYears();
  const { data: rooms } = useRooms();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [manageGroup, setManageGroup] = useState<ClassGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<ClassGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editRow, setEditRow] = useState<ApiClass | null>(null);

  // Archived classes (deleted while still referenced by past records) stay out of every list.
  const classRows = useMemo(
    () => (classes ?? []).filter((c) => c.status !== "ARCHIVED").sort(compareClasses),
    [classes],
  );
  const teacherRows = teachers ?? [];
  const studentRows = students ?? [];

  const teacherName = (id: string | null) => teacherRows.find((t) => t.id === id)?.name ?? "Unassigned";
  const studentCount = (classId: string) => studentRows.filter((s) => s.class_id === classId).length;

  const groups: ClassGroup[] = useMemo(() => {
    const map = new Map<string, ApiClass[]>();
    for (const c of classRows) {
      const key = `${c.academic_year_id ?? "legacy"}:${c.name}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.values())
      .map((sections) => {
        const sortedSections = [...sections].sort((a, b) =>
          naturalCollator.compare(a.section, b.section),
        );
        return {
          name: sortedSections[0]!.name,
          academicYearId: sortedSections[0]!.academic_year_id,
          academicYearName: sortedSections[0]!.academic_year_name,
          sections: sortedSections,
        };
      })
      .sort((a, b) => naturalCollator.compare(a.name, b.name));
  }, [classRows]);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["classes"] });
  }

  /** Deletes every section of a class. Refused while students are still enrolled in it. */
  async function confirmDeleteClass() {
    if (!deleteGroup) return;
    setDeleting(true);
    let removed = 0;
    try {
      let archived = 0;
      for (const section of deleteGroup.sections) {
        if ((await removeClassRow(section.id)) === "archived") archived += 1;
        removed += 1;
      }
      toast.success(
        archived
          ? `${deleteGroup.name} removed — kept in the archive because past records (attendance, fees, exams…) use it`
          : `${deleteGroup.name} deleted`,
      );
      setDeleteGroup(null);
    } catch (err) {
      const reason = err instanceof ApiError ? err.message : "Failed to delete class";
      toast.error(
        removed
          ? `${reason} (${removed} of ${deleteGroup.sections.length} sections were deleted)`
          : reason,
      );
    } finally {
      setDeleting(false);
      await invalidate();
    }
  }

  // Keep the sheet's manageGroup in sync with fresh data after mutations.
  const liveManageGroup = manageGroup ? groups.find((g) => g.name === manageGroup.name && g.academicYearId === manageGroup.academicYearId) ?? null : null;

  return (
    <div>
      <PageHeader
        title="Classes & Sections"
        description="Organise classes, sections and class teacher assignments."
        breadcrumb={["Dashboard", "Classes & Sections"]}
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Create Class
              </Button>
            </DialogTrigger>
            <ClassFormDialog
              title="Create Class"
              teachers={teacherRows.map((t) => ({ id: t.id, name: t.name }))}
              academicYears={academicYears ?? []}
              rooms={rooms ?? []}
              onDone={async () => { await invalidate(); setCreateOpen(false); }}
              onClose={() => setCreateOpen(false)}
            />
          </Dialog>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : groups.length === 0 ? (
        <EmptyState title="No classes found" description="Create a class to get started." icon={GraduationCap} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {groups.map((g) => {
            const totalStudents = g.sections.reduce((sum, s) => sum + studentCount(s.id), 0);
            return (
              <div
                key={`${g.academicYearId}:${g.name}`}
                className="rounded-2xl border border-border bg-card p-3 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[15px] font-bold capitalize leading-tight">{g.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {totalStudents} students · {g.sections.length}{" "}
                      {g.sections.length === 1 ? "section" : "sections"}
                      {g.academicYearName ? ` · ${g.academicYearName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 rounded-lg"
                      aria-label={`Manage sections of ${g.name}`}
                      title="Manage sections"
                      onClick={() => setManageGroup(g)}
                    >
                      <Layers className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      aria-label={`Edit ${g.name}`}
                      title="Edit class"
                      onClick={() => setEditRow(g.sections[0] ?? null)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive-soft hover:text-destructive"
                      aria-label={`Delete ${g.name}`}
                      title="Delete class"
                      onClick={() => setDeleteGroup(g)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <ul className="mt-2.5 divide-y divide-border rounded-xl bg-muted/40">
                  {g.sections.map((s) => {
                    const teacher = s.class_teacher_id ? teacherName(s.class_teacher_id) : null;
                    return (
                      <li key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-info-soft text-[11px] font-bold text-info">
                          {s.section}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-semibold">Sec {s.section}</span>
                          <span className={cn("ml-1.5", teacher ? "text-muted-foreground" : "italic text-muted-foreground/70")}>
                            {teacher ?? "No class teacher"}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 font-semibold text-muted-foreground">
                          <Users2 className="h-3 w-3" /> {studentCount(s.id)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <SectionCard title="Class Overview" subtitle={`${groups.length} classes across the school`} bodyClassName="p-0">
          {classRows.length === 0 ? (
            <EmptyState title="No classes yet" description="Classes you create will appear here." />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Class</th>
                      <th className="px-4 py-2.5 font-medium">Section</th>
                      <th className="px-4 py-2.5 font-medium">Class Teacher</th>
                      <th className="px-4 py-2.5 font-medium">Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classRows.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">{c.name}</td>
                        <td className="px-4 py-2.5">{c.section}</td>
                        <td className="px-4 py-2.5">{teacherName(c.class_teacher_id)}</td>
                        <td className="px-4 py-2.5">{studentCount(c.id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="grid grid-cols-2 gap-2.5 p-3 md:hidden">
                {classRows.map((c) => {
                  const teacher = c.class_teacher_id ? teacherName(c.class_teacher_id) : null;
                  const count = studentCount(c.id);
                  return (
                    <li
                      key={c.id}
                      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                    >
                      <div className="p-2.5 pb-2">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="truncate text-sm font-bold capitalize">{c.name}</p>
                          <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-primary/10 px-1.5 text-[11px] font-bold text-primary">
                            {c.section}
                          </span>
                        </div>
                        <div className="mt-2 flex min-w-0 items-center gap-1.5">
                          {teacher ? (
                            <Initials name={teacher} tone="navy" className="h-5 w-5 text-[8px]" />
                          ) : (
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted">
                              <UserRound className="h-3 w-3 text-muted-foreground" />
                            </span>
                          )}
                          <p
                            className={cn(
                              "truncate text-[11px]",
                              teacher ? "font-medium text-foreground/80" : "italic text-muted-foreground",
                            )}
                          >
                            {teacher ?? "No class teacher"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center gap-1 border-t border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                        <Users2 className="h-3 w-3" />
                        <span className="font-semibold text-foreground">{count}</span>
                        {count === 1 ? "student" : "students"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </SectionCard>
      </div>

      <AlertDialog open={!!deleteGroup} onOpenChange={(o) => !o && !deleting && setDeleteGroup(null)}>
        <AlertDialogContent>
          {deleteGroup &&
            (() => {
              const enrolled = deleteGroup.sections.reduce((sum, sec) => sum + studentCount(sec.id), 0);
              const sectionList = deleteGroup.sections.map((sec) => sec.section).join(", ");
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="capitalize">
                      {enrolled ? `Can't delete ${deleteGroup.name}` : `Delete ${deleteGroup.name}?`}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {enrolled ? (
                        <>
                          {enrolled} student{enrolled === 1 ? " is" : "s are"} still enrolled in{" "}
                          {deleteGroup.name}. Move {enrolled === 1 ? "that student" : "them"} to another
                          class first, then delete it.
                        </>
                      ) : (
                        <>
                          This removes {deleteGroup.name}
                          {sectionList ? ` (section${deleteGroup.sections.length === 1 ? "" : "s"} ${sectionList})` : ""}
                          {deleteGroup.academicYearName ? ` for ${deleteGroup.academicYearName}` : ""}.
                          If past attendance, fees or exams use it, it's archived instead so that
                          history is kept.
                        </>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>
                      {enrolled ? "Close" : "Cancel"}
                    </AlertDialogCancel>
                    {!enrolled && (
                      <Button
                        variant="destructive"
                        disabled={deleting}
                        onClick={confirmDeleteClass}
                        className="gap-1.5"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleting ? "Deleting…" : "Delete Class"}
                      </Button>
                    )}
                  </AlertDialogFooter>
                </>
              );
            })()}
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!manageGroup} onOpenChange={(o) => !o && setManageGroup(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {liveManageGroup && (
            <ManageSections
              g={liveManageGroup}
              teachers={teacherRows.map((t) => ({ id: t.id, name: t.name }))}
              studentCount={studentCount}
              onChanged={invalidate}
            />
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        {editRow && (
          <ClassFormDialog
            title={`Edit ${editRow.name}`}
            initial={editRow}
            sectionRows={
              groups.find((g) => g.sections.some((sec) => sec.id === editRow.id))?.sections ?? [editRow]
            }
            teachers={teacherRows.map((t) => ({ id: t.id, name: t.name }))}
            academicYears={academicYears ?? []}
            rooms={rooms ?? []}
            onDone={async () => { await invalidate(); setEditRow(null); }}
            onClose={() => setEditRow(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function ManageSections({
  g,
  teachers,
  studentCount,
  onChanged,
}: {
  g: ClassGroup;
  teachers: { id: string; name: string }[];
  studentCount: (classId: string) => number;
  onChanged: () => Promise<void>;
}) {
  const [addingSection, setAddingSection] = useState(false);
  const [newSection, setNewSection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const existingSections = g.sections.map((s) => s.section);

  async function addSection() {
    if (!newSection.trim()) {
      toast.error("Enter a section name");
      return;
    }
    if (existingSections.includes(newSection.trim())) {
      toast.error("Section already exists");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/classes", { name: g.name, section: newSection.trim(), classTeacherId: null, academicYearId: g.academicYearId });
      await onChanged();
      toast.success("New section added");
      setNewSection("");
      setAddingSection(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add section");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSection(id: string, section: string) {
    const enrolled = studentCount(id);
    if (enrolled) {
      toast.error(
        `Section ${section} still has ${enrolled} student${enrolled === 1 ? "" : "s"} — move them to another section first`,
      );
      return;
    }
    if (!confirm(`Delete section ${section} of ${g.name}? This can't be undone.`)) return;
    setSubmitting(true);
    try {
      const result = await removeClassRow(id);
      await onChanged();
      toast.success(
        result === "archived"
          ? `Section ${section} removed — kept in the archive because past records use it`
          : `Section ${section} removed`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove section");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <SheetHeader className="mb-4 text-left">
        <SheetTitle>{g.name} — Sections</SheetTitle>
      </SheetHeader>
      <div className="space-y-3">
        {g.sections.map((s) => {
          const teacher = teachers.find((t) => t.id === s.class_teacher_id)?.name ?? "Unassigned";
          const count = studentCount(s.id);
          return (
            <div key={s.id} className="panel p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold-soft text-sm font-bold text-gold-foreground">{s.section}</span>
                  <div>
                    <p className="text-sm font-semibold">Section {s.section}</p>
                    <p className="text-xs text-muted-foreground">{teacher}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{count} students</span>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" disabled={submitting} onClick={() => deleteSection(s.id, s.section)}>
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {addingSection ? (
        <div className="mt-4 flex gap-2">
          <Input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="Section name" maxLength={30} />
          <Button disabled={submitting} onClick={addSection}>Add</Button>
          <Button variant="outline" onClick={() => setAddingSection(false)}>Cancel</Button>
        </div>
      ) : (
        <Button className="mt-4 w-full gap-1.5" onClick={() => setAddingSection(true)}>
          <Layers className="h-4 w-4" /> Add Section
        </Button>
      )}
    </div>
  );
}

const SECTION_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function ClassFormDialog({
  title,
  initial,
  sectionRows,
  teachers,
  academicYears,
  rooms,
  onDone,
  onClose,
}: {
  title: string;
  initial?: ApiClass;
  /** Edit only: every section of this class, so the form can switch between them. */
  sectionRows?: ApiClass[];
  teachers: { id: string; name: string }[];
  academicYears: { id: string; name: string; status: string }[];
  rooms: { id: string; name: string; status: string }[];
  onDone: () => void;
  onClose: () => void;
}) {
  // Edit: the section being edited (its own room and class teacher load with it).
  const [target, setTarget] = useState<ApiClass | undefined>(initial);
  // Create: which sections to create for the new class.
  const [sections, setSections] = useState<string[]>(["A"]);
  const [customSection, setCustomSection] = useState("");
  const [classTeacherId, setClassTeacherId] = useState<string>(initial?.class_teacher_id ?? "");
  const [academicYearId, setAcademicYearId] = useState(initial?.academic_year_id ?? academicYears.find((year) => year.status === "ACTIVE")?.id ?? "");
  const [roomId, setRoomId] = useState(initial?.room_id ?? "unassigned");

  function pickSection(id: string) {
    const row = (sectionRows ?? []).find((r) => r.id === id);
    if (!row) return;
    setTarget(row);
    setClassTeacherId(row.class_teacher_id ?? "");
    setRoomId(row.room_id ?? "unassigned");
    if (row.academic_year_id) setAcademicYearId(row.academic_year_id);
  }

  function toggleSection(value: string) {
    setSections((current) =>
      current.includes(value) ? current.filter((x) => x !== value) : [...current, value].sort(),
    );
  }

  function addCustomSection() {
    const value = customSection.trim().toUpperCase();
    if (!value) return;
    if (!sections.includes(value)) setSections((current) => [...current, value].sort());
    setCustomSection("");
  }
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      toast.error("Class name is required");
      return;
    }
    if (!initial && sections.length === 0) {
      toast.error("Select at least one section");
      return;
    }
    setSubmitting(true);
    try {
      if (initial && target) {
        await api.patch(`/classes/${target.id}`, {
          name,
          section: target.section,
          classTeacherId: classTeacherId || null,
          academicYearId,
          roomId: roomId === "unassigned" ? null : roomId,
        });
        toast.success(`Section ${target.section} updated`);
      } else {
        await Promise.all(
          sections.map((section) =>
            api.post("/classes", { name, section, classTeacherId: classTeacherId || null, academicYearId, roomId: roomId === "unassigned" ? null : roomId }),
          ),
        );
        toast.success("Class created successfully");
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save class");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="cls-name">Class Name</Label>
          <Input id="cls-name" name="name" defaultValue={initial?.name} placeholder="Grade 6" required />
        </div>
        {initial ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Section</Label>
            <Select value={target?.id ?? ""} onValueChange={pickSection}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {(sectionRows ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    Section {row.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Room and class teacher below belong to the selected section.
            </p>
          </div>
        ) : (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Sections</Label>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set([...SECTION_OPTIONS, ...sections])).map((value) => {
                const on = sections.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleSection(value)}
                    aria-pressed={on}
                    className={cn(
                      "grid h-9 min-w-9 place-items-center rounded-xl border px-2.5 text-sm font-semibold transition-colors active:scale-95",
                      on
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-surface text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={customSection}
                onChange={(e) => setCustomSection(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSection();
                  }
                }}
                placeholder="Other section name"
                maxLength={20}
                className="h-9"
              />
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={addCustomSection}>
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {sections.length
                ? `Creates ${sections.length} ${sections.length === 1 ? "section" : "sections"}: ${sections.join(", ")}`
                : "Pick at least one section"}
            </p>
          </div>
        )}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Academic Year</Label>
          <Select value={academicYearId} onValueChange={setAcademicYearId}>
            <SelectTrigger className="bg-surface"><SelectValue placeholder="Select academic year" /></SelectTrigger>
            <SelectContent>{academicYears.map((year) => <SelectItem key={year.id} value={year.id}>{year.name} · {year.status}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Room</Label>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger className="bg-surface"><SelectValue placeholder="Select room" /></SelectTrigger>
            <SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{rooms.filter((room) => room.status === "ACTIVE").map((room) => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Class Teacher</Label>
          <Select value={classTeacherId} onValueChange={setClassTeacherId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select teacher" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{initial ? "Save Changes" : "Create Class"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
