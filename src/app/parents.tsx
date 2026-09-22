"use client";

import { useEffect, useMemo, useState } from "react";
import { Users, UserCheck, Link2, Phone, Mail } from "lucide-react";
import { PageHeader, SearchInput, EmptyState, Pager, Initials, usePaged, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard, ProgressBar } from "@/components/shared/InfoCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useParents, useStudents, type ApiParent, type ApiStudent } from "@/hooks/useApi";

const PER_PAGE = 8;

function linkedIds(p: ApiParent): string[] {
  try {
    const parsed = JSON.parse(p.linked_student_ids);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Page() {
  const { data: parents, isLoading } = useParents();
  const { data: students } = useStudents();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<ApiParent | null>(null);

  const parentRows = parents ?? [];
  const studentRows = students ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parentRows.filter((p) => {
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q);
    });
  }, [parentRows, search]);

  useEffect(() => setPage(1), [search]);

  const { rows, pageCount } = usePaged(filtered, page, PER_PAGE);

  const total = parentRows.length;
  const activeCount = total; // no status field on real parent records
  const linkedStudents = parentRows.reduce((a, p) => a + linkedIds(p).length, 0);

  const childrenOf = (p: ApiParent): ApiStudent[] => {
    const ids = linkedIds(p);
    return studentRows.filter((s) => ids.includes(s.id));
  };

  return (
    <div>
      <PageHeader title="Parents" description="Directory of parents and guardians." breadcrumb={["Dashboard", "Parents"]} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Total Parents" value={total} icon={Users} tone="navy" />
        <InfoCard label="Active" value={activeCount} icon={UserCheck} tone="success" />
        <InfoCard label="Linked Students" value={linkedStudents} icon={Link2} tone="info" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or email…" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState title="No parents found" description="Try adjusting your search, or add parents from Users." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parent</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Children</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Initials name={p.name} tone="gold" />
                          <span className="truncate font-medium">{p.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="truncate">{p.email ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.phone ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {childrenOf(p).map((c) => (
                            <span key={c.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setActive(p)}>
                          View
                        </Button>
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

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <Initials name={active.name} tone="gold" />
                  <span>{active.name}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <SectionCard title="Contact Information" bodyClassName="space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Email:</span> {active.email ?? "—"}</p>
                  <p><span className="text-muted-foreground">Phone:</span> {active.phone ?? "—"}</p>
                </SectionCard>
                <SectionCard title="Linked Children">
                  <div className="space-y-3">
                    {childrenOf(active).length === 0 && (
                      <p className="text-xs text-muted-foreground">No children linked.</p>
                    )}
                    {childrenOf(active).map((c) => (
                      <div key={c.id} className="panel p-3">
                        <div className="flex items-center gap-2.5">
                          <Initials name={c.name} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.class_name ?? "—"} - {c.section ?? "—"}</p>
                          </div>
                        </div>
                        <ProgressBar
                          className="mt-2"
                          value={c.attendance ?? 0}
                          tone="success"
                          label={<span>Attendance · {c.attendance ?? 0}%</span>}
                        />
                      </div>
                    ))}
                  </div>
                </SectionCard>
                <div className="flex gap-2">
                  {active.email && <Button className="flex-1" asChild><a href={`mailto:${active.email}`}><Mail className="h-4 w-4" /> Email</a></Button>}
                  {active.phone && <Button variant="outline" className="flex-1" asChild><a href={`tel:${active.phone}`}><Phone className="h-4 w-4" /> Call</a></Button>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
