"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  EmptyState,
  SearchInput,
  FilterSelect,
  Pager,
  usePaged,
  TableSkeleton,
} from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, GradeBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, PlusCircle, Clock, PlayCircle, CheckCircle2, Save } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useExams, useClasses, useSubjects, useStudents, useResults, type ApiExam, type ApiClass } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


const STATUSES = ["DRAFT", "MARKS_ENTRY", "REVIEW", "PUBLISHED", "CANCELLED"];

function gradeFor(marks: number): string {
  if (marks >= 90) return "A+";
  if (marks >= 80) return "A";
  if (marks >= 70) return "B+";
  if (marks >= 60) return "B";
  if (marks >= 50) return "C";
  if (marks >= 35) return "D";
  return "F";
}

function classLabel(cls: ApiClass | undefined) {
  if (!cls) return "—";
  return cls.section ? `${cls.name} ${cls.section}` : cls.name;
}

function ScheduleTab({ exams, isLoading }: { exams: ApiExam[]; isLoading: boolean }) {
  const { data: classesData } = useClasses();
  const { data: subjectsData } = useSubjects();
  const classes = classesData ?? [];
  const subjects = subjectsData ?? [];
  const classesById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  const classNames = useMemo(() => classes.map((c) => classLabel(c)), [classes]);

  const upcoming = exams.filter((e) => !["PUBLISHED", "CANCELLED"].includes(e.status)).slice(0, 4);

  const filtered = useMemo(
    () =>
      exams.filter((e) => {
        const cls = classesById.get(e.class_id ?? "");
        const label = classLabel(cls);
        return (
          (search === "" || (e.subject ?? "").toLowerCase().includes(search.toLowerCase())) &&
          (classFilter === "all" || label === classFilter) &&
          (statusFilter === "all" || e.status === statusFilter)
        );
      }),
    [exams, search, classFilter, statusFilter, classesById],
  );
  const { rows, pageCount } = usePaged(filtered, page, 8);

  async function handleSchedule() {
    if (!subject || !classId || !date) return;
    setSaving(true);
    try {
      const cls = classes.find((c) => c.id === classId);
      await api.post("/exams", { name: "Examination", examType: "Other", subjectId: subject, classId, academicYearId: cls?.academic_year_id, date, maximumMarks: 100, passingMarks: 35 });
      toast.success("Exam scheduled successfully");
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      setScheduleOpen(false);
      setSubject("");
      setClassId("");
      setDate("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to schedule exam");
    } finally {
      setSaving(false);
    }
  }
  async function advanceExam(exam: ApiExam) {
    try {
      if (exam.status === "REVIEW") await api.post(`/results/exams/${exam.id}/publish`, {});
      else {
        const next = exam.status === "DRAFT" ? "MARKS_ENTRY" : exam.status === "MARKS_ENTRY" ? "REVIEW" : null;
        if (!next) return;
        await api.patch(`/exams/${exam.id}`, { status: next });
      }
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      await queryClient.invalidateQueries({ queryKey: ["results"] });
      toast.success("Exam status updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update exam");
    }
  }

  return (
    <div>
      <SectionCard
        title="Upcoming Exams"
        subtitle="Next scheduled and ongoing assessments"
        className="mb-4"
        action={
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <PlusCircle className="h-4 w-4" /> Schedule Exam
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Schedule Exam</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 text-xs">Class</Label>
                    <Select value={classId} onValueChange={setClassId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 text-xs">Subject</Label>
                    <Select value={subject} onValueChange={setSubject}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select subject" /></SelectTrigger>
                      <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 text-xs">Date</Label>
                  <Input type="date" className="h-9" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <Button onClick={handleSchedule} disabled={saving || !subject || !classId || !date}>
                  Save Schedule
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      >
        {isLoading ? (
          <TableSkeleton rows={2} cols={4} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {upcoming.map((e) => (
              <div key={e.id} className="rounded-xl border border-border p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-semibold text-info">{e.term}</span>
                  <StatusBadge status={e.status} />
                </div>
                <p className="truncate text-sm font-semibold">{e.subject ?? "—"}</p>
                <p className="truncate text-xs text-muted-foreground">{classLabel(classesById.get(e.class_id ?? ""))}</p>
                <div className="mt-2.5 space-y-1 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0" /> {e.date ?? "—"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search subject…" />
          <FilterSelect value={classFilter} onChange={setClassFilter} options={classNames} placeholder="Class" />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUSES} placeholder="Status" />
        </div>
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState title="No exams found" icon={CalendarDays} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Subject</th>
                  <th className="px-4 py-2.5 font-medium">Class</th>
                  <th className="px-4 py-2.5 font-medium">Term</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{e.subject ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{classLabel(classesById.get(e.class_id ?? ""))}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{e.term}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{e.date ?? "—"}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {["DRAFT","MARKS_ENTRY","REVIEW"].includes(e.status) && (
                        <Button size="sm" variant="outline" onClick={() => advanceExam(e)}>
                          {e.status === "DRAFT" ? "Open Marks" : e.status === "MARKS_ENTRY" ? "Send to Review" : "Publish"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
      </SectionCard>
    </div>
  );
}

function MarksEntryTab({ exams }: { exams: ApiExam[] }) {
  const { data: classesData } = useClasses();
  const { data: studentsData, isLoading: studentsLoading } = useStudents();
  const { data: resultsData } = useResults();
  const queryClient = useQueryClient();
  const classes = classesData ?? [];
  const students = studentsData ?? [];
  const results = resultsData ?? [];

  const [examId, setExamId] = useState(exams[0]?.id ?? "");
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const selectedExam = exams.find((e) => e.id === examId);
  const roster = useMemo(
    () => students.filter((s) => !selectedExam?.class_id || s.class_id === selectedExam.class_id),
    [students, selectedExam],
  );

  const existingResultByStudent = useMemo(() => {
    const map = new Map<string, (typeof results)[number]>();
    for (const r of results) if (r.exam_id === examId) map.set(r.student_id, r);
    return map;
  }, [results, examId]);

  function setMark(id: string, v: number) {
    setMarks((prev) => ({ ...prev, [id]: v }));
  }

  async function handleSaveMarks() {
    if (!examId) return;
    setSaving(true);
    try {
      const entries = roster.filter((s) => marks[s.id] !== undefined).map((s) => ({ studentId: s.id, marks: marks[s.id], attendanceStatus: "PRESENT" }));
      if (!entries.length) throw new Error("Enter at least one mark");
      await api.post("/results/bulk", { examId, entries });
      toast.success("Marks saved for review");
      queryClient.invalidateQueries({ queryKey: ["results"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save marks");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionCard title="Marks Entry" subtitle="Select exam context to enter marks" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 text-xs">Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger className="h-9 bg-surface"><SelectValue placeholder="Select exam" /></SelectTrigger>
              <SelectContent>
                {exams.map((e) => {
                  const cls = classes.find((c) => c.id === e.class_id);
                  return (
                    <SelectItem key={e.id} value={e.id}>
                      {(e.subject ?? "Exam")} — {classLabel(cls)} ({e.date ?? "no date"})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-muted px-4 py-2.5 text-xs">
          <span>Max Marks: <span className="font-semibold text-foreground">{selectedExam?.maximum_marks ?? 100}</span></span>
          <span>Passing Marks: <span className="font-semibold text-foreground">{selectedExam?.passing_marks ?? 35}</span></span>
          <span>{selectedExam?.subject ?? "—"} · {classLabel(classes.find((c) => c.id === selectedExam?.class_id))}</span>
        </div>
      </SectionCard>

      <SectionCard
        title="Student Marks"
        subtitle={`${roster.length} students`}
        action={
          <Button size="sm" className="gap-1.5" onClick={handleSaveMarks} disabled={saving || !examId}>
            <Save className="h-3.5 w-3.5" /> Save Marks
          </Button>
        }
        bodyClassName="p-0"
      >
        {studentsLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : roster.length === 0 ? (
          <EmptyState title="No students found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Roll</th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Marks</th>
                  <th className="px-4 py-2.5 font-medium">Grade</th>
                  <th className="px-4 py-2.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => {
                  const existing = existingResultByStudent.get(s.id);
                  const m = marks[s.id] ?? existing?.marks ?? 0;
                  const grade = gradeFor(m);
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5">{s.roll ?? "—"}</td>
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">{s.name}</td>
                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={0}
                          max={selectedExam?.maximum_marks ?? 100}
                          value={marks[s.id] ?? existing?.marks ?? ""}
                          onChange={(e) => setMark(s.id, Number(e.target.value))}
                          className="h-8 w-20 bg-surface text-xs"
                        />
                      </td>
                      <td className="px-4 py-2.5"><GradeBadge grade={grade} /></td>
                      <td className="px-4 py-2.5"><StatusBadge status={m >= 35 ? "Pass" : "Fail"} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentExamsView />;
  if (user?.role === "TEACHER") return <TeacherExamsView />;
  return <AdminExaminationsView />;
}

function TeacherExamsView() {
  const { data: exams, isLoading } = useExams();
  const rows = exams ?? [];

  return (
    <div>
      <PageHeader
        title="Exam Schedule"
        description="Exams scheduled for your assigned classes."
        breadcrumb={["Dashboard", "Exam Schedule"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Exams" value={rows.length} icon={CalendarDays} tone="navy" />
        <InfoCard label="Open for Marks" value={rows.filter((e) => e.status === "MARKS_ENTRY").length} icon={Clock} tone="warning" />
        <InfoCard label="Published" value={rows.filter((e) => e.status === "PUBLISHED").length} icon={CheckCircle2} tone="success" />
      </div>

      <div className="panel">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No exams scheduled" description="Exams for your classes will appear here." icon={CalendarDays} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.subject ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.term}</TableCell>
                    <TableCell className="text-muted-foreground">{e.date ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <StatusBadge status={e.status} />
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

function StudentExamsView() {
  const { data: exams, isLoading } = useExams();
  const rows = (exams ?? []).filter((e) => !["DRAFT", "CANCELLED"].includes(e.status));

  return (
    <div>
      <PageHeader title="My Exams" description="Upcoming exams for your class." breadcrumb={["Dashboard", "My Exams"]} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <InfoCard label="Upcoming Exams" value={rows.length} icon={CalendarDays} tone="navy" />
      </div>

      <div className="panel">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No upcoming exams" description="Your exam schedule will appear here." icon={CalendarDays} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.subject ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.date ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
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
  const { data: examsData, isLoading } = useExams();
  const exams = examsData ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { DRAFT: 0, MARKS_ENTRY: 0, REVIEW: 0, PUBLISHED: 0 };
    for (const e of exams) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [exams]);

  return (
    <div>
      <PageHeader
        title="Examination Management"
        description="Plan exam schedules and manage marks entry across classes."
        breadcrumb={["Dashboard", "Examinations"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Exams" value={exams.length} icon={CalendarDays} tone="navy" />
        <InfoCard label="Draft" value={counts["DRAFT"] ?? 0} icon={Clock} tone="info" />
        <InfoCard label="Marks Entry" value={counts["MARKS_ENTRY"] ?? 0} icon={PlayCircle} tone="warning" />
        <InfoCard label="Published" value={counts["PUBLISHED"] ?? 0} icon={CheckCircle2} tone="success" />
      </div>

      <Tabs defaultValue="schedule">
        <TabsList className="mb-4">
          <TabsTrigger value="schedule">Exam Schedule</TabsTrigger>
          <TabsTrigger value="marks">Marks Entry</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule"><ScheduleTab exams={exams} isLoading={isLoading} /></TabsContent>
        <TabsContent value="marks"><MarksEntryTab exams={exams} /></TabsContent>
      </Tabs>
    </div>
  );
}
