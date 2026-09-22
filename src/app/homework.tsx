"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Clock, CheckCircle2, GraduationCap, Plus } from "lucide-react";
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  EmptyState,
  Pager,
  usePaged,
} from "@/components/shared/ui-kit";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import {
  useHomework,
  useHomeworkSubmissions,
  useMyTeacherProfile,
  useClasses,
  useSubjects,
  useTeachers,
  type ApiHomework,
  type ApiHomeworkSubmission,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Eye } from "lucide-react";

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentHomeworkView />;
  if (user?.role === "TEACHER") return <TeacherHomeworkView />;
  return <AdminHomeworkView />;
}

function TeacherHomeworkView() {
  const queryClient = useQueryClient();
  const { data: teacher } = useMyTeacherProfile();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: rows, isLoading } = useHomework();
  const [createOpen, setCreateOpen] = useState(false);
  const [submissionsFor, setSubmissionsFor] = useState<ApiHomework | null>(null);

  const assignedClassIds: string[] = teacher ? JSON.parse(teacher.assigned_classes) : [];
  const assignedSubjectIds: string[] = teacher ? JSON.parse(teacher.assigned_subjects) : [];
  const myClasses = (classes ?? []).filter((c) => assignedClassIds.includes(c.id));
  const mySubjects = (subjects ?? []).filter((s) => assignedSubjectIds.includes(s.id));
  const classNameById = new Map(myClasses.map((c) => [c.id, `${c.name}-${c.section}`]));

  const myHomework = (rows ?? []).filter((h) => h.teacher_id === teacher?.id);

  async function remove(id: string) {
    try {
      await api.delete(`/homework/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["homework"] });
      toast.success("Homework deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete homework");
    }
  }

  return (
    <div>
      <PageHeader
        title="Homework"
        description="Create and manage homework for your assigned classes."
        breadcrumb={["Dashboard", "Homework"]}
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Assign Homework
              </Button>
            </DialogTrigger>
            <TeacherAssignDialog
              classes={myClasses}
              subjects={mySubjects}
              onClose={() => setCreateOpen(false)}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard
          label="Total Assigned"
          value={myHomework.length}
          icon={ClipboardList}
          tone="navy"
        />
        <InfoCard label="Classes" value={myClasses.length} icon={GraduationCap} tone="info" />
        <InfoCard label="Subjects" value={mySubjects.length} icon={CheckCircle2} tone="success" />
      </div>

      <SectionCard className="mt-5" title="My Homework" subtitle="Assignments you've created">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : myHomework.length === 0 ? (
          <EmptyState
            title="No homework assigned yet"
            description="Use Assign Homework to create your first assignment."
          />
        ) : (
          <div className="grid gap-3">
            {myHomework.map((h) => (
              <div
                key={h.id}
                className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{h.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.subject} · {classNameById.get(h.class_id ?? "") ?? "—"} · Due{" "}
                    {h.due_date ?? "—"}
                  </p>
                  {h.description && (
                    <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                      {h.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSubmissionsFor(h)}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Submissions
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => remove(h.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog open={!!submissionsFor} onOpenChange={(o) => !o && setSubmissionsFor(null)}>
        {submissionsFor && <SubmissionsDialog homework={submissionsFor} />}
      </Dialog>
    </div>
  );
}

function TeacherAssignDialog({
  classes,
  subjects,
  onClose,
}: {
  classes: { id: string; name: string; section: string }[];
  subjects: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [subject, setSubject] = useState(subjects[0]?.name ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!classId) return toast.error("You have no assigned classes");
    setSubmitting(true);
    try {
      await api.post("/homework", { classId, subject, title, description, dueDate });
      await queryClient.invalidateQueries({ queryKey: ["homework"] });
      toast.success("Homework assigned");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to assign homework");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Assign Homework</DialogTitle>
      </DialogHeader>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="thw-title">Title</Label>
          <Input
            id="thw-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Chapter 4 exercises"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  Class {c.name}
                  {c.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Subject</Label>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="thw-due">Due Date</Label>
          <Input
            id="thw-due"
            type="date"
            required
            min={new Date().toISOString().slice(0, 10)}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="thw-desc">Description</Label>
          <Textarea
            id="thw-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the assignment…"
          />
        </div>
        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !classId}>
            Assign Homework
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function SubmissionsDialog({ homework: h }: { homework: ApiHomework }) {
  const queryClient = useQueryClient();
  const { data: submissions, isLoading } = useHomeworkSubmissions(h.id);
  const [drafts, setDrafts] = useState<Record<string, { feedback: string; grade: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function review(s: ApiHomeworkSubmission) {
    const draft = drafts[s.id] ?? { feedback: s.feedback ?? "", grade: s.grade ?? "" };
    setSavingId(s.id);
    try {
      await api.patch(`/homework-submissions/${s.id}`, {
        feedback: draft.feedback,
        grade: draft.grade,
      });
      await queryClient.invalidateQueries({ queryKey: [`homework-submissions-all-${h.id}`] });
      toast.success("Feedback saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save feedback");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Submissions — {h.title}</DialogTitle>
      </DialogHeader>
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !submissions || submissions.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="Students haven't submitted this homework yet."
        />
      ) : (
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto">
          {submissions.map((s) => {
            const draft = drafts[s.id] ?? { feedback: s.feedback ?? "", grade: s.grade ?? "" };
            return (
              <div key={s.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{s.student_name ?? s.student_id}</p>
                  <StatusBadge status={s.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.file_name ?? "No file"} · Submitted {s.submitted_at}
                </p>
                {s.note && <p className="mt-1 text-xs text-muted-foreground">Note: {s.note}</p>}
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_100px_auto]">
                  <Input
                    placeholder="Feedback"
                    value={draft.feedback}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [s.id]: { ...draft, feedback: e.target.value } }))
                    }
                  />
                  <Input
                    placeholder="Grade"
                    value={draft.grade}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [s.id]: { ...draft, grade: e.target.value } }))
                    }
                  />
                  <Button size="sm" disabled={savingId === s.id} onClick={() => review(s)}>
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DialogContent>
  );
}

function StudentHomeworkView() {
  const { data: rows, isLoading } = useHomework();
  const [submitFor, setSubmitFor] = useState<ApiHomework | null>(null);

  const items = rows ?? [];
  const total = items.length;
  const pending = items.filter((h) => !h.submission_status).length;
  const submitted = items.filter(
    (h) => h.submission_status === "Submitted" || h.submission_status === "Late",
  ).length;
  const reviewed = items.filter((h) => h.submission_status === "Reviewed").length;

  return (
    <div>
      <PageHeader
        title="My Homework"
        description="View assignments and submit your work."
        breadcrumb={["Dashboard", "My Homework"]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Assignments" value={total} icon={ClipboardList} tone="navy" />
        <InfoCard label="Pending" value={pending} icon={Clock} tone="warning" />
        <InfoCard label="Submitted" value={submitted} icon={CheckCircle2} tone="info" />
        <InfoCard label="Reviewed" value={reviewed} icon={GraduationCap} tone="success" />
      </div>

      <SectionCard className="mt-5" title="Assignments" subtitle="Your class homework">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState title="No homework assigned yet" description="Check back later." />
        ) : (
          <div className="grid gap-3">
            {items.map((h) => {
              const status = h.submission_status ?? "Pending";
              return (
                <div
                  key={h.id}
                  className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{h.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.subject} · Due {h.due_date ?? "—"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge status={status} />
                      {h.submission_grade && (
                        <StatusBadge status={`Grade: ${h.submission_grade}`} tone="success" />
                      )}
                    </div>
                    {h.submission_feedback && (
                      <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                        Feedback: {h.submission_feedback}
                      </p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => setSubmitFor(h)}>
                    {h.submission_id ? "Resubmit" : "Submit"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <Dialog open={!!submitFor} onOpenChange={(o) => !o && setSubmitFor(null)}>
        {submitFor && <StudentSubmitDialog h={submitFor} onClose={() => setSubmitFor(null)} />}
      </Dialog>
    </div>
  );
}

function StudentSubmitDialog({ h, onClose }: { h: ApiHomework; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState(h.submission_file_name ?? "");
  const [note, setNote] = useState(h.submission_note ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fileName.trim()) return toast.error("Attach a file name for your submission");
    setSubmitting(true);
    try {
      await api.post("/homework-submissions", { homeworkId: h.id, fileName, note });
      await queryClient.invalidateQueries({ queryKey: ["homework"] });
      toast.success("Assignment submitted successfully");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit assignment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Submit — {h.title}</DialogTitle>
      </DialogHeader>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="submit-file">File Name</Label>
          <Input
            id="submit-file"
            required
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="assignment.pdf"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="submit-notes">Notes</Label>
          <Textarea
            id="submit-notes"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add any notes for your teacher…"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            Submit Assignment
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function AdminHomeworkView() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | "review" | "student">("all");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("all");
  const [cls, setCls] = useState("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ApiHomework | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const { data: rowsData, isLoading } = useHomework();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: teachers } = useTeachers();
  const allRows = rowsData ?? [];

  const classNameById = new Map((classes ?? []).map((c) => [c.id, `${c.name}-${c.section}`]));
  const teacherNameById = new Map((teachers ?? []).map((t) => [t.id, t.name]));
  const subjectNames = [...new Set((subjects ?? []).map((s) => s.name))];
  const classLabels = [...new Set((classes ?? []).map((c) => `${c.name}-${c.section}`))];

  const filtered = useMemo(() => {
    return allRows.filter((h) => {
      if (search && !h.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (subject !== "all" && h.subject !== subject) return false;
      if (cls !== "all" && classNameById.get(h.class_id ?? "") !== cls) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, search, subject, cls]);

  const { rows, pageCount } = usePaged(filtered, page, 6);

  const total = allRows.length;
  const classCount = new Set(allRows.map((h) => h.class_id).filter(Boolean)).size;
  const subjectCount = new Set(allRows.map((h) => h.subject).filter(Boolean)).size;
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const today = new Date().toISOString().slice(0, 10);
  const dueThisWeek = allRows.filter(
    (h) => h.due_date && h.due_date >= today && h.due_date <= in7Days.toISOString().slice(0, 10),
  ).length;

  async function remove(id: string) {
    try {
      await api.delete(`/homework/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["homework"] });
      toast.success("Homework deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete homework");
    }
  }

  return (
    <div>
      <PageHeader
        title="Homework & Assignments"
        description="Assign, track and review student homework."
        breadcrumb={["Dashboard", "Homework & Assignments"]}
        actions={
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Assign Homework
              </Button>
            </DialogTrigger>
            <AdminAssignDialog
              classes={classes ?? []}
              subjects={subjects ?? []}
              onClose={() => setAssignOpen(false)}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Assignments" value={total} icon={ClipboardList} tone="navy" />
        <InfoCard label="Classes" value={classCount} icon={GraduationCap} tone="info" />
        <InfoCard label="Subjects" value={subjectCount} icon={CheckCircle2} tone="success" />
        <InfoCard label="Due This Week" value={dueThisWeek} icon={Clock} tone="warning" />
      </div>

      <div className="mt-5">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as typeof tab);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All Assignments</TabsTrigger>
            <TabsTrigger value="review">Teacher Review</TabsTrigger>
            <TabsTrigger value="student">Student View</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <SectionCard
              title="All Assignments"
              subtitle={`${filtered.length} assignments`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <SearchInput
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setPage(1);
                    }}
                    placeholder="Search assignments…"
                  />
                  <FilterSelect
                    value={subject}
                    onChange={(v) => {
                      setSubject(v);
                      setPage(1);
                    }}
                    options={subjectNames}
                    placeholder="Subject"
                  />
                  <FilterSelect
                    value={cls}
                    onChange={(v) => {
                      setCls(v);
                      setPage(1);
                    }}
                    options={classLabels}
                    placeholder="Class"
                  />
                </div>
              }
            >
              {isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
              ) : rows.length === 0 ? (
                <EmptyState
                  title="No assignments found"
                  description="Try adjusting your search or filters."
                />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((h) => (
                      <div key={h.id} className="panel flex flex-col gap-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold">{h.title}</p>
                          {h.subject && (
                            <span className="shrink-0 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">
                              {h.subject}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {classNameById.get(h.class_id ?? "") ?? "—"}
                          {h.teacher_id && ` · ${teacherNameById.get(h.teacher_id) ?? "—"}`}
                        </p>
                        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                          <span>Assigned: {h.assigned_date ?? "—"}</span>
                          <span>Due: {h.due_date ?? "—"}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1"
                            onClick={() => setDetail(h)}
                          >
                            View details
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1 text-destructive"
                            onClick={() => remove(h.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
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

          <TabsContent value="review" className="mt-4">
            <AdminReviewPanel rows={allRows} classNameById={classNameById} />
          </TabsContent>

          <TabsContent value="student" className="mt-4">
            <SectionCard
              title="Student View"
              subtitle="What students see for each assignment (read-only preview)"
            >
              {allRows.length === 0 ? (
                <EmptyState
                  title="No assignments yet"
                  description="Assignments will appear here once created."
                />
              ) : (
                <div className="grid gap-3">
                  {allRows.slice(0, 8).map((h) => (
                    <div
                      key={h.id}
                      className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{h.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {h.subject ?? "—"} · Due {h.due_date ?? "—"}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setDetail(h)}>
                        View details
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        {detail && (
          <AdminDetailDialog
            h={detail}
            className={classNameById.get(detail.class_id ?? "") ?? "—"}
            teacherName={detail.teacher_id ? (teacherNameById.get(detail.teacher_id) ?? "—") : "—"}
          />
        )}
      </Dialog>
    </div>
  );
}

function AdminDetailDialog({
  h,
  className,
  teacherName,
}: {
  h: ApiHomework;
  className: string;
  teacherName: string;
}) {
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{h.title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {h.subject && (
            <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">
              {h.subject}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {className} · {teacherName}
          </span>
        </div>
        {h.description && <p className="text-muted-foreground">{h.description}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Assigned Date</p>
            <p className="font-medium">{h.assigned_date ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Due Date</p>
            <p className="font-medium">{h.due_date ?? "—"}</p>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

/** Real submissions + grading for a picked assignment — same API TeacherHomeworkView's SubmissionsDialog uses. */
function AdminReviewPanel({
  rows,
  classNameById,
}: {
  rows: ApiHomework[];
  classNameById: Map<string, string>;
}) {
  const queryClient = useQueryClient();
  const [homeworkId, setHomeworkId] = useState<string>(rows[0]?.id ?? "");
  const selected = rows.find((h) => h.id === homeworkId) ?? null;
  const { data: submissions, isLoading } = useHomeworkSubmissions(homeworkId || undefined);
  const [drafts, setDrafts] = useState<Record<string, { feedback: string; grade: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function review(s: ApiHomeworkSubmission) {
    const draft = drafts[s.id] ?? { feedback: s.feedback ?? "", grade: s.grade ?? "" };
    setSavingId(s.id);
    try {
      await api.patch(`/homework-submissions/${s.id}`, {
        feedback: draft.feedback,
        grade: draft.grade,
      });
      await queryClient.invalidateQueries({ queryKey: [`homework-submissions-all-${homeworkId}`] });
      toast.success("Feedback saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save feedback");
    } finally {
      setSavingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <SectionCard
        title="Teacher Review"
        subtitle="Grade and provide feedback on student submissions"
      >
        <EmptyState
          title="No assignments yet"
          description="Create an assignment to review submissions here."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Teacher Review"
      subtitle="Grade and provide feedback on student submissions"
      action={
        <Select value={homeworkId} onValueChange={setHomeworkId}>
          <SelectTrigger className="bg-surface w-64">
            <SelectValue placeholder="Select assignment" />
          </SelectTrigger>
          <SelectContent>
            {rows.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.title} — {classNameById.get(h.class_id ?? "") ?? "—"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      bodyClassName="p-0"
    >
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !submissions || submissions.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No submissions yet"
            description={`No students have submitted "${selected?.title ?? ""}" yet.`}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                <th className="px-4 py-2.5 font-medium">Submitted</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Feedback</th>
                <th className="px-4 py-2.5 font-medium">Grade</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => {
                const draft = drafts[s.id] ?? { feedback: s.feedback ?? "", grade: s.grade ?? "" };
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">{s.student_name ?? s.student_id}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.submitted_at}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Input
                        className="h-8 w-40"
                        placeholder="Feedback"
                        value={draft.feedback}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [s.id]: { ...draft, feedback: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Input
                        className="h-8 w-20"
                        placeholder="Grade"
                        value={draft.grade}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [s.id]: { ...draft, grade: e.target.value } }))
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingId === s.id}
                        onClick={() => review(s)}
                      >
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function AdminAssignDialog({
  classes,
  subjects,
  onClose,
}: {
  classes: { id: string; name: string; section: string }[];
  subjects: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [subject, setSubject] = useState(subjects[0]?.name ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedDate, setAssignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!classId) return toast.error("No classes available");
    setSubmitting(true);
    try {
      await api.post("/homework", { classId, subject, title, description, dueDate, assignedDate });
      await queryClient.invalidateQueries({ queryKey: ["homework"] });
      toast.success("Homework assigned");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to assign homework");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Assign Homework</DialogTitle>
      </DialogHeader>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="hw-title">Title</Label>
          <Input
            id="hw-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Quadratic Equations Worksheet"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Subject</Label>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="bg-surface">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  Class {c.name}
                  {c.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hw-assigned">Assigned Date</Label>
          <Input
            id="hw-assigned"
            type="date"
            required
            value={assignedDate}
            onChange={(e) => setAssignedDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hw-due">Due Date</Label>
          <Input
            id="hw-due"
            type="date"
            required
            min={assignedDate}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="hw-desc">Description</Label>
          <Textarea
            id="hw-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the assignment…"
          />
        </div>
        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !classId}>
            Assign Homework
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
