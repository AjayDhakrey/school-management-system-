"use client";

import { useMemo, useState } from "react";
import { BookOpen, GraduationCap, Clock, Mail, Phone, User, TableIcon, LayoutGrid } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton, Initials } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useMyStudentClassSubjects,
  useMyStudentProfile,
  useTeachers,
  useSubjects,
  useSchoolProfile,
} from "@/hooks/useApi";

function typeTone(type: string | null | undefined) {
  if (type === "Core") return "info" as const;
  if (type === "Elective") return "gold" as const;
  if (type === "Language") return "success" as const;
  return "neutral" as const;
}

export default function MySubjectsPage() {
  const { data: studentClassSubjects, isLoading: loadingClassSubjects } = useMyStudentClassSubjects();
  const { data: student } = useMyStudentProfile();
  const { data: teachers, isLoading: loadingTeachers } = useTeachers();
  const { data: subjects, isLoading: loadingSubjects } = useSubjects();
  const { data: school } = useSchoolProfile();

  const [view, setView] = useState<"table" | "card">("table");

  // Primary source: relational mappings from /subjects/my-class
  // Fallback source: legacy JSON parsing if needed
  const rows = useMemo(() => {
    if (studentClassSubjects && studentClassSubjects.length > 0) {
      return studentClassSubjects.map((s) => ({
        subjectName: s.subject_name,
        code: s.subject_code ?? "—",
        type: s.subject_type ?? "Core",
        credits: s.subject_credits ?? 3,
        description: s.subject_description,
        teacherName: s.teacher_name ?? "Unassigned",
        teacherEmail: s.teacher_email,
        teacherPhone: s.teacher_phone,
        className: `${s.class_name}-${s.section}`,
      }));
    }

    if (!student?.class_id) return [];
    const subjectMap = new Map((subjects ?? []).map((s) => [s.id, s]));
    const result: {
      subjectName: string;
      code: string;
      type: string;
      credits: number;
      description?: string | null;
      teacherName: string;
      teacherEmail?: string | null;
      teacherPhone?: string | null;
      className: string;
    }[] = [];

    for (const t of teachers ?? []) {
      try {
        const assignedClasses = JSON.parse(t.assigned_classes || "[]") as string[];
        if (!assignedClasses.includes(student.class_id)) continue;
        const assignedSubjects = JSON.parse(t.assigned_subjects || "[]") as string[];
        for (const subjectId of assignedSubjects) {
          const subject = subjectMap.get(subjectId);
          if (subject) {
            result.push({
              subjectName: subject.name,
              code: subject.code ?? "—",
              type: subject.type ?? "Core",
              credits: subject.credits ?? 3,
              description: subject.description,
              teacherName: t.name,
              teacherEmail: t.email,
              teacherPhone: t.phone,
              className: `${student.class_name ?? ""}${student.section ? `-${student.section}` : ""}`,
            });
          }
        }
      } catch {
        // ignore parse error
      }
    }
    return result;
  }, [studentClassSubjects, student, teachers, subjects]);

  const isLoading = loadingClassSubjects || loadingTeachers || loadingSubjects;
  const totalCredits = rows.reduce((sum, r) => sum + (r.credits ?? 3), 0);

  return (
    <div>
      <PageHeader
        title="My Class Subjects"
        description="Curriculum subjects, instructors, and credit allocations for your class section."
        breadcrumb={["Student Portal", "My Subjects"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Enrolled Subjects" value={rows.length} icon={BookOpen} tone="navy" />
        <InfoCard
          label="Your Class & Section"
          value={
            student?.class_name
              ? `${student.class_name}${student.section ? `-${student.section}` : ""}`
              : "Enrolled"
          }
          icon={GraduationCap}
          tone="info"
        />
        <InfoCard label="Total Weekly Credits" value={`${totalCredits} hrs`} icon={Clock} tone="gold" />
      </div>

      <div className="panel">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="font-semibold text-base">Course Curriculum</h3>
            <p className="text-xs text-muted-foreground">Academic Year: {school?.session ?? "2026-2027"}</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <Button
              variant={view === "table" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setView("table")}
            >
              <TableIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "card" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setView("card")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No subjects found"
            description="Curriculum subjects for your class section have not been mapped by administration yet."
            icon={BookOpen}
          />
        ) : view === "table" ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead>Subject</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead className="text-center">Credits / Wk</TableHead>
                  <TableHead>Class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-semibold text-foreground">
                      <div>{r.subjectName}</div>
                      {r.description && (
                        <span className="text-[11px] text-muted-foreground font-normal line-clamp-1">{r.description}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.type} tone={typeTone(r.type)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Initials name={r.teacherName} tone="navy" className="h-7 w-7 text-[10px]" />
                        <div>
                          <p className="font-medium text-xs text-foreground">{r.teacherName}</p>
                          {r.teacherEmail && (
                            <p className="text-[10px] text-muted-foreground">{r.teacherEmail}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono font-medium">{r.credits} hrs</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.className}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r, i) => (
              <div key={i} className="panel p-4 flex flex-col justify-between border border-border/80 shadow-sm">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <BookOpen className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <h4 className="font-bold text-sm leading-tight">{r.subjectName}</h4>
                        <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                      </div>
                    </div>
                    <StatusBadge status={r.type} tone={typeTone(r.type)} />
                  </div>

                  {r.description && (
                    <p className="mt-2.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {r.description}
                    </p>
                  )}

                  <div className="mt-3.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Instructor
                    </p>
                    <div className="flex items-center gap-2">
                      <Initials name={r.teacherName} tone="navy" className="h-6 w-6 text-[10px]" />
                      <div className="truncate">
                        <p className="font-medium text-xs truncate">{r.teacherName}</p>
                        {r.teacherEmail && (
                          <p className="text-[10px] text-muted-foreground truncate">{r.teacherEmail}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-border pt-2.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium">
                    <Clock className="h-3.5 w-3.5" />
                    {r.credits} Credits / Wk
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium font-mono">{r.className}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
