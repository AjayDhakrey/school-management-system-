"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, TrendingUp, CheckCircle2, ClipboardList, Printer, GraduationCap } from "lucide-react";
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
import { GradeBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useResults, useStudents, useExams, useMyStudentProfile, useMyTeacherProfile, useClasses } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth-context";
import { canView } from "@/lib/permissions";
import { SCHOOL } from "@/lib/siteData";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";

const PER_PAGE = 10;
const TERM_ORDER = ["Term 1", "Term 2", "Final"];

function overallGrade(percentage: number): string {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
}

function StudentResultsView() {
  const { user } = useAuth();
  const { data: profile } = useMyStudentProfile();
  const { data: results, isLoading: resultsLoading } = useResults();
  const { data: exams, isLoading: examsLoading } = useExams();
  const [term, setTerm] = useState<string>("Term 1");

  const examsById = useMemo(() => {
    const map = new Map<string, { subject: string | null; term: string; status: string }>();
    for (const e of exams ?? []) map.set(e.id, { subject: e.subject, term: e.term, status: e.status });
    return map;
  }, [exams]);

  const rowsByTerm = useMemo(() => {
    const grouped = new Map<
      string,
      { subject: string; marks: number | null; maxMarks: number; grade: string }[]
    >();
    for (const r of results ?? []) {
      const exam = r.exam_id ? examsById.get(r.exam_id) : undefined;
      if (!exam) continue;
      const list = grouped.get(exam.term) ?? [];
      list.push({
        subject: exam.subject ?? "—",
        marks: r.marks,
        maxMarks: r.max_marks || 100,
        grade: r.grade ?? "—",
      });
      grouped.set(exam.term, list);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.subject.localeCompare(b.subject));
    return grouped;
  }, [results, examsById]);

  const availableTerms = useMemo(() => {
    const terms = [...rowsByTerm.keys()];
    return terms.sort((a, b) => {
      const aIndex = TERM_ORDER.indexOf(a);
      const bIndex = TERM_ORDER.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [rowsByTerm]);

  useEffect(() => {
    if (availableTerms.length && !availableTerms.includes(term)) {
      const nextTerm = availableTerms[0] ?? "Term 1";
      setTerm(nextTerm);
    }
  }, [availableTerms, term]);

  const activeRows = rowsByTerm.get(term) ?? [];
  const scored = activeRows.filter((r) => r.marks !== null);
  const totalObtained = scored.reduce((a, r) => a + (r.marks ?? 0), 0);
  const totalMax = scored.reduce((a, r) => a + r.maxMarks, 0);
  const percentage = totalMax ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;
  const finalGrade = scored.length ? overallGrade(percentage) : "—";
  const passStatus = scored.length ? (activeRows.every((r) => r.marks === null || r.marks >= r.maxMarks * 0.4) ? "Pass" : "Fail") : "—";

  const isLoading = resultsLoading || examsLoading;

  return (
    <div>
      <PageHeader
        title="My Results"
        description="Subject-wise marks and report cards for every exam term."
        breadcrumb={["Dashboard", "Results"]}
        actions={
          activeRows.length > 0 ? (
            <Button size="sm" className="h-9 print:hidden" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" /> Print Report Card
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <InfoCard label="Total Marks" value={`${totalObtained} / ${totalMax}`} icon={ClipboardList} tone="navy" />
        <InfoCard label="Percentage" value={`${percentage}%`} icon={TrendingUp} tone="info" />
        <InfoCard label="Overall Grade" value={finalGrade} icon={Award} tone="gold" />
        <InfoCard label="Result" value={passStatus} icon={CheckCircle2} tone={passStatus === "Fail" ? "danger" : "success"} />
      </div>

      {availableTerms.length > 1 && (
        <Tabs value={term} onValueChange={setTerm} className="mb-4 print:hidden">
          <TabsList>
            {availableTerms.map((t) => (
              <TabsTrigger key={t} value={t}>
                {t === "Final" ? "Final Result" : t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div id="report-card" className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface shadow-sm print:max-w-none print:rounded-none print:border-none print:shadow-none">
        <div className="flex flex-col items-center gap-1 border-b border-border bg-muted/40 p-6 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{SCHOOL.name}</h2>
          <p className="text-xs text-muted-foreground">{SCHOOL.address}</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            Report Card — {term === "Final" ? "Final Result" : term} · Session {SCHOOL.session}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-border p-6 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Student Name</p>
            <p className="font-medium text-foreground">{profile?.name ?? user?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Class</p>
            <p className="font-medium text-foreground">
              {profile?.class_name ?? "—"} {profile?.section ?? ""}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Roll No.</p>
            <p className="font-medium text-foreground">{profile?.roll ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Admission No.</p>
            <p className="font-medium text-foreground">{profile?.admission_no ?? "—"}</p>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : activeRows.length === 0 ? (
          <EmptyState
            title="No published results yet"
            description="Marks will appear here after the school administrator publishes the exam results."
          />
        ) : (
          <div className="overflow-x-auto p-6 pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Marks Obtained</TableHead>
                  <TableHead className="text-right">Max Marks</TableHead>
                  <TableHead className="text-right">Percentage</TableHead>
                  <TableHead className="text-right">Grade</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRows.map((r, i) => {
                  const subjectPct = r.marks !== null ? Math.round((r.marks / r.maxMarks) * 1000) / 10 : null;
                  const subjectPass = r.marks !== null ? r.marks >= r.maxMarks * 0.4 : null;
                  return (
                    <TableRow key={`${r.subject}-${i}`}>
                      <TableCell className="font-medium">{r.subject}</TableCell>
                      <TableCell className="text-right">{r.marks ?? "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.maxMarks}</TableCell>
                      <TableCell className="text-right">{subjectPct !== null ? `${subjectPct}%` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <GradeBadge grade={r.grade} />
                      </TableCell>
                      <TableCell className="text-right">
                        {subjectPass === null ? (
                          "—"
                        ) : (
                          <span className={subjectPass ? "font-medium text-success" : "font-medium text-destructive"}>
                            {subjectPass ? "Pass" : "Fail"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <tfoot>
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totalObtained}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{totalMax}</TableCell>
                  <TableCell className="text-right">{percentage}%</TableCell>
                  <TableCell className="text-right">
                    <GradeBadge grade={finalGrade} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={passStatus === "Fail" ? "text-destructive" : "text-success"}>{passStatus}</span>
                  </TableCell>
                </TableRow>
              </tfoot>
            </Table>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <div>
                <span className="text-muted-foreground">Percentage: </span>
                <span className="font-semibold text-foreground">{percentage}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Overall Grade: </span>
                <span className="font-semibold text-foreground">{finalGrade}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Result: </span>
                <span className={passStatus === "Fail" ? "font-semibold text-destructive" : "font-semibold text-success"}>
                  {passStatus}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

function TeacherResultsView() {
  const queryClient = useQueryClient();
  const { data: teacher } = useMyTeacherProfile();
  const { data: classes } = useClasses();
  const { data: exams } = useExams();
  const { data: allStudents } = useStudents();
  const { data: results } = useResults();

  // Entering/editing marks is a Class Teacher control — only show classes this teacher is the
  // Class Teacher of, not every class/subject they merely teach (backend enforces this too).
  const myClasses = (classes ?? []).filter((c) => c.class_teacher_id === teacher?.id);

  const [classId, setClassId] = useState("");
  const [examId, setExamId] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!classId && myClasses.length > 0) setClassId(myClasses[0]!.id);
  }, [classId, myClasses]);

  const classExams = (exams ?? []).filter((e) => e.class_id === classId);

  useEffect(() => {
    if (classExams.length > 0 && !classExams.some((e) => e.id === examId)) setExamId(classExams[0]!.id);
    if (classExams.length === 0) setExamId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, exams]);

  const classStudents = (allStudents ?? []).filter((s) => s.class_id === classId);
  const resultByStudent = new Map((results ?? []).filter((r) => r.exam_id === examId).map((r) => [r.student_id, r]));

  function markFor(studentId: string) {
    return marks[studentId] ?? String(resultByStudent.get(studentId)?.marks ?? "");
  }

  async function save() {
    if (!examId) return;
    setSaving(true);
    try {
      const entries = [];
      for (const s of classStudents) {
        const raw = markFor(s.id);
        if (raw === "") continue;
        const marksValue = Number(raw);
        if (Number.isNaN(marksValue)) continue;
        entries.push({ studentId: s.id, marks: marksValue, attendanceStatus: "PRESENT" });
      }
      if (!entries.length) throw new Error("Enter at least one mark");
      await api.post("/results/bulk", { examId, entries });
      await queryClient.invalidateQueries({ queryKey: ["results"] });
      toast.success("Marks saved");
      setMarks({});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save marks");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Marks & Results"
        description="Enter and manage marks for the class(es) where you are the Class Teacher."
        breadcrumb={["Dashboard", "Marks & Results"]}
      />

      <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-surface p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="h-9 w-full bg-surface text-sm sm:w-[180px]">
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            {myClasses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                Class {c.name}
                {c.section}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={examId} onValueChange={setExamId}>
          <SelectTrigger className="h-9 w-full bg-surface text-sm sm:w-[220px]">
            <SelectValue placeholder="Exam" />
          </SelectTrigger>
          <SelectContent>
            {classExams.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.subject} — {e.term}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={save} disabled={saving || !examId || classStudents.length === 0}>
          Save Marks
        </Button>
      </div>

      {myClasses.length === 0 ? (
        <EmptyState
          title="You're not a Class Teacher"
          description="Marks entry can only be done by the Class Teacher of a class. You'll see your class here once your school administrator assigns you as one."
        />
      ) : !examId ? (
        <EmptyState title="No exams for this class" description="Exams for this class will appear here once scheduled." />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Marks (/100)</TableHead>
                <TableHead className="text-right">Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classStudents.map((s) => {
                const raw = markFor(s.id);
                const marksValue = Number(raw);
                const grade = raw !== "" && !Number.isNaN(marksValue) ? overallGrade(marksValue) : "—";
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={s.name} />
                        <span className="truncate font-medium">{s.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="h-8 w-24"
                        value={raw}
                        onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <GradeBadge grade={grade} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentResultsView />;
  if (user?.role === "TEACHER") return <TeacherResultsView />;
  const { data: results, isLoading } = useResults();
  // A Student account can't list all students (only its own record via /results),
  // so skip the full roster fetch and fall back to the logged-in user's own name below.
  const { data: students } = useStudents(canView(user, "students"));
  const { data: exams } = useExams();

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [page, setPage] = useState(1);

  const studentsById = useMemo(() => {
    const map = new Map<string, { name: string; class_name: string | null; section: string | null }>();
    for (const s of students ?? []) map.set(s.id, { name: s.name, class_name: s.class_name, section: s.section });
    if (user?.role === "STUDENT" && user.linkedStudentId && !map.has(user.linkedStudentId)) {
      map.set(user.linkedStudentId, { name: user.name, class_name: null, section: null });
    }
    return map;
  }, [students, user]);

  const examsById = useMemo(() => {
    const map = new Map<string, { subject: string | null; date: string | null }>();
    for (const e of exams ?? []) map.set(e.id, { subject: e.subject, date: e.date });
    return map;
  }, [exams]);

  const rows = useMemo(
    () =>
      (results ?? []).map((r) => {
        const student = studentsById.get(r.student_id);
        const exam = r.exam_id ? examsById.get(r.exam_id) : undefined;
        return {
          id: r.id,
          studentName: student?.name ?? "Unknown student",
          className: student?.class_name ?? "—",
          section: student?.section ?? "",
          subject: exam?.subject ?? "—",
          date: exam?.date ?? "—",
          marks: r.marks,
          grade: r.grade ?? "—",
        };
      }),
    [results, studentsById, examsById],
  );

  const classOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.className).filter((c) => c !== "—"))),
    [rows],
  );
  const gradeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.grade).filter((g) => g !== "—"))),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQ = !q || r.studentName.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q);
      const matchesClass = classFilter === "all" || r.className === classFilter;
      const matchesGrade = gradeFilter === "all" || r.grade === gradeFilter;
      return matchesQ && matchesClass && matchesGrade;
    });
  }, [rows, search, classFilter, gradeFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, classFilter, gradeFilter]);

  const { rows: paged, pageCount } = usePaged(filtered, page, PER_PAGE);

  const total = rows.length;
  const withMarks = rows.filter((r) => r.marks !== null);
  const avgMarks = withMarks.length ? Math.round(withMarks.reduce((a, r) => a + (r.marks ?? 0), 0) / withMarks.length) : 0;
  const passCount = withMarks.filter((r) => (r.marks ?? 0) >= 40).length;
  const passRate = withMarks.length ? Math.round((passCount / withMarks.length) * 100) : 0;
  const topGrades = rows.filter((r) => r.grade.startsWith("A")).length;

  return (
    <div>
      <PageHeader title="Results" description="Exam results and grade records." breadcrumb={["Dashboard", "Results"]} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Records" value={total} icon={ClipboardList} tone="navy" />
        <InfoCard label="Average Marks" value={avgMarks} icon={TrendingUp} tone="info" />
        <InfoCard label="Pass Rate" value={`${passRate}%`} icon={CheckCircle2} tone="success" />
        <InfoCard label="A Grades" value={topGrades} icon={Award} tone="gold" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search student / subject…" />
          <div className="flex flex-wrap gap-2">
            <FilterSelect value={classFilter} onChange={setClassFilter} options={classOptions} placeholder="Class" />
            <FilterSelect value={gradeFilter} onChange={setGradeFilter} options={gradeOptions} placeholder="Grade" />
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : paged.length === 0 ? (
          <EmptyState title="No results found" description="Try adjusting your search or filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Exam Date</TableHead>
                    <TableHead>Marks</TableHead>
                    <TableHead className="text-right">Grade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Initials name={r.studentName} />
                          <span className="truncate font-medium">{r.studentName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.className} {r.section}
                      </TableCell>
                      <TableCell>{r.subject}</TableCell>
                      <TableCell className="text-muted-foreground">{r.date}</TableCell>
                      <TableCell>{r.marks ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <GradeBadge grade={r.grade === "—" ? "—" : r.grade} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={Math.min(page, pageCount)} pageCount={pageCount} onPage={setPage} total={filtered.length} />
          </>
        )}
      </div>
    </div>
  );
}
