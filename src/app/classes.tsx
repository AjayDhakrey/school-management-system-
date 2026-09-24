"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Users2, Layers, GraduationCap } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAcademicYears, useClasses, useRooms, useTeachers, useStudents, type ApiClass } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

type ClassGroup = {
  name: string;
  academicYearId: string | null;
  academicYearName: string | null;
  sections: ApiClass[];
};

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
  const [editRow, setEditRow] = useState<ApiClass | null>(null);

  const classRows = useMemo(() => [...(classes ?? [])].sort(compareClasses), [classes]);
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => {
            const totalStudents = g.sections.reduce((sum, s) => sum + studentCount(s.id), 0);
            const primaryTeacherId = g.sections[0]?.class_teacher_id ?? null;
            return (
              <div key={`${g.academicYearId}:${g.name}`} className="panel flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-bold">{g.name}</p>
                    <p className="text-xs text-muted-foreground">{totalStudents} students</p>
                    <p className="text-xs text-muted-foreground">{g.academicYearName ?? "No academic year"}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{g.sections.length} sections</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <Initials name={teacherName(primaryTeacherId)} tone="navy" className="h-8 w-8" />
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">Class Teacher</p>
                    <p className="truncate text-sm font-medium">{teacherName(primaryTeacherId)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {g.sections.map((s) => (
                    <span key={s.id} className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">
                      Section {s.section} · {studentCount(s.id)}
                    </span>
                  ))}
                </div>

                <div className="mt-1 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setManageGroup(g)}>
                    Manage Sections
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditRow(g.sections[0] ?? null)}>
                    Edit Class
                  </Button>
                </div>
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

              <div className="grid gap-2.5 p-4 md:hidden">
                {classRows.map((c) => (
                  <div key={c.id} className="panel flex items-center gap-3 p-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                      {c.section}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {c.name} <span className="font-normal text-muted-foreground">· Section {c.section}</span>
                      </p>
                      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                        <Initials name={teacherName(c.class_teacher_id)} tone="navy" className="h-5 w-5 text-[9px]" />
                        <p className="truncate text-xs text-muted-foreground">{teacherName(c.class_teacher_id)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-center rounded-xl bg-muted px-2.5 py-1.5">
                      <span className="text-sm leading-tight font-bold">{studentCount(c.id)}</span>
                      <span className="text-[9px] leading-tight tracking-wide text-muted-foreground uppercase">Students</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

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
            title={`Edit ${editRow.name} - Section ${editRow.section}`}
            initial={editRow}
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
    setSubmitting(true);
    try {
      await api.delete(`/classes/${id}`);
      await onChanged();
      toast.success(`Section ${section} removed`);
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

function ClassFormDialog({
  title,
  initial,
  teachers,
  academicYears,
  rooms,
  onDone,
  onClose,
}: {
  title: string;
  initial?: ApiClass;
  teachers: { id: string; name: string }[];
  academicYears: { id: string; name: string; status: string }[];
  rooms: { id: string; name: string; status: string }[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<string[]>(initial ? [initial.section] : ["A"]);
  const [classTeacherId, setClassTeacherId] = useState<string>(initial?.class_teacher_id ?? "");
  const [academicYearId, setAcademicYearId] = useState(initial?.academic_year_id ?? academicYears.find((year) => year.status === "ACTIVE")?.id ?? "");
  const [roomId, setRoomId] = useState(initial?.room_id ?? "unassigned");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      toast.error("Class name is required");
      return;
    }
    if (sections.length === 0) {
      toast.error("Select at least one section");
      return;
    }
    setSubmitting(true);
    try {
      if (initial) {
        await api.patch(`/classes/${initial.id}`, {
          name,
          section: sections[0],
          classTeacherId: classTeacherId || null,
          academicYearId,
          roomId: roomId === "unassigned" ? null : roomId,
        });
        toast.success("Class updated successfully");
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
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="cls-sections">Sections</Label>
          <Input id="cls-sections" value={sections.join(", ")} onChange={(e) => setSections(e.target.value.split(",").map((value) => value.trim()).filter(Boolean))} placeholder="A, B, C" maxLength={200} />
          {initial && <p className="text-xs text-muted-foreground">Editing updates only the first selected section for this row.</p>}
        </div>
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
