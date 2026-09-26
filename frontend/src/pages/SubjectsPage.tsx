"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Layers,
  Sparkles,
  Languages,
  Plus,
  LayoutGrid,
  TableIcon,
  Pencil,
  Trash2,
  GraduationCap,
  Users,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  FolderSync,
} from "lucide-react";
import { PageHeader, SearchInput, FilterSelect, EmptyState, Pager, Initials, usePaged } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  useSubjects,
  useClasses,
  useTeachers,
  useSubjectMappings,
  type ApiSubject,
  type ApiClassSubjectMapping,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const SUBJECT_TYPES = ["Core", "Elective", "Language", "Practical", "Optional"];
const UNASSIGNED = "__unassigned__";

function typeTone(type: string | null | undefined) {
  if (type === "Core") return "info" as const;
  if (type === "Elective") return "gold" as const;
  if (type === "Language") return "success" as const;
  return "neutral" as const;
}

export default function SubjectsPage() {
  const queryClient = useQueryClient();
  const { data: subjects, isLoading: loadingSubjects } = useSubjects();
  const { data: mappings, isLoading: loadingMappings } = useSubjectMappings();
  const { data: classes } = useClasses();
  const { data: teachers } = useTeachers();

  const [activeTab, setActiveTab] = useState<"allocations" | "catalog">("allocations");

  // Allocations filters
  const [allocSearch, setAllocSearch] = useState("");
  const [allocClass, setAllocClass] = useState("all");
  const [allocTeacher, setAllocTeacher] = useState("all");
  const [allocType, setAllocType] = useState("all");
  const [allocView, setAllocView] = useState<"table" | "card">("table");
  const [allocPage, setAllocPage] = useState(1);

  // Subject Catalog filters
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogType, setCatalogType] = useState("all");
  const [catalogPage, setCatalogPage] = useState(1);

  // Dialog States
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<ApiSubject | null>(null);

  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ApiClassSubjectMapping | null>(null);

  // Invalidate queries helper
  async function invalidateAll() {
    await queryClient.invalidateQueries({ queryKey: ["subjects"] });
    await queryClient.invalidateQueries({ queryKey: ["subject-mappings"] });
    await queryClient.invalidateQueries({ queryKey: ["my-teaching-subjects"] });
    await queryClient.invalidateQueries({ queryKey: ["my-class-subjects"] });
  }

  // Filtered Allocations
  const filteredMappings = useMemo(() => {
    return (mappings ?? []).filter((m) => {
      if (
        allocSearch &&
        !m.subject_name.toLowerCase().includes(allocSearch.toLowerCase()) &&
        !(m.subject_code ?? "").toLowerCase().includes(allocSearch.toLowerCase()) &&
        !`${m.class_name}-${m.section}`.toLowerCase().includes(allocSearch.toLowerCase()) &&
        !(m.teacher_name ?? "").toLowerCase().includes(allocSearch.toLowerCase())
      ) {
        return false;
      }
      if (allocClass !== "all" && m.class_id !== allocClass) return false;
      if (allocTeacher !== "all") {
        if (allocTeacher === UNASSIGNED && m.teacher_id) return false;
        if (allocTeacher !== UNASSIGNED && m.teacher_id !== allocTeacher) return false;
      }
      if (allocType !== "all" && (m.subject_type ?? "Core") !== allocType) return false;
      return true;
    });
  }, [mappings, allocSearch, allocClass, allocTeacher, allocType]);

  const { rows: allocRows, pageCount: allocPageCount } = usePaged(filteredMappings, allocPage, 10);

  // Filtered Subject Catalog
  const filteredSubjects = useMemo(() => {
    return (subjects ?? []).filter((s) => {
      if (
        catalogSearch &&
        !s.name.toLowerCase().includes(catalogSearch.toLowerCase()) &&
        !(s.code ?? "").toLowerCase().includes(catalogSearch.toLowerCase())
      ) {
        return false;
      }
      if (catalogType !== "all" && (s.type ?? "Core") !== catalogType) return false;
      return true;
    });
  }, [subjects, catalogSearch, catalogType]);

  const { rows: catalogRows, pageCount: catalogPageCount } = usePaged(filteredSubjects, catalogPage, 10);

  // Stats
  const totalSubjects = subjects?.length ?? 0;
  const coreSubjects = (subjects ?? []).filter((s) => (s.type ?? "Core") === "Core").length;
  const electiveSubjects = (subjects ?? []).filter((s) => s.type === "Elective").length;
  const languageSubjects = (subjects ?? []).filter((s) => s.type === "Language").length;
  const totalAllocations = mappings?.length ?? 0;
  const unassignedAllocations = (mappings ?? []).filter((m) => !m.teacher_id).length;

  // Options for filters
  const classOptions = useMemo(
    () => (classes ?? []).map((c) => ({ value: c.id, label: `${c.name}-${c.section}` })),
    [classes],
  );

  const teacherOptions = useMemo(
    () => [
      { value: UNASSIGNED, label: "⚠️ Unassigned (No Teacher)" },
      ...(teachers ?? []).map((t) => ({ value: t.id, label: t.name })),
    ],
    [teachers],
  );

  async function handleDeleteSubject(s: ApiSubject) {
    if (!confirm(`Are you sure you want to delete "${s.name}"? This will also remove any class assignments for this subject.`)) {
      return;
    }
    try {
      await api.delete(`/subjects/${s.id}`);
      toast.success(`Subject "${s.name}" removed`);
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete subject");
    }
  }

  async function handleDeleteMapping(m: ApiClassSubjectMapping) {
    if (!confirm(`Remove "${m.subject_name}" from ${m.class_name}-${m.section}?`)) {
      return;
    }
    try {
      await api.delete(`/subjects/mappings/${m.id}`);
      toast.success(`Mapping for ${m.subject_name} removed`);
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete mapping");
    }
  }

  return (
    <div>
      <PageHeader
        title="Subject Management & Allocations"
        description="Configure master subject catalog and assign subjects with teachers across classes and sections."
        breadcrumb={["Dashboard", "Academics", "Subjects"]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setEditingSubject(null);
                setSubjectDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Subject Head
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditingMapping(null);
                setMappingDialogOpen(true);
              }}
            >
              <GraduationCap className="h-4 w-4" /> Assign to Class
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Subjects" value={totalSubjects} icon={BookOpen} tone="navy" />
        <InfoCard label="Class Allocations" value={totalAllocations} icon={Layers} tone="info" />
        <InfoCard label="Elective Subjects" value={electiveSubjects} icon={Sparkles} tone="gold" />
        <InfoCard
          label="Unassigned Classes"
          value={unassignedAllocations}
          icon={AlertCircle}
          tone={unassignedAllocations > 0 ? "danger" : "success"}
        />
      </div>

      <div className="mt-5">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "allocations" | "catalog")}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <TabsList className="grid w-full grid-cols-1 gap-1 sm:inline-flex sm:w-auto">
              <TabsTrigger value="allocations" className="w-full justify-start gap-2 sm:w-auto sm:justify-center">
                <FolderSync className="h-4 w-4" />
                Class-Subject Allocations ({totalAllocations})
              </TabsTrigger>
              <TabsTrigger value="catalog" className="w-full justify-start gap-2 sm:w-auto sm:justify-center">
                <BookOpen className="h-4 w-4" />
                Subject Master Catalog ({totalSubjects})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: Class-Subject Allocations */}
          <TabsContent value="allocations" className="mt-0">
            <SectionCard
              title="Class & Section Allocations"
              subtitle={`${filteredMappings.length} subject-class assignments across all sections`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <SearchInput
                    value={allocSearch}
                    onChange={(v) => {
                      setAllocSearch(v);
                      setAllocPage(1);
                    }}
                    placeholder="Search class, subject, teacher…"
                  />
                  <FilterSelect
                    value={allocClass}
                    onChange={(v) => {
                      setAllocClass(v);
                      setAllocPage(1);
                    }}
                    options={classOptions.map((c) => c.label)}
                    placeholder="Class"
                  />
                  <FilterSelect
                    value={allocType}
                    onChange={(v) => {
                      setAllocType(v);
                      setAllocPage(1);
                    }}
                    options={SUBJECT_TYPES}
                    placeholder="Type"
                  />
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                    <Button
                      variant={allocView === "table" ? "default" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setAllocView("table")}
                    >
                      <TableIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={allocView === "card" ? "default" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setAllocView("card")}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              }
              bodyClassName="p-0"
            >
              {loadingMappings ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading allocations…</div>
              ) : allocRows.length === 0 ? (
                <div className="p-6 text-center">
                  <EmptyState
                    title="No class allocations found"
                    description="Assign subjects to classes and sections with designated teachers to get started."
                    icon={GraduationCap}
                  />
                  <Button
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => {
                      setEditingMapping(null);
                      setMappingDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Assign Subject to Class
                  </Button>
                </div>
              ) : allocView === "table" ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Class / Section</th>
                        <th className="px-4 py-2.5 font-medium">Subject</th>
                        <th className="px-4 py-2.5 font-medium">Code</th>
                        <th className="px-4 py-2.5 font-medium">Assigned Teacher</th>
                        <th className="px-4 py-2.5 font-medium">Type</th>
                        <th className="px-4 py-2.5 font-medium text-center">Credits / Wk</th>
                        <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocRows.map((m) => (
                        <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold">
                              {m.class_name}-{m.section}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-foreground">{m.subject_name}</div>
                            {m.subject_description && (
                              <div className="text-[11px] text-muted-foreground truncate max-w-xs">{m.subject_description}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[11px] font-mono font-medium">
                              {m.subject_code ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {m.teacher_name ? (
                              <div className="flex items-center gap-2">
                                <Initials name={m.teacher_name} tone="navy" className="h-7 w-7 text-[10px]" />
                                <div>
                                  <span className="font-medium text-xs block">{m.teacher_name}</span>
                                  {m.teacher_email && (
                                    <span className="text-[10px] text-muted-foreground block">{m.teacher_email}</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                                <AlertCircle className="h-3 w-3" /> Unassigned
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <StatusBadge status={m.subject_type ?? "Core"} tone={typeTone(m.subject_type)} />
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono font-medium">
                            {m.subject_credits ?? 3} hrs
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingMapping(m);
                                  setMappingDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => handleDeleteMapping(m)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {allocRows.map((m) => (
                    <div key={m.id} className="panel p-3.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">
                              {m.class_name}-{m.section}
                            </span>
                            <h4 className="mt-1.5 font-bold text-sm">{m.subject_name}</h4>
                            <span className="mt-0.5 inline-block text-[11px] font-mono text-muted-foreground">
                              {m.subject_code ?? "No Code"}
                            </span>
                          </div>
                          <StatusBadge status={m.subject_type ?? "Core"} tone={typeTone(m.subject_type)} />
                        </div>

                        <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Assigned Teacher</p>
                          {m.teacher_name ? (
                            <div className="flex items-center gap-2">
                              <Initials name={m.teacher_name} tone="navy" className="h-6 w-6 text-[10px]" />
                              <div className="truncate">
                                <p className="truncate text-xs font-medium">{m.teacher_name}</p>
                                <p className="truncate text-[10px] text-muted-foreground">{m.teacher_email ?? m.teacher_phone ?? "—"}</p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-destructive flex items-center gap-1 font-medium">
                              <AlertCircle className="h-3 w-3" /> Needs Teacher Assignment
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-xs text-muted-foreground">
                        <span>{m.subject_credits ?? 3} Credit Hours</span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setEditingMapping(m);
                              setMappingDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3 mr-1" /> Reassign
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive"
                            onClick={() => handleDeleteMapping(m)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Pager page={allocPage} pageCount={allocPageCount} onPage={setAllocPage} total={filteredMappings.length} />
            </SectionCard>
          </TabsContent>

          {/* TAB 2: Subject Master Catalog */}
          <TabsContent value="catalog" className="mt-0">
            <SectionCard
              title="Subject Master Directory"
              subtitle="Master curriculum subjects configured for the institution"
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <SearchInput
                    value={catalogSearch}
                    onChange={(v) => {
                      setCatalogSearch(v);
                      setCatalogPage(1);
                    }}
                    placeholder="Search subject catalog…"
                  />
                  <FilterSelect
                    value={catalogType}
                    onChange={(v) => {
                      setCatalogType(v);
                      setCatalogPage(1);
                    }}
                    options={SUBJECT_TYPES}
                    placeholder="Type"
                  />
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setEditingSubject(null);
                      setSubjectDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add Subject
                  </Button>
                </div>
              }
              bodyClassName="p-0"
            >
              {loadingSubjects ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading subject catalog…</div>
              ) : catalogRows.length === 0 ? (
                <div className="p-6 text-center">
                  <EmptyState
                    title="No subjects in catalog"
                    description="Create subject heads (e.g. Mathematics, Science, English) to begin assigning them to classes."
                    icon={BookOpen}
                  />
                  <Button
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => {
                      setEditingSubject(null);
                      setSubjectDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Create First Subject
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Subject Name</th>
                        <th className="px-4 py-2.5 font-medium">Subject Code</th>
                        <th className="px-4 py-2.5 font-medium">Classification Type</th>
                        <th className="px-4 py-2.5 font-medium text-center">Credits / Wk</th>
                        <th className="px-4 py-2.5 font-medium">Description</th>
                        <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalogRows.map((s) => (
                        <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium">
                            <div className="flex items-center gap-2">
                              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                                {s.name.charAt(0)}
                              </span>
                              <span>{s.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs">{s.code ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={s.type ?? "Core"} tone={typeTone(s.type)} />
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono font-medium">{s.credits ?? 3}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-sm truncate">
                            {s.description ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingSubject(s);
                                  setSubjectDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => handleDeleteSubject(s)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager page={catalogPage} pageCount={catalogPageCount} onPage={setCatalogPage} total={filteredSubjects.length} />
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>

      {/* DIALOG 1: Subject Master Add/Edit Dialog */}
      <Dialog
        open={subjectDialogOpen}
        onOpenChange={(o) => {
          setSubjectDialogOpen(o);
          if (!o) setEditingSubject(null);
        }}
      >
        <SubjectFormDialog
          initial={editingSubject}
          onDone={async () => {
            await invalidateAll();
            setSubjectDialogOpen(false);
            setEditingSubject(null);
          }}
          onClose={() => {
            setSubjectDialogOpen(false);
            setEditingSubject(null);
          }}
        />
      </Dialog>

      {/* DIALOG 2: Class-Subject-Teacher Mapping Dialog */}
      <Dialog
        open={mappingDialogOpen}
        onOpenChange={(o) => {
          setMappingDialogOpen(o);
          if (!o) setEditingMapping(null);
        }}
      >
        <MappingFormDialog
          initial={editingMapping}
          classes={classes ?? []}
          subjects={subjects ?? []}
          teachers={teachers ?? []}
          onDone={async () => {
            await invalidateAll();
            setMappingDialogOpen(false);
            setEditingMapping(null);
          }}
          onClose={() => {
            setMappingDialogOpen(false);
            setEditingMapping(null);
          }}
        />
      </Dialog>
    </div>
  );
}

/** Subject Form Dialog Component */
function SubjectFormDialog({
  initial,
  onDone,
  onClose,
}: {
  initial: ApiSubject | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [type, setType] = useState(initial?.type ?? "Core");
  const [credits, setCredits] = useState(initial?.credits ? String(initial.credits) : "3");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Subject name is required");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || null,
        type: type.trim() || "Core",
        credits: Number(credits) || 3,
        description: description.trim() || null,
      };
      if (isEdit) {
        await api.patch(`/subjects/${initial!.id}`, body);
        toast.success("Subject updated successfully");
      } else {
        await api.post("/subjects", body);
        toast.success("Subject created successfully");
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save subject");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Subject Head" : "Add Subject Head"}</DialogTitle>
        <DialogDescription>Define standard curriculum subjects, codes, and credit hours.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3.5">
        <div className="grid gap-1.5">
          <Label htmlFor="sub-name">Subject Name</Label>
          <Input
            id="sub-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Advanced Mathematics, Organic Chemistry"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sub-code">Subject Code</Label>
            <Input
              id="sub-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. MAT-101"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sub-credits">Credit Hours</Label>
            <Input
              id="sub-credits"
              type="number"
              min={1}
              max={10}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              placeholder="3"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Subject Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBJECT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sub-desc">Description / Syllabus Overview</Label>
          <Textarea
            id="sub-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional syllabus summary, learning goals, or prerequisites..."
            rows={3}
          />
        </div>
        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create Subject"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Class-Subject-Teacher Mapping Dialog Component */
function MappingFormDialog({
  initial,
  classes,
  subjects,
  teachers,
  onDone,
  onClose,
}: {
  initial: ApiClassSubjectMapping | null;
  classes: { id: string; name: string; section: string }[];
  subjects: ApiSubject[];
  teachers: { id: string; name: string; department?: string | null }[];
  onDone: () => void;
  onClose: () => void;
}) {
  const isEdit = Boolean(initial);
  const [classId, setClassId] = useState(initial?.class_id ?? (classes[0]?.id || ""));
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? (subjects[0]?.id || ""));
  const [teacherId, setTeacherId] = useState(initial?.teacher_id ?? UNASSIGNED);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !subjectId) {
      toast.error("Class and Subject are required");
      return;
    }
    setSubmitting(true);
    try {
      const assignedTeacher = teacherId === UNASSIGNED ? null : teacherId;
      if (isEdit) {
        await api.patch(`/subjects/mappings/${initial!.id}`, {
          classId,
          subjectId,
          teacherId: assignedTeacher,
        });
        toast.success("Class subject assignment updated");
      } else {
        await api.post("/subjects/mappings", {
          classId,
          subjectId,
          teacherId: assignedTeacher,
        });
        toast.success("Subject allocated to class successfully");
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to assign subject");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Reassign Subject & Teacher" : "Assign Subject to Class"}</DialogTitle>
        <DialogDescription>
          Map a curriculum subject to a specific class/section and designate the instructor.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3.5">
        <div className="grid gap-1.5">
          <Label>Target Class & Section</Label>
          <Select value={classId} onValueChange={setClassId} disabled={isEdit}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}-{c.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Subject Head</Label>
          <Select value={subjectId} onValueChange={setSubjectId} disabled={isEdit}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Choose a subject" />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} {s.code ? `(${s.code})` : ""} · {s.type ?? "Core"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Assigned Teacher / Instructor</Label>
          <Select value={teacherId} onValueChange={setTeacherId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select teacher" />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              <SelectItem value={UNASSIGNED}>-- Unassigned (Assign later) --</SelectItem>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} {t.department ? `(${t.department})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            This teacher will automatically see this class and subject in their Teacher Portal and Grading sheets.
          </p>
        </div>

        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Assign Subject"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
