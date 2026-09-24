"use client";

import { useMemo } from "react";
import { ClipboardList, ScrollText } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useFees,
  useExpenses,
  usePayroll,
  useFinancialAuditLog,
  type ApiFee,
} from "@/hooks/useApi";

function payable(f: ApiFee) {
  return Math.max(0, f.amount - f.discount + f.fine);
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          tone === "success"
            ? "font-semibold text-success"
            : tone === "warning"
              ? "font-semibold text-warning"
              : tone === "danger"
                ? "font-semibold text-destructive"
                : "font-semibold"
        }
      >
        {value}
      </span>
    </div>
  );
}

export default function FinancialReportsPage() {
  const { data: fees } = useFees();
  const { data: expenses } = useExpenses();
  const { data: payroll } = usePayroll();
  const { data: auditLog } = useFinancialAuditLog();

  const feeRows = fees ?? [];
  const collected = feeRows.reduce((s, f) => s + f.paid_amount, 0);
  const outstanding = feeRows.reduce((s, f) => s + Math.max(0, payable(f) - f.paid_amount), 0);
  const overdue = feeRows
    .filter((f) => (f.calculated_status ?? f.status) === "Overdue")
    .reduce((s, f) => s + Math.max(0, payable(f) - f.paid_amount), 0);
  const totalDiscounts = feeRows.reduce((s, f) => s + f.discount, 0);

  const expenseRows = expenses ?? [];
  const totalExpenses = expenseRows.reduce((s, e) => s + e.amount, 0);
  const monthStr = new Date().toISOString().slice(0, 7);
  const expensesThisMonth = expenseRows
    .filter((e) => e.expense_date.slice(0, 7) === monthStr)
    .reduce((s, e) => s + e.amount, 0);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenseRows) {
      const key = e.category_id ?? "uncategorized";
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenseRows]);

  const payrollRows = payroll ?? [];
  const totalPayroll = payrollRows.reduce((s, p) => s + p.net_salary, 0);
  const paidPayroll = payrollRows.filter((p) => p.status === "PAID").reduce((s, p) => s + p.net_salary, 0);
  const pendingPayroll = totalPayroll - paidPayroll;

  const totalIncome = collected;
  const totalOutgo = totalExpenses + paidPayroll;
  const net = totalIncome - totalOutgo;

  return (
    <div>
      <PageHeader
        title="Financial Reports"
        description="Collection, outstanding, expense, payroll and income vs. expense — across the whole school."
        breadcrumb={["Dashboard", "Financial Reports"]}
      />

      <Tabs defaultValue="collection" className="w-full">
        <div className="scrollbar-slim mb-4 overflow-x-auto">
          <TabsList className="w-max flex-nowrap justify-start gap-1">
            <TabsTrigger value="collection">Collection</TabsTrigger>
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            <TabsTrigger value="expense">Expense</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="income-expense">Income &amp; Expense</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="collection">
          <SectionCard title="Collection Report" subtitle="Fee collection summary across all students">
            <Row label="Total Collected" value={`₹${collected.toLocaleString()}`} tone="success" />
            <Row label="Total Discounts / Scholarships" value={`₹${totalDiscounts.toLocaleString()}`} />
            <Row label="Total Billed Volume" value={`₹${(collected + outstanding).toLocaleString()}`} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="outstanding">
          <SectionCard title="Outstanding Report" subtitle="Unpaid dues still owed to the school">
            <Row label="Total Outstanding" value={`₹${outstanding.toLocaleString()}`} tone="warning" />
            <Row label="Overdue Portion" value={`₹${overdue.toLocaleString()}`} tone="danger" />
            <Row
              label="Fee Records with a Balance"
              value={String(feeRows.filter((f) => payable(f) - f.paid_amount > 0).length)}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="expense">
          <SectionCard title="Expense Report" subtitle="School spending by category">
            <Row label="Total Expenses" value={`₹${totalExpenses.toLocaleString()}`} />
            <Row label="This Month" value={`₹${expensesThisMonth.toLocaleString()}`} />
            {expensesByCategory.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No expenses recorded yet.</p>
            ) : (
              <div className="mt-3 space-y-1">
                {expensesByCategory.map(([key, amount]) => (
                  <Row key={key} label={key === "uncategorized" ? "Uncategorized" : key} value={`₹${amount.toLocaleString()}`} />
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="payroll">
          <SectionCard title="Payroll Report" subtitle="Staff salary payouts across all runs">
            <Row label="Total Payroll (Net)" value={`₹${totalPayroll.toLocaleString()}`} />
            <Row label="Paid Out" value={`₹${paidPayroll.toLocaleString()}`} tone="success" />
            <Row label="Pending / Not Yet Paid" value={`₹${pendingPayroll.toLocaleString()}`} tone="warning" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="income-expense">
          <SectionCard title="Income vs. Expense" subtitle="Fee collections against expenses and paid salaries">
            <Row label="Total Income (Fees Collected)" value={`₹${totalIncome.toLocaleString()}`} tone="success" />
            <Row label="Total Outgo (Expenses + Payroll Paid)" value={`₹${totalOutgo.toLocaleString()}`} tone="danger" />
            <Row label="Net" value={`₹${net.toLocaleString()}`} tone={net >= 0 ? "success" : "danger"} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="audit">
          <SectionCard title="Financial Audit Log" subtitle="Sensitive financial actions, most recent first" bodyClassName="p-0">
            {(auditLog ?? []).length === 0 ? (
              <EmptyState title="No audit entries yet" description="Payment and refund activity will be logged here." icon={ScrollText} />
            ) : (
              <div className="divide-y divide-border">
                {(auditLog ?? []).slice(0, 50).map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 p-3.5">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <ClipboardList className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.action}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.actor_name ?? "System"} · {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
