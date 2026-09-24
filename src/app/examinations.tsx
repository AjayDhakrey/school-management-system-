"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { PageHeader, EmptyState, FilterSelect, TableSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, GradeBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarDays,
  PlusCircle,
  Clock,
  PlayCircle,
  CheckCircle2,
  Save,
  Send,
  MoreVertical,
  ClipboardCheck,
  FileSpreadsheet,
  Undo2,
  Megaphone,
  Pencil,
  Trash2,
  Ban,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  useExams,
  useExaminations,
  useClasses,
  useAcademicYears,
  useStudents,
  useResults,
  useRooms,
  useTeachers,
  useSubjectMappings,
  useHasPermission,
  useMyTeacherProfile,
  useMyTeacherTeachingSubjects,
  type ApiExam,
  type ApiExamination,
  type ApiClass,
  type ApiAcademicYear,
  type ApiResult,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// Mirrors public.exam_type_options() in supabase/migrations/54_exam_scheduling.sql.
const EXAM_TYPES = [
  "Unit Test",
  "Monthly Test",
  "Periodic Test",
  "Mid-Term",
  "Half-Yearly",
  "Pre-Final",
  "End-Term",
  "Final",
  "Practical",
  "Re-Test",
  "Improvement",
  "Compartment",
  "Other",
];
// Exams that repeat an earlier one; they get their own papers and marks, the original is kept.
const REPEAT_TYPES = ["Re-Test", "Improvement", "Compartment"];
const TERM_SUGGESTIONS = [
  "Term 1",
  "Term 2",
  "Term 3",
  "Semester 1",
  "Semester 2",
  "Quarterly",
  "Half-Yearly",
  "Annual",
];

type AttendanceState = "PRESENT" | "ABSENT" | "NOT_APPLICABLE";
const ATTENDANCE_LABEL: Record<AttendanceState, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  NOT_APPLICABLE: "Not applicable",
};

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "d MMM yyyy");
  } catch {
    return value;
  }
}

function fmtTime(value: string | null | undefined) {
  if (!value) return "";
  const [h = "0", m = "00"] = value.split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? "AM" : "PM"}`;
}

function timeRange(exam: Pick<ApiExam, "start_time" | "end_time">) {
  return exam.start_time && exam.end_time
    ? `${fmtTime(exam.start_time)} – ${fmtTime(exam.end_time)}`
    : "Time not set";
}

function classLabel(cls: Pick<ApiClass, "name" | "section"> | undefined | null) {
  if (!cls) return "—";
  return cls.section ? `${cls.name} ${cls.section}` : cls.name;
}

function paperClassLabel(exam: ApiExam, classesById: Map<string, ApiClass>) {
  const cls = classesById.get(exam.class_id ?? "");
  if (cls) return classLabel(cls);
  return exam.class_name ? classLabel({ name: exam.class_name, section: exam.section ?? "" }) : "—";
}

function sortPapers(a: ApiExam, b: ApiExam) {
  return (
    (a.date ?? "").localeCompare(b.date ?? "") ||
    (a.start_time ?? "").localeCompare(b.start_time ?? "") ||
    (a.subject ?? "").localeCompare(b.subject ?? "")
  );
}

/** Plain-language status for a subject paper. */
function paperStatus(exam: ApiExam): {
  label: string;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
} {
  switch (exam.status) {
    case "DRAFT":
      return { label: "Draft", tone: "neutral" };
    case "MARKS_ENTRY":
      return exam.review_note
        ? { label: "Returned", tone: "danger" }
        : { label: "Marks Entry", tone: "info" };
    case "REVIEW":
      return { label: "Submitted", tone: "warning" };
    case "PUBLISHED":
      return { label: "Published", tone: "success" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: exam.status, tone: "neutral" };
  }
}

function PaperStatusBadge({ exam }: { exam: ApiExam }) {
  const s = paperStatus(exam);
  return <StatusBadge status={s.label} tone={s.tone} />;
}

function suggestedName(type: string, year: ApiAcademicYear | undefined) {
  const suffix = year ? ` ${year.name}` : "";
  if (["Unit Test", "Monthly Test", "Periodic Test", "Practical", "Re-Test"].includes(type))
    return `${type}${suffix}`;
  if (type === "Other") return "";
  return `${type} Examination${suffix}`;
}

/** Permissions from the existing RBAC (has_permission). School Admin holds all of them. */
function useExamPermissions() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SCHOOL_ADMIN";
  const view = useHasPermission("exams.view", !isAdmin);
  const manage = useHasPermission("exams.manage", !isAdmin);
  const marks = useHasPermission("results.manage", !isAdmin);
  const publish = useHasPermission("results.publish", !isAdmin);
  return {
    loading:
      !isAdmin && (view.isLoading || manage.isLoading || marks.isLoading || publish.isLoading),
    canView: isAdmin || view.data === true,
    canManage: isAdmin || manage.data === true,
    canEnterMarks: isAdmin || marks.data === true,
    canPublish: isAdmin || publish.data === true,
  };
}

function useExamResults(examId: string | undefined) {
  const path = `/results?examId=${examId}`;
  return useQuery<ApiResult[]>({
    queryKey: ["results", path],
    queryFn: () => api.get<ApiResult[]>(path),
    enabled: Boolean(examId),
  });
}

/** Confirmation dialog for one-way or bulk actions. */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type Confirmation = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  run: () => Promise<void>;
};

function useConfirm() {
  const [pending, setPending] = useState<Confirmation | null>(null);
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
      title={pending?.title ?? ""}
      description={pending?.description ?? ""}
      confirmLabel={pending?.confirmLabel ?? "Confirm"}
      destructive={pending?.destructive ?? false}
      onConfirm={() => {
        const action = pending;
        setPending(null);
        void action?.run();
      }}
    />
  );
  return { ask: setPending, dialog };
}

function ExaminationSelect({
  examinations,
  value,
  onChange,
  className,
}: {
  examinations: ApiExamination[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-9 w-full bg-surface text-sm sm:w-[280px]", className)}>
        <SelectValue placeholder="Select examination" />
      </SelectTrigger>
      <SelectContent>
        {examinations.map((x) => (
          <SelectItem key={x.id} value={x.id}>
            {x.name}
            {x.academic_year_name ? ` (${x.academic_year_name})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================================================================
// Create / edit examination
// ============================================================================

