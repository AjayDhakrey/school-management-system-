"use client";

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Users, ArrowRight } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useMyTeacherProfile, useClasses, useStudents } from "@/hooks/useApi";

export default function TeacherClassesPage() {
  const { data: teacher, isLoading: teacherLoading } = useMyTeacherProfile();
  const { data: classes, isLoading: classesLoading } = useClasses();
  const { data: students } = useStudents();

  const assignedClassIds: string[] = useMemo(() => (teacher ? JSON.parse(teacher.assigned_classes) : []), [teacher]);

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
      <PageHeader title="My Classes" description="Classes and sections assigned to you." breadcrumb={["Dashboard", "My Classes"]} />

      {isLoading ? (
        <CardSkeleton count={4} />
      ) : rows.length === 0 ? (
        <EmptyState title="No classes assigned" description="Your school administrator hasn't assigned you to any class yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <div key={c.id} className="panel flex flex-col gap-3 p-4 shadow-md shadow-gray-300">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold">
                    Class {c.name}
                    {c.section}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {c.studentCount} Student{c.studentCount === 1 ? "" : "s"}
                  </p>
                </div>
                {c.isClassTeacher && <StatusBadge status="Class Teacher" />}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>View students, attendance and homework for this class</span>
              </div>
              <Link
                to={`/teacher/students?classId=${c.id}`}
                className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                View Students <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
