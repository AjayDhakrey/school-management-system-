"use client";

import { useMemo, useState } from "react";
import { InfoCard } from "@/components/shared/InfoCard";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAcademicYears,
  useClasses,
  useRooms,
  useTeachers,
  useStudents,
  type ApiClass,
} from "@/hooks/useApi";
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

// Each class gets its own section-tile colour, so neighbouring classes are easy to tell apart.
const SECTION_TONES = [
  "bg-sky-500/10 text-sky-700",
  "bg-violet-500/10 text-violet-700",
  "bg-emerald-500/10 text-emerald-700",
  "bg-amber-500/15 text-amber-700",
  "bg-rose-500/10 text-rose-700",
  "bg-cyan-500/10 text-cyan-700",
  "bg-orange-500/10 text-orange-700",
  "bg-teal-500/10 text-teal-700",
];

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

  const teacherName = (id: string | null) =>
    teacherRows.find((t) => t.id === id)?.name ?? "Unassigned";
  const studentCount = (classId: string) =>
    studentRows.filter((s) => s.class_id === classId).length;

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
  const liveManageGroup = manageGroup
    ? (groups.find(
        (g) => g.name === manageGroup.name && g.academicYearId === manageGroup.academicYearId,
      ) ?? null)
    : null;

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
              allClasses={classRows}
              academicYears={academicYears ?? []}
              rooms={rooms ?? []}
              onDone={async () => {
                await invalidate();
                setCreateOpen(false);
              }}
              onClose={() => setCreateOpen(false)}
            />
          </Dialog>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No classes found"
          description="Create a class to get started."
          icon={GraduationCap}
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <InfoCard label="Classes" value={groups.length} icon={GraduationCap} tone="navy" />
            <InfoCard label="Sections" value={classRows.length} icon={Layers} tone="info" />
            <InfoCard
              label="Students"
              value={classRows.reduce((sum, c) => sum + studentCount(c.id), 0)}
              icon={Users2}
              tone="success"
            />
            <InfoCard
              label="No Class Teacher"
              value={classRows.filter((c) => !c.class_teacher_id).length}
              icon={UserRound}
              tone="warning"
            />
          </div>
          {/* Phones: one card per class, its sections listed inside. */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:hidden">
            {groups.map((g, gi) => {
              const tone = SECTION_TONES[gi % SECTION_TONES.length]!;
              const total = g.sections.reduce((sum, sec) => sum + studentCount(sec.id), 0);
              return (
                <div
                  key={`${g.academicYearId}:${g.name}`}
                  className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                >
                  <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-bold capitalize">
                        {g.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {total} student{total === 1 ? "" : "s"} · {g.sections.length} section
                        {g.sections.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={`Manage sections of ${g.name}`}
                      onClick={() => setManageGroup(g)}
                    >
                      <Layers className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-primary"
                      aria-label={`Edit ${g.name}`}
                      onClick={() => setEditRow(g.sections[0] ?? null)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      aria-label={`Delete ${g.name}`}
                      onClick={() => setDeleteGroup(g)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.sections.map((sec) => {
                      const teacher = sec.class_teacher_id
                        ? teacherName(sec.class_teacher_id)
                        : null;
                      return (
                        <li key={sec.id} className="flex items-center gap-3 px-3.5 py-2.5">
                          <span
                            className={cn(
                              "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold",
                              tone,
                            )}
                          >
                            {sec.section || "—"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-sm capitalize",
                                teacher ? "font-medium" : "text-xs text-muted-foreground/70 italic",
                              )}
                            >
                              {teacher ?? "No class teacher"}
                            </p>
                            {sec.room_name && (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {sec.room_name}
                              </p>
                            )}
                          </div>
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                            <Users2 className="h-3 w-3" /> {studentCount(sec.id)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted px-4 py-2.5">Class</th>
                    <th className="border-l border-border px-3 py-2.5">Section</th>
                    <th className="px-3 py-2.5">Class teacher</th>
                    <th className="px-3 py-2.5">Room</th>
                    <th className="px-3 py-2.5 text-right">Students</th>
                    <th className="border-l border-border px-3 py-2.5 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, gi) => {
                    const tone = SECTION_TONES[gi % SECTION_TONES.length]!;
                    const totalStudents = g.sections.reduce(
                      (sum, sec) => sum + studentCount(sec.id),
                      0,
                    );
                    return g.sections.map((sec, i) => {
                      const teacher = sec.class_teacher_id
                        ? teacherName(sec.class_teacher_id)
                        : null;
                      const first = i === 0;
                      const last = i === g.sections.length - 1;
                      return (
                        <tr
                          key={sec.id}
                          className={cn("hover:bg-muted/30", last && "border-b border-border")}
                        >
                          {first && (
                            <td
                              rowSpan={g.sections.length}
                              className="sticky left-0 z-10 border-r border-border bg-card px-4 py-2.5 align-top"
                            >
                              <p className="font-display text-[15px] font-bold capitalize">
                                {g.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {totalStudents} student{totalStudents === 1 ? "" : "s"} ·{" "}
                                {g.sections.length} section{g.sections.length === 1 ? "" : "s"}
                              </p>
                            </td>
                          )}
                          <td className={cn("px-3 py-2", !last && "border-b border-border/50")}>
                            <span
                              className={cn(
                                "inline-grid h-7 w-7 place-items-center rounded-lg text-xs font-bold",
                                tone,
                              )}
                            >
                              {sec.section || "—"}
                            </span>
                          </td>
                          <td className={cn("px-3 py-2", !last && "border-b border-border/50")}>
                            {teacher ? (
                              <span className="font-medium">{teacher}</span>
                            ) : (
                              <span className="text-xs italic text-muted-foreground/70">
                                Not assigned
                              </span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 whitespace-nowrap text-muted-foreground",
                              !last && "border-b border-border/50",
                            )}
                          >
                            {sec.room_name ?? <span className="text-muted-foreground/50">—</span>}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              !last && "border-b border-border/50",
                            )}
                          >
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                              {studentCount(sec.id)}
                            </span>
                          </td>
                          {first && (
                            <td
                              rowSpan={g.sections.length}
                              className="border-l border-border px-3 py-2.5 text-right align-top"
                            >
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  aria-label={`Manage sections of ${g.name}`}
                                  title="Manage sections"
                                  onClick={() => setManageGroup(g)}
                                >
                                  <Layers className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                                  aria-label={`Edit ${g.name}`}
                                  title="Edit class"
                                  onClick={() => setEditRow(g.sections[0] ?? null)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:bg-destructive-soft hover:text-destructive"
                                  aria-label={`Delete ${g.name}`}
                                  title="Delete class"
                                  onClick={() => setDeleteGroup(g)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <AlertDialog
        open={!!deleteGroup}
        onOpenChange={(o) => !o && !deleting && setDeleteGroup(null)}
      >
        <AlertDialogContent>
          {deleteGroup &&
            (() => {
              const enrolled = deleteGroup.sections.reduce(
                (sum, sec) => sum + studentCount(sec.id),
                0,
              );
              const sectionList = deleteGroup.sections.map((sec) => sec.section).join(", ");
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="capitalize">
                      {enrolled
                        ? `Can't delete ${deleteGroup.name}`
                        : `Delete ${deleteGroup.name}?`}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {enrolled ? (
                        <>
                          {enrolled} student{enrolled === 1 ? " is" : "s are"} still enrolled in{" "}
                          {deleteGroup.name}. Move {enrolled === 1 ? "that student" : "them"} to
                          another class first, then delete it.
                        </>
                      ) : (
                        <>
                          This removes {deleteGroup.name}
                          {sectionList
                            ? ` (section${deleteGroup.sections.length === 1 ? "" : "s"} ${sectionList})`
                            : ""}
                          {deleteGroup.academicYearName
                            ? ` for ${deleteGroup.academicYearName}`
                            : ""}
                          . If past attendance, fees or exams use it, it's archived instead so that
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
              groups.find((g) => g.sections.some((sec) => sec.id === editRow.id))?.sections ?? [
                editRow,
              ]
            }
            teachers={teacherRows.map((t) => ({ id: t.id, name: t.name }))}
            allClasses={classRows}
            academicYears={academicYears ?? []}
            rooms={rooms ?? []}
            onDone={async () => {
              await invalidate();
              setEditRow(null);
            }}
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
      await api.post("/classes", {
        name: g.name,
        section: newSection.trim(),
        classTeacherId: null,
        academicYearId: g.academicYearId,
      });
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

  const totalStudents = g.sections.reduce((sum, sec) => sum + studentCount(sec.id), 0);
  // Next free letters, offered as one-tap choices.
  const freeLetters = SECTION_OPTIONS.filter((l) => !existingSections.includes(l)).slice(0, 4);

  return (
    <div>
      <SheetHeader className="mb-4 text-left">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <SheetTitle className="truncate capitalize">{g.name}</SheetTitle>
            <p className="text-xs text-muted-foreground">
              {g.sections.length} section{g.sections.length === 1 ? "" : "s"} · {totalStudents}{" "}
              student{totalStudents === 1 ? "" : "s"}
              {g.academicYearName ? ` · ${g.academicYearName}` : ""}
            </p>
          </div>
        </div>
      </SheetHeader>

      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Sections
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {g.sections.map((s) => {
          const teacher = teachers.find((t) => t.id === s.class_teacher_id)?.name ?? null;
          const count = studentCount(s.id);
          return (
            <li key={s.id} className="flex items-center gap-3 px-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-info-soft font-display text-base font-bold text-info">
                {s.section}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Section {s.section}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <UserRound className="h-3 w-3 shrink-0" />
                  {teacher ?? <span className="italic">No class teacher</span>}
                  {s.room_name ? <span className="truncate"> · {s.room_name}</span> : null}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground/80">
                <Users2 className="h-3 w-3" /> {count}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive-soft hover:text-destructive"
                title={`Remove section ${s.section}`}
                aria-label={`Remove section ${s.section}`}
                disabled={submitting}
                onClick={() => deleteSection(s.id, s.section)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>

      {/* Add a section */}
      <div className="mt-4 rounded-2xl border border-dashed border-border p-3">
        <p className="mb-2 text-xs font-semibold">Add a section</p>
        {freeLetters.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {freeLetters.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setNewSection(l);
                  setAddingSection(true);
                }}
                className={cn(
                  "h-8 min-w-10 rounded-lg border px-3 text-sm font-semibold transition-colors",
                  newSection === l
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground/80 hover:border-primary/40 hover:text-primary",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newSection}
            onChange={(e) => {
              setNewSection(e.target.value);
              setAddingSection(true);
            }}
            placeholder="Or type a name, e.g. Rose"
            maxLength={30}
            className="h-9"
          />
          <Button
            className="h-9 shrink-0 gap-1.5"
            disabled={submitting || !addingSection || !newSection.trim()}
            onClick={addSection}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>
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
  allClasses = [],
  onDone,
  onClose,
}: {
  title: string;
  initial?: ApiClass;
  /** Every class section, to see which teachers are already a Class Teacher. */
  allClasses?: ApiClass[];
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
  const [academicYearId, setAcademicYearId] = useState(
    initial?.academic_year_id ?? academicYears.find((year) => year.status === "ACTIVE")?.id ?? "",
  );
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

  // Teachers who are already Class Teacher of another section — one class per teacher.
  const takenBy = new Map(
    allClasses
      .filter((c) => c.class_teacher_id && c.id !== target?.id && c.status !== "ARCHIVED")
      .map((c) => [c.class_teacher_id!, `${c.name}-${c.section}`]),
  );

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
          sections.map((section, i) =>
            api.post("/classes", {
              name,
              section,
              // A teacher can be Class Teacher of one section only — the first one here.
              classTeacherId: i === 0 ? classTeacherId || null : null,
              academicYearId,
              roomId: roomId === "unassigned" ? null : roomId,
            }),
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
          <Input
            id="cls-name"
            name="name"
            defaultValue={initial?.name}
            placeholder="Grade 6"
            required
          />
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={addCustomSection}
              >
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
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select academic year" />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name} · {year.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Room</Label>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select room" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {rooms
                .filter((room) => room.status === "ACTIVE")
                .map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Class Teacher</Label>
          <Select
            value={classTeacherId || "none"}
            onValueChange={(v) => setClassTeacherId(v === "none" ? "" : v)}
          >
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select teacher" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No class teacher</SelectItem>
              {teachers.map((t) => {
                const busy = takenBy.get(t.id);
                return (
                  <SelectItem key={t.id} value={t.id} disabled={Boolean(busy)}>
                    {t.name}
                    {busy ? ` · Class teacher of ${busy}` : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            A teacher can be Class Teacher of one section only.
            {!initial && sections.length > 1 ? " They'll be set on the first section." : ""}
          </p>
        </div>
        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {initial ? "Save Changes" : "Create Class"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
