"use client";

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Users, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { useMyTeacherProfile, useClasses, useStudents } from "@/hooks/useApi";

export default function TeacherClassesPage() {
  const { data: teacher, isLoading: teacherLoading } = useMyTeacherProfile();
  const { data: classes, isLoading: classesLoading } = useClasses();
  const { data: students } = useStudents();

  const assignedClassIds: string[] = useMemo(
    () => (teacher ? JSON.parse(teacher.assigned_classes) : []),
    [teacher],
  );

  const rows = useMemo(() => {
    return (classes ?? [])
      .filter((c) => assignedClassIds.includes(c.id))
      .map((c) => ({
        ...c,
        studentCount: (students ?? []).filter((s) => s.class_id === c.id).length,
        isClassTeacher: c.class_teacher_id === teacher?.id,
      }));
  }, [classes, assignedClassIds, students, teacher]);

  const isLoading = teacherLoading || classesLoading;

  return (
    <div>
      <PageHeader
        title="My Classes"
        description="Classes and sections assigned to you."
        breadcrumb={["Dashboard", "My Classes"]}
      />

      {isLoading ? (
        <CardSkeleton count={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No classes assigned"
          description="Your school administrator hasn't assigned you to any class yet."
        />
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => {
            const name = /^class\b/i.test(c.name.trim()) ? c.name.trim() : `Class ${c.name}`;
            return (
              <li key={c.id}>
                <Link
                  to={`/teacher/students?classId=${c.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-muted/40 active:scale-[0.99]"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-sm font-bold text-primary">
                    {c.section || "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold capitalize">
                        {name}
                        {c.section ? ` – ${c.section}` : ""}
                      </span>
                      {c.isClassTeacher && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Class Teacher
                        </span>
                      )}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
