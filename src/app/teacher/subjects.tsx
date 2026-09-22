"use client";

import { useMemo } from "react";
import { BookOpen, GraduationCap, Clock, Sparkles } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { useMyTeacherTeachingSubjects, useMyTeacherProfile, useClasses, useSubjects } from "@/hooks/useApi";

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
        <InfoCard label="Assigned Subjects" value={totalSubjectsCount} icon={BookOpen} tone="navy" />
        <InfoCard label="Teaching Classes" value={totalClassesCount} icon={GraduationCap} tone="info" />
        <InfoCard
          label="Total Weekly Credits"
          value={`${subjectsBySubjectId.reduce((sum, s) => sum + (s.credits ?? 3) * s.classes.length, 0)} hrs`}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjectsBySubjectId.map((s, idx) => (
            <div
              key={idx}
              className="panel flex flex-col justify-between p-4 border border-border/80 hover:border-primary/40 transition-all shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-bold text-base leading-tight">{s.subjectName}</h3>
                      <span className="font-mono text-xs text-muted-foreground">{s.code ?? "No Code"}</span>
                    </div>
                  </div>
                  <StatusBadge status={s.type ?? "Core"} tone={typeTone(s.type)} />
                </div>

                {s.description && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {s.description}
                  </p>
                )}

                <div className="mt-4 rounded-lg bg-muted/40 p-3 border border-border/60">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Assigned Classes ({s.classes.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.classes.length > 0 ? (
                      s.classes.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 rounded-md bg-surface px-2.5 py-1 text-xs font-semibold border border-border/80 text-foreground"
                        >
                          <GraduationCap className="h-3 w-3 text-primary" />
                          {c.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No classes allocated</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-medium">
                  <Clock className="h-3.5 w-3.5" />
                  {s.credits ?? 3} Credit Hours / Week
                </span>
                <span className="text-[11px] font-medium text-primary bg-primary/5 px-2 py-0.5 rounded">
                  Active
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
