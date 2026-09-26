"use client";

import { useMemo, useState } from "react";
import { IndianRupee } from "lucide-react";
import { PageHeader, EmptyState, SearchInput, Initials, Pager, usePaged } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useFees, useStudents } from "@/hooks/useApi";

function payable(amount: number, discount: number, fine: number) {
  return Math.max(0, amount - discount + fine);
}

export default function TransportFeesPage() {
  const { data: fees, isLoading } = useFees();
  const { data: students } = useStudents();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const studentsById = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students]);

  const transportFees = useMemo(
    () => (fees ?? []).filter((f) => f.fee_type.toLowerCase().includes("transport")),
    [fees],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transportFees.filter((f) => {
      if (!q) return true;
      const student = studentsById.get(f.student_id);
      return (student?.name ?? "").toLowerCase().includes(q) || (student?.class_name ?? "").toLowerCase().includes(q);
    });
  }, [transportFees, search, studentsById]);
  const { rows, pageCount } = usePaged(filtered, page, 15);

  const totalBilled = transportFees.reduce((s, f) => s + payable(f.amount, f.discount, f.fine), 0);
  const totalCollected = transportFees.reduce((s, f) => s + f.paid_amount, 0);
  const totalOutstanding = totalBilled - totalCollected;

  return (
    <div>
      <PageHeader
        title="Transport Fees"
        description="Read-only view of transport fee billing and collection — managed by Accounts."
        breadcrumb={["Dashboard", "Transport", "Transport Fees"]}
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <InfoCard label="Total Billed" value={`₹${totalBilled.toLocaleString()}`} icon={IndianRupee} tone="navy" />
        <InfoCard label="Collected" value={`₹${totalCollected.toLocaleString()}`} icon={IndianRupee} tone="success" />
        <InfoCard label="Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} icon={IndianRupee} tone="warning" />
      </div>

      <SectionCard
        bodyClassName="p-0"
        action={
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search students…"
          />
        }
      >
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No transport fee records"
            description="Fee heads named 'Transport' created in Fee Structures will appear here."
            icon={IndianRupee}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Student</th>
                    <th className="px-4 py-2.5 font-medium">Class</th>
                    <th className="px-4 py-2.5 font-medium">Due Date</th>
                    <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-4 py-2.5 font-medium text-right">Paid</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => {
                    const student = studentsById.get(f.student_id);
                    return (
                      <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Initials name={student?.name ?? "—"} className="h-7 w-7 text-[10px]" />
                            <span className="font-medium">{student?.name ?? "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {student?.class_name ?? "—"} {student?.section ?? ""}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{f.due_date ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">
                          ₹{payable(f.amount, f.discount, f.fine).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">₹{f.paid_amount.toLocaleString()}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={f.calculated_status ?? f.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2.5 p-4 md:hidden">
              {rows.map((f) => {
                const student = studentsById.get(f.student_id);
                return (
                  <div key={f.id} className="min-w-0 overflow-hidden rounded-xl border border-border p-3">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{student?.name ?? "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">{student?.class_name ?? "—"}</p>
                      </div>
                      <StatusBadge status={f.calculated_status ?? f.status} className="shrink-0" />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Due {f.due_date ?? "—"}</span>
                      <span className="font-semibold text-foreground">
                        ₹{f.paid_amount.toLocaleString()} / ₹{payable(f.amount, f.discount, f.fine).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
