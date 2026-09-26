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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStudents, useClasses } from "@/hooks/useApi";

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
      const matchesQ = !q || s.name.toLowerCase().includes(q) || (s.admission_no ?? "").toLowerCase().includes(q);
      const matchesClass =
        classFilter === "all" || s.class_id === classFilter || classNameById.get(s.class_id ?? "") === classFilter;
      return matchesQ && matchesClass;
    });
  }, [students, search, classFilter, classNameById]);

  useEffect(() => {
    setPage(1);
  }, [search, classFilter]);

  const { rows: paged, pageCount } = usePaged(rows, page, PER_PAGE);
  const avgAttendance = rows.length
    ? Math.round(rows.reduce((a, s) => a + (s.attendance ?? 0), 0) / rows.length)
    : 0;

  return (
    <div>
      <PageHeader title="My Students" description="Students across your assigned classes." breadcrumb={["Dashboard", "My Students"]} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Total Students" value={rows.length} icon={Users} tone="navy" />
        <InfoCard label="Average Attendance" value={`${avgAttendance}%`} icon={Percent} tone="info" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name / admission no…" />
          <FilterSelect value={classFilter} onChange={setClassFilter} options={classOptions} placeholder="Class" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : paged.length === 0 ? (
          <EmptyState title="No students found" description="Try adjusting your search or filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
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
                        <Link to={`/students/${s.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                          <Initials name={s.name} />
                          <span className="truncate font-medium">{s.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {s.class_name} {s.section}
                      </TableCell>
                      <TableCell>{s.roll ?? "—"}</TableCell>
                      <TableCell>{s.attendance ?? 0}%</TableCell>
                      <TableCell className="text-right">
                        <StatusBadge status={s.status ?? "Active"} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={Math.min(page, pageCount)} pageCount={pageCount} onPage={setPage} total={rows.length} />
          </>
        )}
      </div>
    </div>
  );
}
