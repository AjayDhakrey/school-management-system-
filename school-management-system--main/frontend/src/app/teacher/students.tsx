"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Users, Percent } from "lucide-react";
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
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStudents, useClasses, useMyTeacherProfile } from "@/hooks/useApi";

const PER_PAGE = 10;

export default function TeacherStudentsPage() {
  const [params] = useSearchParams();
  const { data: students, isLoading } = useStudents();
  const { data: classes } = useClasses();

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(params.get("classId") ?? "all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const cid = params.get("classId");
    if (cid) setClassFilter(cid);
  }, [params]);

  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classes ?? []) map.set(c.id, `${c.name}-${c.section}`);
    return map;
  }, [classes]);

  const classOptions = useMemo(() => Array.from(classNameById.values()), [classNameById]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students ?? []).filter((s) => {
      const matchesQ =
        !q || s.name.toLowerCase().includes(q) || (s.admission_no ?? "").toLowerCase().includes(q);
      const matchesClass =
        classFilter === "all" ||
        s.class_id === classFilter ||
        classNameById.get(s.class_id ?? "") === classFilter;
      return matchesQ && matchesClass;
    });
  }, [students, search, classFilter, classNameById]);

  useEffect(() => {
    setPage(1);
  }, [search, classFilter]);

  const { rows: paged, pageCount } = usePaged(rows, page, PER_PAGE);

  // Attendance is the class teacher's business: it's shown only for students of the
  // teacher's own class, not for other classes they merely teach a subject in.
  const { data: teacher } = useMyTeacherProfile();
  const ownClassIds = useMemo(
    () =>
      new Set(
        (classes ?? [])
          .filter((c) => teacher && c.class_teacher_id === teacher.id)
          .map((c) => c.id),
      ),
    [classes, teacher],
  );
  const canSeeAttendance = (s: { class_id: string | null }) => ownClassIds.has(s.class_id ?? "");
  const ownRows = rows.filter(canSeeAttendance);
  const avgAttendance = ownRows.length
    ? Math.round(ownRows.reduce((a, s) => a + (s.attendance ?? 0), 0) / ownRows.length)
    : 0;

  return (
    <div>
      <PageHeader
        title="My Students"
        description="Students across your assigned classes."
        breadcrumb={["Dashboard", "My Students"]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Total Students" value={rows.length} icon={Users} tone="navy" />
        {ownClassIds.size > 0 && (
          <InfoCard
            label="My Class Attendance"
            value={ownRows.length ? `${avgAttendance}%` : "—"}
            icon={Percent}
            tone="info"
          />
        )}
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name / admission no…"
          />
          <FilterSelect
            value={classFilter}
            onChange={setClassFilter}
            options={classOptions}
            placeholder="Class"
          />
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : paged.length === 0 ? (
          <EmptyState
            title="No students found"
            description="Try adjusting your search or filters."
          />
        ) : (
          <>
            {/* Phones: one compact row per student. */}
            <ul className="divide-y divide-border md:hidden">
              {paged.map((s) => {
                const pct = Math.round(Number(s.attendance ?? 0) * 10) / 10;
                const tone =
                  pct >= 90
                    ? "bg-success-soft text-success"
                    : pct >= 75
                      ? "bg-warning-soft text-warning"
                      : "bg-destructive-soft text-destructive";
                return (
                  <li key={s.id}>
                    <Link
                      to={`/students/${s.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 active:bg-muted/50"
                    >
                      <Initials name={s.name} className="h-9 w-9 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold capitalize">{s.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          Roll {s.roll ?? "—"} ·{" "}
                          <span className="capitalize">
                            {s.class_name}
                            {s.section ? `-${s.section}` : ""}
                          </span>
                        </p>
                      </div>
                      {canSeeAttendance(s) && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
                        >
                          {pct}%
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Roll No.</TableHead>
                    <TableHead>Attendance</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          to={`/students/${s.id}`}
                          className="flex min-w-0 items-center gap-2.5 hover:underline"
                        >
                          <Initials name={s.name} />
                          <span className="truncate font-medium">{s.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {s.class_name} {s.section}
                      </TableCell>
                      <TableCell>{s.roll ?? "—"}</TableCell>
                      <TableCell className={canSeeAttendance(s) ? "" : "text-muted-foreground"}>
                        {canSeeAttendance(s) ? `${s.attendance ?? 0}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge status={s.status ?? "Active"} />
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
              total={rows.length}
            />
          </>
        )}
      </div>
    </div>
  );
}
