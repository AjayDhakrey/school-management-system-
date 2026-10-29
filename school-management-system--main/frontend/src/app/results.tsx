"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  BookOpen,
  TrendingUp,
  CheckCircle2,
  ClipboardList,
  Printer,
  GraduationCap,
  XCircle,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useResults,
  useStudents,
  useExams,
  useMyStudentProfile,
  useMyTeacherProfile,
  useClasses,
} from "@/hooks/useApi";
import { useAuth } from "@/lib/auth-context";
import { canView } from "@/lib/permissions";
import { useSchoolBranding } from "@/hooks/use-school-branding";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

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

/** Circular progress ring with the percentage in the middle. */
function ScoreRing({ value }: { value: number | null }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="relative h-24 w-24 shrink-0 sm:h-[88px] sm:w-[88px]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          className="opacity-20"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-xl font-bold leading-none">
            {value === null ? "—" : `${value}%`}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-75">
            Score
          </p>
        </div>
      </div>
    </div>
  );
}

/** The term's headline result — one card instead of four stat boxes. */
function ScoreCard({
  term,
  percentage,
  grade,
  obtained,
  max,
  subjects,
  result,
}: {
  term: string;
  percentage: number | null;
  grade: string;
  obtained: number;
  max: number;
  subjects: number;
  result: string;
}) {
  return (
    <div className="relative mx-auto mb-4 flex max-w-3xl flex-col gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-4 text-primary-foreground shadow-md sm:flex-row sm:items-center sm:gap-5 print:hidden">
      <span className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full bg-white/10" />
      <span className="pointer-events-none absolute -bottom-14 left-24 h-28 w-28 rounded-full bg-white/5" />
      <div className="relative flex min-w-0 flex-1 items-center gap-4">
        <ScoreRing value={percentage} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-75">{term}</p>
          <div className="mt-1 flex items-end gap-2">
            <span className="font-display text-4xl font-bold leading-none sm:text-3xl">
              {grade}
            </span>
            <span className="pb-1 text-xs opacity-80">grade</span>
          </div>
          {result !== "—" && (
            <span
              className={cn(
                "mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                result === "Pass" ? "bg-success text-white" : "bg-destructive text-white",
              )}
            >
              {result === "Pass" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {result === "Pass" ? "Passed" : "Not passed"}
            </span>
          )}
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-2.5 sm:w-72 sm:shrink-0">
        <div className="rounded-xl bg-white/15 p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-75">
            <ClipboardList className="h-3 w-3" /> Total marks
          </p>
          <p className="mt-0.5 text-base font-bold">
            {obtained} <span className="text-xs font-medium opacity-75">/ {max}</span>
          </p>
        </div>
        <div className="rounded-xl bg-white/15 p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-75">
            <BookOpen className="h-3 w-3" /> Subjects
          </p>
          <p className="mt-0.5 text-base font-bold">{subjects}</p>
        </div>
      </div>
    </div>
  );
}

/** One subject's marks on phones — name, grade, a bar for the score and pass/fail. */
function SubjectResult({
  row: r,
}: {
  row: {
    subject: string;
    marks: number | null;
    maxMarks: number;
    passMarks: number;
    attendance: string;
    grade: string;
  };
}) {
  const absent = r.attendance === "ABSENT";
  const pct = r.marks !== null ? Math.round((r.marks / r.maxMarks) * 1000) / 10 : null;
  const pass = absent ? false : r.marks !== null ? r.marks >= r.passMarks : null;
  return (
    <li className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-base font-bold uppercase text-primary">
          {r.subject.trim().charAt(0) || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold capitalize">{r.subject}</p>
          <p className="text-xs text-muted-foreground">
            {absent ? (
              <span className="font-semibold text-destructive">Absent</span>
            ) : (
              <>
                <span className="font-semibold text-foreground">{r.marks ?? "—"}</span> /{" "}
                {r.maxMarks}
                {pct !== null && <> · {pct}%</>}
              </>
            )}
          </p>
        </div>
        <GradeBadge grade={r.grade} />
      </div>
      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", pass === false ? "bg-destructive" : "bg-success")}
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
        {pass !== null && (
          <span
            className={cn("text-[11px] font-semibold", pass ? "text-success" : "text-destructive")}
          >
            {absent ? "Absent" : pass ? "Pass" : "Fail"}
          </span>
        )}
      </div>
    </li>
  );
}

function StudentResultsView() {
  const { user } = useAuth();
  const school = useSchoolBranding();
  const { data: profile } = useMyStudentProfile();
  const { data: results, isLoading: resultsLoading } = useResults();
  const { data: exams, isLoading: examsLoading } = useExams();
  const [term, setTerm] = useState<string>("Term 1");

  const examsById = useMemo(() => {
    const map = new Map<string, { subject: string | null; term: string; status: string }>();
    for (const e of exams ?? [])
      map.set(e.id, { subject: e.subject, term: e.term, status: e.status });
    return map;
  }, [exams]);

  const rowsByTerm = useMemo(() => {
    const grouped = new Map<
      string,
      {
        subject: string;
        marks: number | null;
        maxMarks: number;
        passMarks: number;
        attendance: string;
        grade: string;
      }[]
    >();
    for (const r of results ?? []) {
      const exam = r.exam_id ? examsById.get(r.exam_id) : undefined;
      if (!exam) continue;
      const list = grouped.get(exam.term) ?? [];
      list.push({
        subject: exam.subject ?? "—",
        marks: r.marks,
        maxMarks: r.max_marks || 100,
        // Each paper's own passing marks; 40% only for old rows that have none.
        passMarks: r.passing_marks ?? (r.max_marks || 100) * 0.4,
        attendance: r.attendance_status ?? "PRESENT",
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
  // Absent papers count as 0 of their maximum; Not Applicable papers are left out.
  const scored = activeRows.filter((r) => r.marks !== null || r.attendance === "ABSENT");
  const totalObtained = scored.reduce((a, r) => a + (r.marks ?? 0), 0);
  const totalMax = scored.reduce((a, r) => a + r.maxMarks, 0);
  const percentage = totalMax ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;
  const finalGrade = scored.length ? overallGrade(percentage) : "—";
  const passStatus = scored.length
    ? scored.every((r) => r.attendance !== "ABSENT" && (r.marks ?? 0) >= r.passMarks)
      ? "Pass"
      : "Fail"
    : "—";

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

      <ScoreCard
        term={term === "Final" ? "Final Result" : term}
        percentage={scored.length ? percentage : null}
        grade={finalGrade}
        obtained={totalObtained}
        max={totalMax}
        subjects={activeRows.length}
        result={passStatus}
      />

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

      <div
        id="report-card"
        className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface shadow-sm print:max-w-none print:rounded-none print:border-none print:shadow-none"
      >
        <div className="flex items-center gap-3 border-b border-border bg-muted/40 p-4 sm:flex-col sm:gap-1 sm:p-6 sm:text-center print:flex-col print:gap-1 print:text-center">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:h-12 sm:w-12 sm:rounded-full">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="min-w-0 sm:flex sm:flex-col sm:items-center">
            <h2 className="truncate text-base font-bold capitalize text-foreground sm:text-lg">
              {school.name}
            </h2>
            <p className="line-clamp-2 text-[11px] text-muted-foreground sm:text-xs">
              {school.address}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 sm:justify-center">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Report Card · {term === "Final" ? "Final Result" : term}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Session {school.session}
              </span>
            </div>
          </div>
        </div>

        <div className="border-b border-border p-3 sm:p-6">
          <div className="flex items-center gap-3">
            <Initials
              name={profile?.name ?? user?.name ?? "Student"}
              className="h-11 w-11 text-sm"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Student
              </p>
              <p className="truncate text-base font-bold capitalize text-foreground">
                {profile?.name ?? user?.name ?? "—"}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Class
              </p>
              <p className="truncate text-sm font-semibold capitalize text-foreground">
                {[profile?.class_name, profile?.section].filter(Boolean).join(" – ") || "—"}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Roll No.
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {profile?.roll ?? "—"}
              </p>
            </div>
            <div className="col-span-2 rounded-xl bg-muted/50 px-3 py-2 sm:col-span-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Admission No.
              </p>
              <p className="truncate font-mono text-[13px] font-semibold text-foreground">
                {profile?.admission_no ?? "—"}
              </p>
            </div>
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
          <div className="p-3 pt-4 sm:p-6 sm:pt-4">
            <ul className="grid gap-2.5 md:hidden print:hidden">
              {activeRows.map((r, i) => (
                <SubjectResult key={`${r.subject}-${i}`} row={r} />
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block print:block">
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
                    const subjectPct =
                      r.marks !== null ? Math.round((r.marks / r.maxMarks) * 1000) / 10 : null;
                    const absent = r.attendance === "ABSENT";
                    const subjectPass = absent
                      ? false
                      : r.marks !== null
                        ? r.marks >= r.passMarks
                        : null;
                    return (
                      <TableRow key={`${r.subject}-${i}`}>
                        <TableCell className="font-medium">{r.subject}</TableCell>
                        <TableCell className="text-right">
                          {absent ? "AB" : (r.marks ?? "—")}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.maxMarks}
                        </TableCell>
                        <TableCell className="text-right">
                          {subjectPct !== null ? `${subjectPct}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <GradeBadge grade={r.grade} />
                        </TableCell>
                        <TableCell className="text-right">
                          {subjectPass === null ? (
                            "—"
                          ) : (
                            <span
                              className={
                                subjectPass
                                  ? "font-medium text-success"
                                  : "font-medium text-destructive"
                              }
                            >
                              {absent ? "Absent" : subjectPass ? "Pass" : "Fail"}
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
                      <span className={passStatus === "Fail" ? "text-destructive" : "text-success"}>
                        {passStatus}
                      </span>
                    </TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            </div>

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
                <span
                  className={
                    passStatus === "Fail"
                      ? "font-semibold text-destructive"
                      : "font-semibold text-success"
                  }
                >
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
    if (classExams.length > 0 && !classExams.some((e) => e.id === examId))
      setExamId(classExams[0]!.id);
    if (classExams.length === 0) setExamId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, exams]);

  const classStudents = (allStudents ?? []).filter((s) => s.class_id === classId);
  const resultByStudent = new Map(
    (results ?? []).filter((r) => r.exam_id === examId).map((r) => [r.student_id, r]),
  );

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
        <EmptyState
          title="No exams for this class"
          description="Exams for this class will appear here once scheduled."
        />
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
                const grade =
                  raw !== "" && !Number.isNaN(marksValue) ? overallGrade(marksValue) : "—";
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
  return <AdminResultsView />;
}

function AdminResultsView() {
  const { user } = useAuth();
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
    const map = new Map<
      string,
      { name: string; class_name: string | null; section: string | null }
    >();
    for (const s of students ?? [])
      map.set(s.id, { name: s.name, class_name: s.class_name, section: s.section });
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
      const matchesQ =
        !q || r.studentName.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q);
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
  const avgMarks = withMarks.length
    ? Math.round(withMarks.reduce((a, r) => a + (r.marks ?? 0), 0) / withMarks.length)
    : 0;
  const passCount = withMarks.filter((r) => (r.marks ?? 0) >= 40).length;
  const passRate = withMarks.length ? Math.round((passCount / withMarks.length) * 100) : 0;
  const topGrades = rows.filter((r) => r.grade.startsWith("A")).length;

  return (
    <div>
      <PageHeader
        title="Results"
        description="Exam results and grade records."
        breadcrumb={["Dashboard", "Results"]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Records" value={total} icon={ClipboardList} tone="navy" />
        <InfoCard label="Average Marks" value={avgMarks} icon={TrendingUp} tone="info" />
        <InfoCard label="Pass Rate" value={`${passRate}%`} icon={CheckCircle2} tone="success" />
        <InfoCard label="A Grades" value={topGrades} icon={Award} tone="gold" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search student / subject…"
          />
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              value={classFilter}
              onChange={setClassFilter}
              options={classOptions}
              placeholder="Class"
            />
            <FilterSelect
              value={gradeFilter}
              onChange={setGradeFilter}
              options={gradeOptions}
              placeholder="Grade"
            />
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : paged.length === 0 ? (
          <EmptyState
            title="No results found"
            description="Try adjusting your search or filters."
          />
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
            <Pager
              page={Math.min(page, pageCount)}
              pageCount={pageCount}
              onPage={setPage}
              total={filtered.length}
            />
          </>
        )}
      </div>
    </div>
  );
}