function ExaminationFormDialog({
  open,
  onOpenChange,
  initial,
  papers,
  years,
  classes,
  examinations,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ApiExamination | null;
  papers: ApiExam[];
  years: ApiAcademicYear[];
  classes: ApiClass[];
  examinations: ApiExamination[];
  onSaved: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const defaultYear = years.find((y) => y.status === "ACTIVE") ?? years[0];
  const [yearId, setYearId] = useState("");
  const [term, setTerm] = useState("");
  const [examType, setExamType] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [passing, setPassing] = useState("33");
  const [basedOn, setBasedOn] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setYearId(initial?.academic_year_id ?? defaultYear?.id ?? "");
    setTerm(initial?.term ?? "");
    setExamType(initial?.exam_type ?? "");
    setName(initial?.name ?? "");
    setNameTouched(Boolean(initial));
    setDescription(initial?.description ?? "");
    setClassIds(initial?.class_ids ?? []);
    setStartDate(initial?.start_date ?? "");
    setEndDate(initial?.end_date ?? "");
    setPassing(String(initial?.passing_percentage ?? 33));
    setBasedOn(initial?.based_on_examination_id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const year = years.find((y) => y.id === yearId);
  const livePapers = papers.filter((p) => p.status !== "CANCELLED");
  const hasPapers = papers.length > 0;
  const marksStarted = livePapers.some((p) => p.status !== "DRAFT");
  const usedClassIds = new Set(livePapers.map((p) => p.class_id ?? ""));

  const yearClasses = useMemo(
    () =>
      classes
        .filter((c) => c.academic_year_id === yearId && c.status === "ACTIVE")
        .sort((a, b) => classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true })),
    [classes, yearId],
  );
  const classGroups = useMemo(() => {
    const groups = new Map<string, ApiClass[]>();
    for (const c of yearClasses) groups.set(c.name, [...(groups.get(c.name) ?? []), c]);
    return [...groups.entries()];
  }, [yearClasses]);

  function chooseType(type: string) {
    setExamType(type);
    if (!nameTouched) setName(suggestedName(type, year));
    if (!REPEAT_TYPES.includes(type)) setBasedOn("");
  }

  function toggleClass(id: string, checked: boolean) {
    setClassIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((c) => c !== id)));
  }

  function toggleGroup(group: ApiClass[], checked: boolean) {
    const ids = group.map((c) => c.id);
    setClassIds((prev) =>
      checked
        ? [...new Set([...prev, ...ids])]
        : prev.filter((c) => !ids.includes(c) || usedClassIds.has(c)),
    );
  }

  const passingNumber = Number(passing);
  const problems: string[] = [];
  if (!yearId) problems.push("Select an academic year");
  if (!examType) problems.push("Select an exam type");
  if (!name.trim()) problems.push("Enter an exam name");
  if (classIds.length === 0) problems.push("Select at least one class");
  if (!startDate || !endDate) problems.push("Choose start and end dates");
  else if (endDate < startDate) problems.push("End date cannot be before the start date");
  if (year && startDate && (startDate < year.start_date || startDate > year.end_date))
    problems.push(`Dates must be inside ${year.name}`);
  if (year && endDate && (endDate < year.start_date || endDate > year.end_date))
    problems.push(`Dates must be inside ${year.name}`);
  if (passing === "" || Number.isNaN(passingNumber) || passingNumber < 0 || passingNumber > 100)
    problems.push("Passing percentage must be between 0 and 100");
  const firstProblem = [...new Set(problems)][0];

  async function save() {
    if (firstProblem) {
      toast.error(firstProblem);
      return;
    }
    setSaving(true);
    try {
      const body = {
        academicYearId: yearId,
        term: term.trim() || null,
        examType,
        name: name.trim(),
        description: description.trim() || null,
        classIds,
        startDate,
        endDate,
        passingPercentage: passingNumber,
        basedOnExaminationId: REPEAT_TYPES.includes(examType) && basedOn ? basedOn : null,
      };
      const saved = initial
        ? await api.patch<ApiExamination>(`/examinations/${initial.id}`, body)
        : await api.post<ApiExamination>("/examinations", body);
      await queryClient.invalidateQueries({ queryKey: ["examinations"] });
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      toast.success(
        initial ? "Examination updated" : "Examination created. Now add the subject papers.",
      );
      onSaved(saved.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the examination"));
    } finally {
      setSaving(false);
    }
  }

  const repeatCandidates = examinations.filter(
    (x) => x.id !== initial?.id && x.academic_year_id === yearId,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Examination" : "Create Examination"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 text-xs">Academic Year *</Label>
              <Select
                value={yearId}
                onValueChange={(v) => {
                  setYearId(v);
                  setClassIds([]);
                }}
                disabled={hasPapers}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select academic year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}
                      {y.status === "ACTIVE" ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasPapers && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Locked because papers are scheduled.
                </p>
              )}
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Term</Label>
              <Input
                className="h-9"
                list="exam-term-suggestions"
                placeholder="e.g. Term 1"
                value={term}
                maxLength={40}
                onChange={(e) => setTerm(e.target.value)}
              />
              <datalist id="exam-term-suggestions">
                {TERM_SUGGESTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Exam Type *</Label>
              <Select value={examType} onValueChange={chooseType} disabled={marksStarted}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select exam type" />
                </SelectTrigger>
                <SelectContent>
                  {EXAM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Exam Name *</Label>
              <Input
                className="h-9"
                placeholder="e.g. Mid-Term Examination 2026"
                value={name}
                maxLength={120}
                disabled={marksStarted}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
              />
              {marksStarted && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Name and type are locked once marks entry starts.
                </p>
              )}
            </div>
            {REPEAT_TYPES.includes(examType) && (
              <div className="sm:col-span-2">
                <Label className="mb-1.5 text-xs">Original examination (optional)</Label>
                <Select
                  value={basedOn || "none"}
                  onValueChange={(v) => setBasedOn(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select the exam being repeated" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {repeatCandidates.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The original marks are kept unchanged. This exam gets its own papers and marks.
                </p>
              </div>
            )}
            <div>
              <Label className="mb-1.5 text-xs">Start Date *</Label>
              <Input
                type="date"
                className="h-9"
                value={startDate}
                min={year?.start_date}
                max={year?.end_date}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 text-xs">End Date *</Label>
              <Input
                type="date"
                className="h-9"
                value={endDate}
                min={startDate || year?.start_date}
                max={year?.end_date}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Passing Percentage *</Label>
              <Input
                type="number"
                className="h-9"
                min={0}
                max={100}
                step="0.5"
                value={passing}
                onChange={(e) => setPassing(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Used to suggest passing marks for each paper.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 text-xs">Description</Label>
              <Textarea
                rows={2}
                maxLength={1000}
                placeholder="Optional notes for staff"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label className="text-xs">Applicable Classes & Sections *</Label>
              {yearClasses.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => toggleGroup(yearClasses, classIds.length !== yearClasses.length)}
                >
                  {classIds.length === yearClasses.length ? "Clear all" : "Select all"}
                </Button>
              )}
            </div>
            {!yearId ? (
              <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                Select an academic year first.
              </p>
            ) : yearClasses.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                No active classes in this academic year.
              </p>
            ) : (
              <div className="grid max-h-60 gap-2 overflow-y-auto rounded-xl border border-border p-3 sm:grid-cols-2">
                {classGroups.map(([groupName, group]) => {
                  const all = group.every((c) => classIds.includes(c.id));
                  return (
                    <div key={groupName} className="rounded-lg bg-muted/40 p-2">
                      <label className="mb-1 flex items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={all}
                          onCheckedChange={(v) => toggleGroup(group, v === true)}
                        />
                        {groupName}
                      </label>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
                        {group.map((c) => (
                          <label key={c.id} className="flex items-center gap-1.5 text-xs">
                            <Checkbox
                              checked={classIds.includes(c.id)}
                              disabled={usedClassIds.has(c.id) && classIds.includes(c.id)}
                              onCheckedChange={(v) => toggleClass(c.id, v === true)}
                            />
                            Section {c.section}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {classIds.length} selected. Classes that already have papers cannot be removed.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Saving…" : "Save Examination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Examinations overview
// ============================================================================

function ExaminationsTab({
  examinations,
  exams,
  classesById,
  years,
  classes,
  isLoading,
  canManage,
  onOpenSchedule,
}: {
  examinations: ApiExamination[];
  exams: ApiExam[];
  classesById: Map<string, ApiClass>;
  years: ApiAcademicYear[];
  classes: ApiClass[];
  isLoading: boolean;
  canManage: boolean;
  onOpenSchedule: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiExamination | null>(null);
  const [yearFilter, setYearFilter] = useState("all");

  const papersByExamination = useMemo(() => {
    const map = new Map<string, ApiExam[]>();
    for (const e of exams)
      if (e.examination_id) map.set(e.examination_id, [...(map.get(e.examination_id) ?? []), e]);
    return map;
  }, [exams]);

  const visible = examinations.filter(
    (x) => yearFilter === "all" || x.academic_year_name === yearFilter,
  );
  const yearNames = [
    ...new Set(examinations.map((x) => x.academic_year_name ?? "").filter(Boolean)),
  ];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["examinations"] });
    await queryClient.invalidateQueries({ queryKey: ["exams"] });
  }

  function publishSchedule(x: ApiExamination) {
    confirm.ask({
      title: "Publish exam schedule?",
      description: `Students and parents of the selected classes will be able to see the date-sheet for "${x.name}". You can still change draft papers afterwards.`,
      confirmLabel: "Publish Schedule",
      run: async () => {
        try {
          await api.patch(`/examinations/${x.id}`, {
            schedulePublishedAt: new Date().toISOString(),
          });
          await refresh();
          toast.success("Schedule published to students and parents");
        } catch (err) {
          toast.error(errorMessage(err, "Could not publish the schedule"));
        }
      },
    });
  }

  function remove(x: ApiExamination) {
    confirm.ask({
      title: "Delete examination?",
      description: `"${x.name}" will be removed. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      run: async () => {
        try {
          await api.delete(`/examinations/${x.id}`);
          await refresh();
          toast.success("Examination deleted");
        } catch (err) {
          toast.error(errorMessage(err, "Could not delete the examination"));
        }
      },
    });
  }

  return (
    <SectionCard
      title="Examinations"
      subtitle="Mid-Term, End-Term, Unit Tests and other exams for each academic year"
      action={
        canManage ? (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <PlusCircle className="h-4 w-4" /> Create Examination
          </Button>
        ) : undefined
      }
    >
      {yearNames.length > 1 && (
        <div className="mb-3">
          <FilterSelect
            value={yearFilter}
            onChange={setYearFilter}
            options={yearNames}
            placeholder="All academic years"
            className="sm:w-[200px]"
          />
        </div>
      )}
      {isLoading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No examinations yet"
          description={
            canManage
              ? "Create an examination such as “Mid-Term Examination”, then schedule its subject papers."
              : "Examinations created by the school will appear here."
          }
          icon={FileSpreadsheet}
          action={
            canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Create Examination
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((x) => {
            const papers = (papersByExamination.get(x.id) ?? []).filter(
              (p) => p.status !== "CANCELLED",
            );
            const published = papers.filter((p) => p.status === "PUBLISHED").length;
            const submitted = papers.filter((p) => p.status === "REVIEW").length;
            const classNames = x.class_ids.map((id) => classLabel(classesById.get(id)));
            const allPapers = papersByExamination.get(x.id) ?? [];
            return (
              <div key={x.id} className="flex flex-col rounded-xl border border-border p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{x.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {x.exam_type}
                      {x.term ? ` · ${x.term}` : ""}
                      {x.academic_year_name ? ` · ${x.academic_year_name}` : ""}
                    </p>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label="Examination actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(x);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Edit details
                        </DropdownMenuItem>
                        {!x.schedule_published_at && (
                          <DropdownMenuItem
                            disabled={papers.length === 0}
                            onSelect={() => publishSchedule(x)}
                          >
                            <Megaphone className="mr-2 h-4 w-4" /> Publish schedule
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={allPapers.length > 0}
                          onSelect={() => remove(x)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" /> {fmtDate(x.start_date)} –{" "}
                    {fmtDate(x.end_date)}
                  </p>
                  <p className="truncate" title={classNames.join(", ")}>
                    Classes:{" "}
                    {classNames.length
                      ? classNames.slice(0, 4).join(", ") +
                        (classNames.length > 4 ? ` +${classNames.length - 4} more` : "")
                      : "All"}
                  </p>
                  <p>Passing: {x.passing_percentage}%</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <StatusBadge
                    status={`${papers.length} paper${papers.length === 1 ? "" : "s"}`}
                    tone="neutral"
                  />
                  {x.schedule_published_at ? (
                    <StatusBadge status="Schedule published" tone="info" />
                  ) : (
                    <StatusBadge status="Schedule not published" tone="neutral" />
                  )}
                  {submitted > 0 && (
                    <StatusBadge status={`${submitted} to review`} tone="warning" />
                  )}
                  {published > 0 && (
                    <StatusBadge
                      status={`${published}/${papers.length} results published`}
                      tone="success"
                    />
                  )}
                </div>
                <div className="mt-auto pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => onOpenSchedule(x.id)}
                  >
                    <CalendarDays className="mr-1.5 h-4 w-4" />{" "}
                    {canManage ? "Schedule Papers" : "View Schedule"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ExaminationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        papers={editing ? (papersByExamination.get(editing.id) ?? []) : []}
        years={years}
        classes={classes}
        examinations={examinations}
        onSaved={(id) => {
          if (!editing) onOpenSchedule(id);
        }}
      />
      {confirm.dialog}
    </SectionCard>
  );
}

// ============================================================================
// Paper scheduling
// ============================================================================

function PaperFormDialog({
  open,
  onOpenChange,
  examination,
  classes,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examination: ApiExamination;
  classes: ApiClass[];
  initial: ApiExam | null;
}) {
  const queryClient = useQueryClient();
  const { data: mappingsData } = useSubjectMappings(undefined, open);
  const { data: roomsData } = useRooms(open);
  const { data: teachersData } = useTeachers(open);
  const mappings = useMemo(() => mappingsData ?? [], [mappingsData]);
  const rooms = (roomsData ?? []).filter((r) => r.status === "ACTIVE" || r.id === initial?.room_id);
  const teachers = (teachersData ?? []).filter(
    (t) => t.employment_status !== "INACTIVE" || t.id === initial?.invigilator_id,
  );

  const [classIds, setClassIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [maxMarks, setMaxMarks] = useState("100");
  const [passMarks, setPassMarks] = useState("");
  const [passTouched, setPassTouched] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [invigilatorId, setInvigilatorId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  const pct = examination.passing_percentage;
  const suggestPass = (max: string) => {
    const n = Number(max);
    return n > 0 ? String(Math.min(n, Math.ceil((n * pct) / 100))) : "";
  };

  useEffect(() => {
    if (!open) return;
    setClassIds(initial?.class_id ? [initial.class_id] : []);
    setSubjectId(initial?.subject_id ?? "");
    setDate(initial?.date ?? examination.start_date);
    setStartTime(initial?.start_time ?? "09:00");
    setEndTime(initial?.end_time ?? "12:00");
    setMaxMarks(String(initial?.maximum_marks ?? 100));
    setPassMarks(initial ? String(initial.passing_marks ?? "") : suggestPass("100"));
    setPassTouched(Boolean(initial));
    setRoomId(initial?.room_id ?? "");
    setInvigilatorId(initial?.invigilator_id ?? "");
    setInstructions(initial?.instructions ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const examClasses = useMemo(
    () =>
      classes
        .filter((c) =>
          examination.class_ids.length
            ? examination.class_ids.includes(c.id)
            : c.academic_year_id === examination.academic_year_id,
        )
        .sort((a, b) => classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true })),
    [classes, examination],
  );

  // Only subjects assigned to every selected class (and active) can be scheduled.
  const subjectOptions = useMemo(() => {
    if (classIds.length === 0) return [];
    const perClass = classIds.map(
      (id) =>
        new Map(
          mappings.filter((m) => m.class_id === id).map((m) => [m.subject_id, m.subject_name]),
        ),
    );
    const [first, ...rest] = perClass;
    if (!first) return [];
    return [...first.entries()]
      .filter(([id]) => rest.every((m) => m.has(id)))
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [classIds, mappings]);

  const multi = classIds.length > 1;
  const max = Number(maxMarks);
  const pass = Number(passMarks);
  const problems: string[] = [];
  if (classIds.length === 0) problems.push("Select a class");
  if (!subjectId) problems.push("Select a subject");
  if (!date) problems.push("Choose the exam date");
  else if (date < examination.start_date || date > examination.end_date)
    problems.push(
      `Date must be between ${fmtDate(examination.start_date)} and ${fmtDate(examination.end_date)}`,
    );
  if (!startTime || !endTime) problems.push("Enter start and end time");
  else if (endTime <= startTime) problems.push("End time must be after start time");
  if (!(max > 0)) problems.push("Maximum marks must be greater than 0");
  if (passMarks === "" || Number.isNaN(pass) || pass < 0)
    problems.push("Passing marks cannot be negative");
  else if (pass > max) problems.push("Passing marks cannot be more than maximum marks");
  const firstProblem = problems[0];

  async function save() {
    if (firstProblem) {
      toast.error(firstProblem);
      return;
    }
    setSaving(true);
    const body = {
      subjectId,
      date,
      startTime,
      endTime,
      maximumMarks: max,
      passingMarks: pass,
      roomId: multi ? null : roomId || null,
      invigilatorId: multi ? null : invigilatorId || null,
      instructions: instructions.trim() || null,
    };
    try {
      if (initial) {
        await api.patch(`/exams/${initial.id}`, body);
        toast.success("Paper updated");
      } else {
        const failures: string[] = [];
        for (const classId of classIds) {
          try {
            await api.post("/exams", { ...body, examinationId: examination.id, classId });
          } catch (err) {
            failures.push(
              `${classLabel(classes.find((c) => c.id === classId))}: ${errorMessage(err, "failed")}`,
            );
          }
        }
        const created = classIds.length - failures.length;
        if (created > 0)
          toast.success(created === 1 ? "Paper scheduled" : `${created} papers scheduled`);
        if (failures.length) {
          toast.error(failures.join("\n"), { duration: 8000 });
          await queryClient.invalidateQueries({ queryKey: ["exams"] });
          setClassIds(
            classIds.filter((id) =>
              failures.some((f) => f.startsWith(classLabel(classes.find((c) => c.id === id)))),
            ),
          );
          return;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the paper"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit Paper" : "Add Paper"} · {examination.name}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1.5 text-xs">{initial ? "Class" : "Class & Section *"}</Label>
            {initial ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                {classLabel(classes.find((c) => c.id === initial.class_id))}
              </p>
            ) : examClasses.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                This examination has no classes. Edit the examination to add classes.
              </p>
            ) : (
              <>
                <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-xl border border-border p-3">
                  {examClasses.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={classIds.includes(c.id)}
                        onCheckedChange={(v) => {
                          setClassIds((prev) =>
                            v === true ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                          );
                          setSubjectId("");
                        }}
                      />
                      {classLabel(c)}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Select several sections to schedule the same paper for all of them at once.
                </p>
              </>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="mb-1.5 text-xs">Subject *</Label>
              <Select
                value={subjectId}
                onValueChange={setSubjectId}
                disabled={classIds.length === 0}
              >
                <SelectTrigger className="h-9">
                  <SelectValue
                    placeholder={classIds.length ? "Select subject" : "Select a class first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {subjectOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {classIds.length > 0 && subjectOptions.length === 0 && (
                <p className="mt-1 text-[11px] text-destructive">
                  No subject is assigned to all selected classes. Assign subjects under Subjects
                  first.
                </p>
              )}
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Exam Date *</Label>
              <Input
                type="date"
                className="h-9"
                value={date}
                min={examination.start_date}
                max={examination.end_date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="mb-1.5 text-xs">Start Time *</Label>
                <Input
                  type="time"
                  className="h-9"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1.5 text-xs">End Time *</Label>
                <Input
                  type="time"
                  className="h-9"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Maximum Marks *</Label>
              <Input
                type="number"
                className="h-9"
                min={1}
                value={maxMarks}
                onChange={(e) => {
                  setMaxMarks(e.target.value);
                  if (!passTouched) setPassMarks(suggestPass(e.target.value));
                }}
              />
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Passing Marks *</Label>
              <Input
                type="number"
                className="h-9"
                min={0}
                max={max || undefined}
                value={passMarks}
                onChange={(e) => {
                  setPassMarks(e.target.value);
                  setPassTouched(true);
                }}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Suggested from {pct}% of maximum marks.
              </p>
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Room</Label>
              <Select
                value={roomId || "none"}
                onValueChange={(v) => setRoomId(v === "none" ? "" : v)}
                disabled={multi}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No room</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.number ? ` (${r.number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Invigilator</Label>
              <Select
                value={invigilatorId || "none"}
                onValueChange={(v) => setInvigilatorId(v === "none" ? "" : v)}
                disabled={multi}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No invigilator</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {multi && (
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Room and invigilator are set per section — edit each paper after scheduling.
              </p>
            )}
            <div className="sm:col-span-2">
              <Label className="mb-1.5 text-xs">Instructions</Label>
              <Textarea
                rows={2}
                placeholder="Optional, e.g. bring geometry box"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Saving…" : initial ? "Save Paper" : "Schedule Paper"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleTab({
  examinations,
  exams,
  classes,
  classesById,
  selectedId,
  onSelect,
  canManage,
  isLoading,
}: {
  examinations: ApiExamination[];
  exams: ApiExam[];
  classes: ApiClass[];
  classesById: Map<string, ApiClass>;
  selectedId: string;
  onSelect: (id: string) => void;
  canManage: boolean;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [classFilter, setClassFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiExam | null>(null);

  const examination = examinations.find((x) => x.id === selectedId);
  const papers = useMemo(
    () => exams.filter((e) => e.examination_id === selectedId).sort(sortPapers),
    [exams, selectedId],
  );
  const classOptions = [...new Set(papers.map((p) => paperClassLabel(p, classesById)))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  );
  const rows = papers.filter(
    (p) => classFilter === "all" || paperClassLabel(p, classesById) === classFilter,
  );
  const drafts = papers.filter((p) => p.status === "DRAFT");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["exams"] });
    await queryClient.invalidateQueries({ queryKey: ["examinations"] });
  }

  async function run(action: () => Promise<unknown>, success: string, failure: string) {
    try {
      await action();
      await refresh();
      toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err, failure));
    }
  }

  function openMarks(papersToOpen: ApiExam[]) {
    confirm.ask({
      title:
        papersToOpen.length === 1
          ? "Open marks entry?"
          : `Open marks entry for ${papersToOpen.length} papers?`,
      description:
        "Teachers will be able to enter marks. The date, time and marks of these papers can no longer be changed.",
      confirmLabel: "Open Marks Entry",
      run: async () => {
        const failures: string[] = [];
        for (const p of papersToOpen) {
          try {
            await api.patch(`/exams/${p.id}`, { status: "MARKS_ENTRY" });
          } catch (err) {
            failures.push(`${p.subject}: ${errorMessage(err, "failed")}`);
          }
        }
        await refresh();
        if (failures.length) toast.error(failures.join("\n"));
        else toast.success("Marks entry is open");
      },
    });
  }

  if (!examination) {
    return (
      <SectionCard>
        {isLoading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : (
          <EmptyState
            title="Select an examination"
            description="Create or choose an examination to schedule its subject papers."
            icon={CalendarDays}
          />
        )}
        {examinations.length > 0 && (
          <div className="flex justify-center pb-4">
            <ExaminationSelect examinations={examinations} value={selectedId} onChange={onSelect} />
          </div>
        )}
      </SectionCard>
    );
  }

  return (
    <div className="grid gap-4">
      <SectionCard bodyClassName="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ExaminationSelect examinations={examinations} value={selectedId} onChange={onSelect} />
            <div className="text-xs text-muted-foreground">
              {examination.exam_type}
              {examination.term ? ` · ${examination.term}` : ""} · {fmtDate(examination.start_date)}{" "}
              – {fmtDate(examination.end_date)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {examination.schedule_published_at ? (
              <StatusBadge status="Schedule published" tone="info" className="self-center" />
            ) : (
              canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={papers.length === 0}
                  onClick={() =>
                    confirm.ask({
                      title: "Publish exam schedule?",
                      description:
                        "Students and parents of these classes will be able to see the date-sheet.",
                      confirmLabel: "Publish Schedule",
                      run: () =>
                        run(
                          () =>
                            api.patch(`/examinations/${examination.id}`, {
                              schedulePublishedAt: new Date().toISOString(),
                            }),
                          "Schedule published to students and parents",
                          "Could not publish the schedule",
                        ),
                    })
                  }
                >
                  <Megaphone className="mr-1.5 h-4 w-4" /> Publish Schedule
                </Button>
              )
            )}
            {canManage && drafts.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => openMarks(drafts)}>
                <PlayCircle className="mr-1.5 h-4 w-4" /> Open Marks Entry ({drafts.length})
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <PlusCircle className="mr-1.5 h-4 w-4" /> Add Paper
              </Button>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Exam Schedule"
        subtitle={`${papers.filter((p) => p.status !== "CANCELLED").length} papers`}
        action={
          classOptions.length > 1 ? (
            <FilterSelect
              value={classFilter}
              onChange={setClassFilter}
              options={classOptions}
              placeholder="All classes"
            />
          ) : undefined
        }
        bodyClassName="p-0"
      >
        {rows.length === 0 ? (
          <EmptyState
            title="No papers scheduled"
            description={
              canManage
                ? "Add a paper for each subject, e.g. English on 10 Oct, 9:00 AM – 12:00 PM."
                : "Papers will appear here once scheduled."
            }
            icon={CalendarDays}
            action={
              canManage ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Add Paper
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Max / Pass</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Invigilator</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow
                    key={p.id}
                    className={p.status === "CANCELLED" ? "opacity-60" : undefined}
                  >
                    <TableCell className="whitespace-nowrap font-medium">
                      {fmtDate(p.date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {timeRange(p)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {paperClassLabel(p, classesById)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.subject_name ?? p.subject ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {p.maximum_marks ?? "—"} / {p.passing_marks ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {p.room_name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {p.invigilator_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <PaperStatusBadge exam={p} />
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {p.status === "DRAFT" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Paper actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditing(p);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openMarks([p])}>
                                <PlayCircle className="mr-2 h-4 w-4" /> Open marks entry
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() =>
                                  confirm.ask({
                                    title: "Cancel this paper?",
                                    description: `${p.subject} for ${paperClassLabel(p, classesById)} will be marked as cancelled and kept for the record.`,
                                    confirmLabel: "Cancel Paper",
                                    destructive: true,
                                    run: () =>
                                      run(
                                        () => api.patch(`/exams/${p.id}`, { status: "CANCELLED" }),
                                        "Paper cancelled",
                                        "Could not cancel the paper",
                                      ),
                                  })
                                }
                              >
                                <Ban className="mr-2 h-4 w-4" /> Cancel paper
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() =>
                                  confirm.ask({
                                    title: "Delete this paper?",
                                    description: `${p.subject} for ${paperClassLabel(p, classesById)} will be removed from the schedule.`,
                                    confirmLabel: "Delete",
                                    destructive: true,
                                    run: () =>
                                      run(
                                        () => api.delete(`/exams/${p.id}`),
                                        "Paper deleted",
                                        "Could not delete the paper",
                                      ),
                                  })
                                }
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3" /> Locked
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <PaperFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        examination={examination}
        classes={classes}
        initial={editing}
      />
      {confirm.dialog}
    </div>
  );
}

// ============================================================================
// Marks entry (School Admin / authorized staff and teachers)
// ============================================================================

type MarkRow = { status: AttendanceState; marks: string; remarks: string };

function MarksEntryTab({
  exams,
  examinations,
  classesById,
  mode,
  canEnterMarks,
  initialPaperId,
}: {
  exams: ApiExam[];
  examinations: ApiExamination[];
  classesById: Map<string, ApiClass>;
  mode: "admin" | "teacher";
  canEnterMarks: boolean;
  initialPaperId?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const papers = useMemo(
    () =>
      exams
        .filter((e) => ["MARKS_ENTRY", "REVIEW", "PUBLISHED"].includes(e.status))
        .sort(sortPapers),
    [exams],
  );
  const examinationOptions = examinations.filter((x) =>
    papers.some((p) => p.examination_id === x.id),
  );
  const hasUngrouped = papers.some((p) => !p.examination_id);

  const [examinationId, setExaminationId] = useState("");
  const [classId, setClassId] = useState("");
  const [paperId, setPaperId] = useState("");
  const [rows, setRows] = useState<Record<string, MarkRow>>({});
  const [initialisedFor, setInitialisedFor] = useState("");
  const [saving, setSaving] = useState(false);

  // Jump straight to a paper (e.g. "View marks" from the Review tab).
  useEffect(() => {
    const p = papers.find((e) => e.id === initialPaperId);
    if (!p) return;
    setExaminationId(p.examination_id ?? "none");
    setClassId(p.class_id ?? "");
    setPaperId(p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPaperId]);

  useEffect(() => {
    if (!examinationId && (examinationOptions[0] || hasUngrouped))
      setExaminationId(examinationOptions[0]?.id ?? "none");
  }, [examinationId, examinationOptions, hasUngrouped]);

  const examPapers = papers.filter((p) =>
    examinationId === "none" ? !p.examination_id : p.examination_id === examinationId,
  );
  const classOptions = [
    ...new Map(
      examPapers.map((p) => [p.class_id ?? "", paperClassLabel(p, classesById)]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  const classPapers = examPapers.filter((p) => p.class_id === classId);
  const paper = papers.find((p) => p.id === paperId);

  useEffect(() => {
    if (classOptions.length && !classOptions.some(([id]) => id === classId))
      setClassId(classOptions[0]?.[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examinationId, classOptions.length]);
  useEffect(() => {
    if (!classPapers.some((p) => p.id === paperId)) setPaperId(classPapers[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, examinationId, classPapers.length]);

  const { data: studentsData, isLoading: studentsLoading } = useStudents(Boolean(paper?.class_id), {
    classId: paper?.class_id ?? "",
  });
  const { data: resultsData, isLoading: resultsLoading } = useExamResults(paper?.id);
  const roster = useMemo(
    () =>
      (studentsData ?? [])
        .filter(
          (s) =>
            s.class_id === paper?.class_id &&
            s.status !== "Archived" &&
            (!paper?.academic_year_id || s.academic_year_id === paper.academic_year_id),
        )
        .sort((a, b) => (a.roll ?? 9999) - (b.roll ?? 9999) || a.name.localeCompare(b.name)),
    [studentsData, paper],
  );
  const resultByStudent = useMemo(
    () => new Map((resultsData ?? []).map((r) => [r.student_id, r])),
    [resultsData],
  );

  // Load saved marks into the grid once per paper (and again after each save).
  useEffect(() => {
    if (!paper || studentsLoading || resultsLoading || initialisedFor === paper.id) return;
    const next: Record<string, MarkRow> = {};
    for (const s of roster) {
      const r = resultByStudent.get(s.id);
      next[s.id] = {
        status: (r?.attendance_status ?? "PRESENT") as AttendanceState,
        marks: r?.marks !== null && r?.marks !== undefined ? String(r.marks) : "",
        remarks: r?.remarks ?? "",
      };
    }
    setRows(next);
    setInitialisedFor(paper.id);
  }, [paper, roster, resultByStudent, studentsLoading, resultsLoading, initialisedFor]);

  const max = Number(paper?.maximum_marks ?? 100);
  const passMark = Number(paper?.passing_marks ?? 0);
  const editable =
    canEnterMarks &&
    !!paper &&
    (mode === "teacher"
      ? paper.status === "MARKS_ENTRY"
      : ["MARKS_ENTRY", "REVIEW"].includes(paper.status));

  function rowProblem(name: string, row: MarkRow | undefined, requireComplete: boolean) {
    if (!row) return requireComplete ? `Enter marks for ${name}` : null;
    if (row.status !== "PRESENT") return null;
    if (row.marks.trim() === "")
      return requireComplete
        ? `Enter marks for ${name} or mark them Absent / Not applicable`
        : null;
    const n = Number(row.marks);
    if (Number.isNaN(n) || n < 0 || n > max)
      return `Marks for ${name} must be between 0 and ${max}`;
    return null;
  }

  const entered = roster.filter((s) => {
    const r = rows[s.id];
    return r && (r.status !== "PRESENT" || r.marks.trim() !== "");
  }).length;
  const absent = roster.filter((s) => rows[s.id]?.status === "ABSENT").length;

  function update(id: string, patch: Partial<MarkRow>) {
    setRows((prev) => ({
      ...prev,
      [id]: { status: "PRESENT", marks: "", remarks: "", ...prev[id], ...patch },
    }));
  }

  function fillBlanks(status: AttendanceState) {
    setRows((prev) => {
      const next = { ...prev };
      for (const s of roster) {
        const r = next[s.id];
        if (!r || (r.status === "PRESENT" && r.marks.trim() === ""))
          next[s.id] = { status, marks: "", remarks: r?.remarks ?? "" };
      }
      return next;
    });
  }

  async function saveMarks(requireComplete: boolean) {
    if (!paper) return false;
    for (const s of roster) {
      const problem = rowProblem(s.name, rows[s.id], requireComplete);
      if (problem) {
        toast.error(problem);
        return false;
      }
    }
    const entries = roster
      .filter((s) => {
        const r = rows[s.id];
        return r && (r.status !== "PRESENT" || r.marks.trim() !== "");
      })
      .map((s) => {
        const r = rows[s.id]!;
        return {
          studentId: s.id,
          attendanceStatus: r.status,
          ...(r.status === "PRESENT" ? { marks: Number(r.marks) } : {}),
          remarks: r.remarks.trim() || null,
        };
      });
    if (!entries.length) {
      toast.error("Enter at least one student's marks");
      return false;
    }
    await api.post("/results/bulk", { examId: paper.id, entries });
    return true;
  }

  // Reload the grid only after the refetch lands, so it never re-reads stale cached marks.
  async function refreshAfterSave() {
    await queryClient.invalidateQueries({ queryKey: ["results"] });
    await queryClient.invalidateQueries({ queryKey: ["exams"] });
    setInitialisedFor("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (await saveMarks(false)) {
        toast.success("Marks saved");
        await refreshAfterSave();
      }
    } catch (err) {
      toast.error(errorMessage(err, "Could not save marks"));
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit() {
    if (!paper) return;
    for (const s of roster) {
      const problem = rowProblem(s.name, rows[s.id], true);
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    confirm.ask({
      title: "Submit marks for review?",
      description: `Marks for ${paper.subject} (${paperClassLabel(paper, classesById)}) will be sent for review. ${mode === "teacher" ? "You cannot change them after submitting unless they are returned to you." : ""}`,
      confirmLabel: "Submit",
      run: async () => {
        setSaving(true);
        try {
          if (!(await saveMarks(true))) return;
          await api.post(`/results/exams/${paper.id}/submit`, {});
          toast.success("Marks submitted for review");
          await refreshAfterSave();
        } catch (err) {
          toast.error(errorMessage(err, "Could not submit marks"));
          await refreshAfterSave();
        } finally {
          setSaving(false);
        }
      },
    });
  }

  if (papers.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          title="No papers open for marks entry"
          description={
            mode === "teacher"
              ? "Your papers will appear here once the School Admin opens them for marks entry."
              : "Open marks entry for a paper from the Exam Schedule tab."
          }
          icon={ClipboardCheck}
        />
      </SectionCard>
    );
  }

  return (
    <div className="grid gap-4">
      <SectionCard title="Enter Marks" subtitle="Select the examination, class and subject">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 text-xs">Examination</Label>
            <Select
              value={examinationId}
              onValueChange={(v) => {
                setExaminationId(v);
                setClassId("");
                setPaperId("");
              }}
            >
              <SelectTrigger className="h-9 bg-surface">
                <SelectValue placeholder="Select examination" />
              </SelectTrigger>
              <SelectContent>
                {examinationOptions.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
                {hasUngrouped && <SelectItem value="none">Other papers</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Class</Label>
            <Select
              value={classId}
              onValueChange={(v) => {
                setClassId(v);
                setPaperId("");
              }}
            >
              <SelectTrigger className="h-9 bg-surface">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classOptions.map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Subject</Label>
            <Select value={paperId} onValueChange={setPaperId}>
              <SelectTrigger className="h-9 bg-surface">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {classPapers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.subject_name ?? p.subject} · {fmtDate(p.date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {paper && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-muted px-4 py-2.5 text-xs">
            <span>
              Maximum Marks:{" "}
              <span className="font-semibold text-foreground">{paper.maximum_marks}</span>
            </span>
            <span>
              Passing Marks:{" "}
              <span className="font-semibold text-foreground">{paper.passing_marks}</span>
            </span>
            <span>
              Entered:{" "}
              <span className="font-semibold text-foreground">
                {entered} / {roster.length}
              </span>
            </span>
            {absent > 0 && (
              <span>
                Absent: <span className="font-semibold text-foreground">{absent}</span>
              </span>
            )}
            <PaperStatusBadge exam={paper} />
          </div>
        )}
        {paper?.status === "MARKS_ENTRY" && paper.review_note && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive">
            <Undo2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Returned for correction:</span> {paper.review_note}
            </span>
          </div>
        )}
        {paper && !editable && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {paper.status === "PUBLISHED"
              ? "Results are published. Marks are locked."
              : paper.status === "REVIEW"
                ? "Marks have been submitted and are waiting for review."
                : "You can view these marks but not change them."}
          </div>
        )}
      </SectionCard>

      {paper && (
        <SectionCard
          title={`${paper.subject_name ?? paper.subject} · ${paperClassLabel(paper, classesById)}`}
          subtitle={`${roster.length} students`}
          action={
            editable ? (
              <div className="flex flex-wrap justify-end gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="hidden sm:inline-flex">
                      Fill blanks…
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => fillBlanks("ABSENT")}>
                      Mark blanks as Absent
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => fillBlanks("NOT_APPLICABLE")}>
                      Mark blanks as Not applicable
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="h-3.5 w-3.5" /> Save Draft
                </Button>
                {paper.status === "MARKS_ENTRY" && (
                  <Button size="sm" className="gap-1.5" onClick={handleSubmit} disabled={saving}>
                    <Send className="h-3.5 w-3.5" /> Submit
                  </Button>
                )}
              </div>
            ) : undefined
          }
          bodyClassName="p-0"
        >
          {studentsLoading || resultsLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : roster.length === 0 ? (
            <EmptyState
              title="No students in this class"
              description="Add students to the class to enter marks."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Roll</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="w-40">Attendance</TableHead>
                    <TableHead className="w-28">Marks (/{max})</TableHead>
                    <TableHead className="w-20">Result</TableHead>
                    <TableHead className="w-16">Grade</TableHead>
                    <TableHead className="min-w-40">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((s) => {
                    const row = rows[s.id] ?? {
                      status: "PRESENT" as AttendanceState,
                      marks: "",
                      remarks: "",
                    };
                    const n = Number(row.marks);
                    const invalid =
                      row.status === "PRESENT" &&
                      row.marks.trim() !== "" &&
                      (Number.isNaN(n) || n < 0 || n > max);
                    const saved = resultByStudent.get(s.id);
                    const result =
                      row.status === "ABSENT"
                        ? { label: "Absent", tone: "danger" as const }
                        : row.status === "NOT_APPLICABLE"
                          ? { label: "N/A", tone: "neutral" as const }
                          : row.marks.trim() === "" || invalid
                            ? null
                            : n >= passMark
                              ? { label: "Pass", tone: "success" as const }
                              : { label: "Fail", tone: "danger" as const };
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{s.roll ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{s.name}</TableCell>
                        <TableCell>
                          <Select
                            value={row.status}
                            onValueChange={(v) =>
                              update(s.id, {
                                status: v as AttendanceState,
                                ...(v !== "PRESENT" ? { marks: "" } : {}),
                              })
                            }
                            disabled={!editable}
                          >
                            <SelectTrigger className="h-8 w-36 bg-surface text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ATTENDANCE_LABEL) as AttendanceState[]).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {ATTENDANCE_LABEL[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={max}
                            step="0.5"
                            aria-label={`Marks for ${s.name}`}
                            aria-invalid={invalid}
                            value={row.marks}
                            disabled={!editable || row.status !== "PRESENT"}
                            placeholder={row.status === "PRESENT" ? "" : "—"}
                            onChange={(e) => update(s.id, { marks: e.target.value })}
                            className={cn(
                              "h-8 w-20 bg-surface text-xs",
                              invalid && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          {result ? <StatusBadge status={result.label} tone={result.tone} /> : "—"}
                        </TableCell>
                        <TableCell>
                          {saved?.grade ? <GradeBadge grade={saved.grade} /> : "—"}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.remarks}
                            maxLength={300}
                            disabled={!editable}
                            placeholder={editable ? "Optional" : ""}
                            onChange={(e) => update(s.id, { remarks: e.target.value })}
                            className="h-8 min-w-40 bg-surface text-xs"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      )}
      {confirm.dialog}
    </div>
  );
}

// ============================================================================
// Review & publish
// ============================================================================

function ReviewTab({
  examinations,
  exams,
  classesById,
  selectedId,
  onSelect,
  canPublish,
  onViewMarks,
}: {
  examinations: ApiExamination[];
  exams: ApiExam[];
  classesById: Map<string, ApiClass>;
  selectedId: string;
  onSelect: (id: string) => void;
  canPublish: boolean;
  onViewMarks: (paperId: string) => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: resultsData } = useResults();
  const { data: studentsData } = useStudents();
  const [returning, setReturning] = useState<ApiExam | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const papers = exams
    .filter((e) => e.examination_id === selectedId && e.status !== "CANCELLED")
    .sort(sortPapers);
  const resultCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resultsData ?? [])
      if (r.exam_id) map.set(r.exam_id, (map.get(r.exam_id) ?? 0) + 1);
    return map;
  }, [resultsData]);
  const classSize = (p: ApiExam) =>
    (studentsData ?? []).filter(
      (s) =>
        s.class_id === p.class_id &&
        s.status !== "Archived" &&
        (!p.academic_year_id || s.academic_year_id === p.academic_year_id),
    ).length;

  const byClass = useMemo(() => {
    const map = new Map<string, ApiExam[]>();
    for (const p of papers) {
      const key = paperClassLabel(p, classesById);
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }),
    );
  }, [papers, classesById]);
  const submitted = papers.filter((p) => p.status === "REVIEW");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["exams"] });
    await queryClient.invalidateQueries({ queryKey: ["results"] });
    await queryClient.invalidateQueries({ queryKey: ["examinations"] });
  }

  function publish(list: ApiExam[]) {
    confirm.ask({
      title:
        list.length === 1
          ? "Approve and publish result?"
          : `Publish ${list.length} submitted papers?`,
      description:
        "Students and parents will see these marks immediately. Published marks cannot be changed.",
      confirmLabel: "Publish Result",
      run: async () => {
        setBusy(true);
        const failures: string[] = [];
        for (const p of list) {
          try {
            await api.post(`/results/exams/${p.id}/publish`, {});
          } catch (err) {
            failures.push(
              `${p.subject} (${paperClassLabel(p, classesById)}): ${errorMessage(err, "failed")}`,
            );
          }
        }
        await refresh();
        setBusy(false);
        const done = list.length - failures.length;
        if (done) toast.success(done === 1 ? "Result published" : `${done} results published`);
        if (failures.length) toast.error(failures.join("\n"), { duration: 8000 });
      },
    });
  }

  async function sendBack() {
    if (!returning) return;
    setBusy(true);
    try {
      await api.post(`/results/exams/${returning.id}/return`, { note });
      await refresh();
      toast.success("Marks returned to the teacher");
      setReturning(null);
      setNote("");
    } catch (err) {
      toast.error(errorMessage(err, "Could not return the marks"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <SectionCard bodyClassName="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ExaminationSelect examinations={examinations} value={selectedId} onChange={onSelect} />
          {canPublish && submitted.length > 1 && (
            <Button size="sm" onClick={() => publish(submitted)} disabled={busy}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Publish all submitted ({submitted.length})
            </Button>
          )}
        </div>
      </SectionCard>

      {papers.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="Nothing to review"
            description="Submitted marks will appear here for approval."
            icon={ClipboardCheck}
          />
        </SectionCard>
      ) : (
        byClass.map(([label, list]) => (
          <SectionCard
            key={label}
            title={label}
            subtitle={`${list.filter((p) => p.status === "PUBLISHED").length} of ${list.length} published`}
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Exam Date</TableHead>
                    <TableHead>Marks Entered</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((p) => {
                    const total = classSize(p);
                    const done = resultCount.get(p.id) ?? 0;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {p.subject_name ?? p.subject}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {fmtDate(p.date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {p.status === "DRAFT" ? (
                            "—"
                          ) : (
                            <span className={cn(done < total && "text-warning")}>
                              {done} / {total}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <PaperStatusBadge exam={p} />
                          {p.status === "DRAFT" && (
                            <span className="ml-1 text-[11px] text-muted-foreground">
                              Marks entry not open
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            {p.status !== "DRAFT" && (
                              <Button size="sm" variant="ghost" onClick={() => onViewMarks(p.id)}>
                                View marks
                              </Button>
                            )}
                            {canPublish && p.status === "REVIEW" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => {
                                    setReturning(p);
                                    setNote("");
                                  }}
                                >
                                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Return
                                </Button>
                                <Button size="sm" disabled={busy} onClick={() => publish([p])}>
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve & Publish
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        ))
      )}

      <Dialog open={returning !== null} onOpenChange={(open) => !open && setReturning(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Return marks to teacher</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {returning?.subject} · {returning ? paperClassLabel(returning, classesById) : ""}. The
            teacher can correct and resubmit.
          </p>
          <div>
            <Label className="mb-1.5 text-xs">Review comment</Label>
            <Textarea
              rows={3}
              maxLength={500}
              placeholder="e.g. Please recheck marks for roll no. 3"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturning(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={sendBack} disabled={busy}>
              <Undo2 className="mr-1.5 h-4 w-4" /> Return to Teacher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirm.dialog}
    </div>
  );
}

// ============================================================================
// Pages
// ============================================================================

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentExamsView />;
  if (user?.role === "TEACHER") return <TeacherExamsView />;
  return <AdminExaminationsView />;
}

function TeacherExamsView() {
  const { data: exams, isLoading } = useExams();
  const { data: examinationsData } = useExaminations();
  const { data: classesData } = useClasses();
  const { data: teacher } = useMyTeacherProfile();
  const { data: teaching } = useMyTeacherTeachingSubjects();
  const { data: canEnter } = useHasPermission("results.manage");
  const rows = useMemo(
    () => (exams ?? []).filter((e) => e.status !== "CANCELLED").sort(sortPapers),
    [exams],
  );
  const classesById = useMemo(
    () => new Map((classesData ?? []).map((c) => [c.id, c])),
    [classesData],
  );
  const examinationName = useMemo(
    () => new Map((examinationsData ?? []).map((x) => [x.id, x.name])),
    [examinationsData],
  );

  // Papers this teacher may enter marks for: their subject in that class, or any paper of
  // a class they are Class Teacher of. The backend enforces the same rule.
  const myPapers = useMemo(() => {
    const pairs = new Set((teaching ?? []).map((t) => `${t.class_id}:${t.subject_id}`));
    const ownClasses = new Set(
      (classesData ?? [])
        .filter((c) => teacher?.id && c.class_teacher_id === teacher.id)
        .map((c) => c.id),
    );
    return rows.filter(
      (e) => pairs.has(`${e.class_id}:${e.subject_id}`) || ownClasses.has(e.class_id ?? ""),
    );
  }, [rows, teaching, classesData, teacher]);
  const toSubmit = myPapers.filter((e) => e.status === "MARKS_ENTRY").length;

  return (
    <div>
      <PageHeader
        title="Examinations"
        description="Exam schedule for your classes and marks entry for your subjects."
        breadcrumb={["Dashboard", "Examinations"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Papers" value={rows.length} icon={CalendarDays} tone="navy" />
        <InfoCard label="Marks to Enter" value={toSubmit} icon={Clock} tone="warning" />
        <InfoCard
          label="Published"
          value={rows.filter((e) => e.status === "PUBLISHED").length}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <Tabs defaultValue={toSubmit > 0 ? "marks" : "schedule"}>
        <TabsList className="mb-4">
          <TabsTrigger value="schedule">Exam Schedule</TabsTrigger>
          <TabsTrigger value="marks">Enter Marks</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule">
          <div className="panel">
            {isLoading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : rows.length === 0 ? (
              <EmptyState
                title="No exams scheduled"
                description="Exams for your classes will appear here."
                icon={CalendarDays}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Examination</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">
                          {(e.examination_id && examinationName.get(e.examination_id)) ||
                            e.name ||
                            e.term}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {paperClassLabel(e, classesById)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                          {e.subject_name ?? e.subject ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {fmtDate(e.date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {timeRange(e)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {e.room_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <PaperStatusBadge exam={e} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="marks">
          <MarksEntryTab
            exams={myPapers}
            examinations={examinationsData ?? []}
            classesById={classesById}
            mode="teacher"
            canEnterMarks={canEnter === true}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StudentExamsView() {
  const { data: exams, isLoading } = useExams();
  const { data: examinationsData } = useExaminations();
  const examinationName = useMemo(
    () => new Map((examinationsData ?? []).map((x) => [x.id, x.name])),
    [examinationsData],
  );
  // The backend only returns papers the student may see (published schedules and later).
  const rows = (exams ?? []).filter((e) => e.status !== "CANCELLED").sort(sortPapers);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((e) => (e.date ?? "") >= today && e.status !== "PUBLISHED");

  return (
    <div>
      <PageHeader
        title="My Exams"
        description="Exam date-sheet for your class."
        breadcrumb={["Dashboard", "My Exams"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Upcoming Exams" value={upcoming.length} icon={CalendarDays} tone="navy" />
        <InfoCard
          label="Results Published"
          value={rows.filter((e) => e.status === "PUBLISHED").length}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <div className="panel">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No upcoming exams"
            description="Your exam schedule will appear here."
            icon={CalendarDays}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Examination</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {(e.examination_id && examinationName.get(e.examination_id)) ||
                        e.name ||
                        e.term}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {e.subject_name ?? e.subject ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDate(e.date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {timeRange(e)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {e.room_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {e.status === "PUBLISHED" ? (
                        <StatusBadge status="Result Published" tone="success" />
                      ) : (e.date ?? "") >= today ? (
                        <StatusBadge status="Upcoming" tone="info" />
                      ) : (
                        <StatusBadge status="Completed" tone="neutral" />
                      )}
                    </TableCell>
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

function AdminExaminationsView() {
  const perms = useExamPermissions();
  const { data: examinationsData, isLoading: examinationsLoading } = useExaminations(perms.canView);
  const { data: examsData, isLoading: examsLoading } = useExams(perms.canView);
  const { data: classesData } = useClasses(perms.canView);
  const { data: yearsData } = useAcademicYears(perms.canView && perms.canManage);
  const examinations = useMemo(() => examinationsData ?? [], [examinationsData]);
  const exams = useMemo(() => examsData ?? [], [examsData]);
  const classes = useMemo(() => classesData ?? [], [classesData]);
  const classesById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const [tab, setTab] = useState("overview");
  const [selectedId, setSelectedId] = useState("");
  const [marksPaperId, setMarksPaperId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!selectedId && examinations[0]) setSelectedId(examinations[0].id);
  }, [selectedId, examinations]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { DRAFT: 0, MARKS_ENTRY: 0, REVIEW: 0, PUBLISHED: 0 };
    for (const e of exams) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [exams]);

  if (perms.loading) {
    return <TableSkeleton rows={4} cols={4} />;
  }
  if (!perms.canView) {
    return (
      <div>
        <PageHeader title="Examination Management" breadcrumb={["Dashboard", "Examinations"]} />
        <div className="panel">
          <EmptyState
            title="You don't have access to Examinations"
            description="Ask your School Admin to give your role examination permissions under Roles & Permissions."
            icon={ShieldAlert}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Examination Management"
        description="Create examinations, schedule subject papers, enter marks and publish results."
        breadcrumb={["Dashboard", "Examinations"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          label="Total Exams"
          value={examinations.length}
          hint={`${exams.length} subject papers`}
          icon={CalendarDays}
          tone="navy"
        />
        <InfoCard label="Draft" value={counts["DRAFT"] ?? 0} icon={Clock} tone="info" />
        <InfoCard
          label="Marks Entry"
          value={(counts["MARKS_ENTRY"] ?? 0) + (counts["REVIEW"] ?? 0)}
          hint={`${counts["REVIEW"] ?? 0} awaiting review`}
          icon={PlayCircle}
          tone="warning"
        />
        <InfoCard
          label="Published"
          value={counts["PUBLISHED"] ?? 0}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-4 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Examinations</TabsTrigger>
            <TabsTrigger value="schedule">Exam Schedule</TabsTrigger>
            <TabsTrigger value="marks">Marks Entry</TabsTrigger>
            <TabsTrigger value="review">
              Review & Publish{(counts["REVIEW"] ?? 0) > 0 ? ` (${counts["REVIEW"]})` : ""}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview">
          <ExaminationsTab
            examinations={examinations}
            exams={exams}
            classesById={classesById}
            years={yearsData ?? []}
            classes={classes}
            isLoading={examinationsLoading || examsLoading}
            canManage={perms.canManage}
            onOpenSchedule={(id) => {
              setSelectedId(id);
              setTab("schedule");
            }}
          />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleTab
            examinations={examinations}
            exams={exams}
            classes={classes}
            classesById={classesById}
            selectedId={selectedId}
            onSelect={setSelectedId}
            canManage={perms.canManage}
            isLoading={examinationsLoading}
          />
        </TabsContent>
        <TabsContent value="marks">
          <MarksEntryTab
            exams={exams}
            examinations={examinations}
            classesById={classesById}
            mode="admin"
            canEnterMarks={perms.canEnterMarks}
            initialPaperId={marksPaperId}
          />
        </TabsContent>
        <TabsContent value="review">
          <ReviewTab
            examinations={examinations}
            exams={exams}
            classesById={classesById}
            selectedId={selectedId}
            onSelect={setSelectedId}
            canPublish={perms.canPublish}
            onViewMarks={(id) => {
              setMarksPaperId(id);
              setTab("marks");
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
