"use client";

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { BookOpen, GraduationCap, Clock } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import {
  useMyTeacherTeachingSubjects,
  useMyTeacherProfile,
  useClasses,
  useSubjects,
} from "@/hooks/useApi";

function typeTone(type: string | null | undefined) {
  if (type === "Core") return "info" as const;
  if (type === "Elective") return "gold" as const;
  if (type === "Language") return "success" as const;
  return "neutral" as const;
}

export default function TeacherSubjectsPage() {
  const { data: teachingList, isLoading: teachingLoading } = useMyTeacherTeachingSubjects();
  const { data: teacher, isLoading: teacherLoading } = useMyTeacherProfile();
  const { data: classes } = useClasses();
  const { data: allSubjects } = useSubjects();

  // Primary source: relational mappings from /subjects/my-teaching
  // Fallback source: legacy JSON profile if no relational records exist yet
  const subjectsBySubjectId = useMemo(() => {
    if (teachingList && teachingList.length > 0) {
      // Group by subject so we see the subject and all classes taught
      const map = new Map<
        string,
        {
          subjectName: string;
          code: string | null;
          type: string | null;
          credits: number | null;
          description: string | null;
          classes: { id: string; name: string }[];
        }
      >();

      for (const item of teachingList) {
        const existing = map.get(item.subject_id);
        const classObj = { id: item.class_id, name: `${item.class_name}-${item.section}` };
        if (existing) {
          if (!existing.classes.some((c) => c.id === item.class_id)) {
            existing.classes.push(classObj);
          }
        } else {
          map.set(item.subject_id, {
            subjectName: item.subject_name,
            code: item.subject_code,
            type: item.subject_type,
            credits: item.subject_credits,
            description: item.subject_description,
            classes: [classObj],
          });
        }
      }
      return Array.from(map.values());
    }

    // Fallback:
    if (!teacher) return [];
    try {
      const assignedClassIds: string[] = JSON.parse(teacher.assigned_classes || "[]");
      const assignedSubjectIds: string[] = JSON.parse(teacher.assigned_subjects || "[]");
      const matchedClasses = (classes ?? [])
        .filter((c) => assignedClassIds.includes(c.id))
        .map((c) => ({ id: c.id, name: `${c.name}-${c.section}` }));

      return (allSubjects ?? [])
        .filter((s) => assignedSubjectIds.includes(s.id))
        .map((s) => ({
          subjectName: s.name,
          code: s.code,
          type: s.type ?? "Core",
          credits: s.credits ?? 3,
          description: s.description,
          classes: matchedClasses,
        }));
    } catch {
      return [];
    }
  }, [teachingList, teacher, classes, allSubjects]);

  const isLoading = teachingLoading || teacherLoading;
  const totalSubjectsCount = subjectsBySubjectId.length;
  const totalClassesCount = useMemo(() => {
    const classSet = new Set<string>();
    for (const s of subjectsBySubjectId) {
      for (const c of s.classes) classSet.add(c.id);
    }
    return classSet.size;
  }, [subjectsBySubjectId]);

  return (
    <div>
      <PageHeader
        title="My Teaching Subjects"
        description="View curriculum subjects and class sections assigned to you for teaching."
        breadcrumb={["Teacher Portal", "My Subjects"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard
          label="Assigned Subjects"
          value={totalSubjectsCount}
          icon={BookOpen}
          tone="navy"
        />
        <InfoCard
          label="Teaching Classes"
          value={totalClassesCount}
          icon={GraduationCap}
          tone="info"
        />
        <InfoCard
          label="Periods per Week"
          value={`${subjectsBySubjectId.reduce((sum, s) => sum + (s.credits ?? 3) * s.classes.length, 0)}`}
          icon={Clock}
          tone="gold"
        />
      </div>

      {isLoading ? (
        <CardSkeleton count={3} />
      ) : subjectsBySubjectId.length === 0 ? (
        <EmptyState
          title="No subjects assigned yet"
          description="Your school administrator hasn't assigned you to any subjects or classes yet."
          icon={BookOpen}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjectsBySubjectId.map((s, idx) => {
            const perWeek = s.credits ?? 3;
            const classes = [...s.classes].sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { numeric: true }),
            );
            return (
              <div
                key={idx}
                className="flex flex-col rounded-2xl border border-border bg-card shadow-sm"
              >
                <div className="flex items-center gap-3 p-4 pb-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-base font-bold">{s.subjectName}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      You teach this in{" "}
                      <b className="text-foreground">
                        {classes.length} class{classes.length === 1 ? "" : "es"}
                      </b>
                      {s.code ? ` · Code ${s.code}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={`${s.type ?? "Core"} subject`} tone={typeTone(s.type)} />
                </div>

                {s.description && (
                  <p className="-mt-1 line-clamp-2 px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
                    {s.description}
                  </p>
                )}

                <div className="px-4">
                  <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                    Your classes — tap to see students
                  </p>
                  {classes.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {classes.map((c) => (
                        <Link
                          key={c.id}
                          to={`/teacher/students?classId=${c.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold capitalize transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          <GraduationCap className="h-3 w-3 text-primary" />
                          {c.name}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">No classes given yet</p>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 border-t border-border text-center">
                  <div className="px-3 py-2.5">
                    <p className="font-display text-base font-bold tabular-nums">{perWeek}</p>
                    <p className="text-[10px] text-muted-foreground">periods / week per class</p>
                  </div>
                  <div className="border-l border-border px-3 py-2.5">
                    <p className="font-display text-base font-bold tabular-nums text-primary">
                      {perWeek * classes.length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">periods / week in total</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
