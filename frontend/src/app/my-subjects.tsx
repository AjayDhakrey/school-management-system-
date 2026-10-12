"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Clock,
  Mail,
  Phone,
  User,
  TableIcon,
  LayoutGrid,
} from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton, Initials } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const MARK_TONES = [
  "bg-info-soft text-info",
  "bg-gold-soft text-gold-foreground",
  "bg-success-soft text-success",
  "bg-primary/10 text-primary",
  "bg-destructive-soft text-destructive",
];

/** A stable colour per subject, so the same subject always looks the same. */
function markTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 1000;
  return MARK_TONES[hash % MARK_TONES.length];
}

/** Rounded tile with the subject's first letter. */
function SubjectMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-base font-bold uppercase",
        markTone(name),
        className,
      )}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

function ContactButtons({
  email,
  phone,
  name,
}: {
  email?: string | null | undefined;
  phone?: string | null | undefined;
  name: string;
}) {
  return (
    <>
      {phone && (
        <a
          href={`tel:${phone}`}
          aria-label={`Call ${name}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success-soft text-success transition-transform active:scale-90"
        >
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          aria-label={`Email ${name}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-info-soft text-info transition-transform active:scale-90"
        >
          <Mail className="h-3.5 w-3.5" />
        </a>
      )}
    </>
  );
}

type SubjectRow = {
  subjectName: string;
  code: string;
  type: string;
  credits: number;
  description?: string | null | undefined;
  teacherName: string;
  teacherEmail?: string | null | undefined;
  teacherPhone?: string | null | undefined;
  className: string;
};

/** One subject as an app-style card — subject on top, its teacher with quick contact below. */
function SubjectCard({ row: r }: { row: SubjectRow }) {
  const unassigned = r.teacherName === "Unassigned";
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <SubjectMark name={r.subjectName} className="h-11 w-11 text-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="truncate text-[15px] font-bold capitalize leading-tight">
              {r.subjectName}
            </h4>
            <StatusBadge status={r.type} tone={typeTone(r.type)} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {r.code !== "—" && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono font-medium">
                {r.code}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {r.credits} hrs / week
            </span>
          </div>
        </div>
      </div>

      {r.description && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {r.description}
        </p>
      )}

      <div className="mt-auto pt-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 p-2.5">
          {unassigned ? (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <User className="h-4 w-4" />
            </span>
          ) : (
            <Initials name={r.teacherName} tone="navy" className="h-9 w-9 text-[11px]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Teacher
            </p>
            <p
              className={cn(
                "truncate text-sm font-semibold",
                unassigned && "font-medium text-muted-foreground",
              )}
            >
              {unassigned ? "Not assigned yet" : r.teacherName}
            </p>
          </div>
          <ContactButtons email={r.teacherEmail} phone={r.teacherPhone} name={r.teacherName} />
        </div>
      </div>
    </div>
  );
}

export default function MySubjectsPage() {
  const { data: studentClassSubjects, isLoading: loadingClassSubjects } =
    useMyStudentClassSubjects();
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
    const result: SubjectRow[] = [];

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
        <InfoCard
          label="Total Weekly Credits"
          value={`${totalCredits} hrs`}
          icon={Clock}
          tone="gold"
        />
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Course Curriculum</h3>
            <p className="truncate text-xs text-muted-foreground">
              Academic Year {school?.session ?? "2026-2027"} · {rows.length}{" "}
              {rows.length === 1 ? "subject" : "subjects"}
            </p>
          </div>
          <div className="hidden items-center gap-0.5 rounded-xl bg-muted p-1 md:flex">
            {(
              [
                { key: "table", icon: TableIcon, label: "Table view" },
                { key: "card", icon: LayoutGrid, label: "Card view" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg transition-colors",
                  view === key
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
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
        ) : (
          <>
            {/* Phones always get cards; desktop follows the table / card toggle. */}
            <div
              className={cn(
                "grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3",
                view === "table" && "md:hidden",
              )}
            >
              {rows.map((r, i) => (
                <SubjectCard key={i} row={r} />
              ))}
            </div>

            {view === "table" && (
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-xs">
                      <TableHead className="pl-4">Subject</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Teacher</TableHead>
                      <TableHead className="text-center">Credits / Wk</TableHead>
                      <TableHead className="pr-4 text-right">Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={i} className="transition-colors hover:bg-muted/30">
                        <TableCell className="pl-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <SubjectMark name={r.subjectName} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold capitalize text-foreground">
                                {r.subjectName}
                              </p>
                              <p className="max-w-[280px] truncate text-[11px] text-muted-foreground">
                                {r.code !== "—" && <span className="font-mono">{r.code}</span>}
                                {r.code !== "—" && r.description && " · "}
                                {r.description}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.type} tone={typeTone(r.type)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2">
                            <Initials
                              name={r.teacherName}
                              tone="navy"
                              className="h-8 w-8 text-[10px]"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {r.teacherName}
                              </p>
                              {r.teacherEmail && (
                                <p className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                                  {r.teacherEmail}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                            {r.credits} hrs
                          </span>
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex justify-end gap-1.5">
                            <ContactButtons
                              email={r.teacherEmail}
                              phone={r.teacherPhone}
                              name={r.teacherName}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
