import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Eye,
  FileText,
  Landmark,
  MoreHorizontal,
  Pencil,
  Search,
  Send,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { usePayroll, useSalaryStructures, useStaff, useTeachers } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Initials } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PayrollStatus = "Paid" | "Ready" | "On hold";
type SalaryRow = {
  id: string;
  name: string;
  role: string;
  department: "Teaching" | "Non-Teaching";
  account: string;
  gross: number;
  deductions: number;
  fixedDeductions?: number;
  net: number;
  status: PayrollStatus;
  employeeId?: string;
  employeeType?: "TEACHER" | "STAFF";
  payrollId?: string;
  rawStatus?: string;
  basic?: number;
  hra?: number;
  allowance?: number;
  effectiveFrom?: string;
};

const payroll: SalaryRow[] = [
  {
    id: "EMP-0142",
    name: "Aarav Sharma",
    role: "Mathematics Teacher",
    department: "Teaching",
    account: "•••• 4832",
    gross: 58200,
    deductions: 4950,
    net: 53250,
    status: "Paid",
  },
  {
    id: "EMP-0108",
    name: "Meera Iyer",
    role: "Science Teacher",
    department: "Teaching",
    account: "•••• 2091",
    gross: 61400,
    deductions: 5280,
    net: 56120,
    status: "Ready",
  },
  {
    id: "EMP-0217",
    name: "Kabir Singh",
    role: "Sports Teacher",
    department: "Teaching",
    account: "•••• 7714",
    gross: 46500,
    deductions: 3820,
    net: 42680,
    status: "Ready",
  },
  {
    id: "EMP-0304",
    name: "Nisha Verma",
    role: "Accountant",
    department: "Non-Teaching",
    account: "•••• 6108",
    gross: 43800,
    deductions: 3340,
    net: 40460,
    status: "Paid",
  },
  {
    id: "EMP-0319",
    name: "Rohan Das",
    role: "Librarian",
    department: "Non-Teaching",
    account: "•••• 5520",
    gross: 36700,
    deductions: 2740,
    net: 33960,
    status: "On hold",
  },
  {
    id: "EMP-0356",
    name: "Pooja Nair",
    role: "Office Assistant",
    department: "Non-Teaching",
    account: "•••• 9136",
    gross: 32900,
    deductions: 2320,
    net: 30580,
    status: "Ready",
  },
];

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;

function StatusPill({ status }: { status: PayrollStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border-0 px-2.5 py-1 font-medium",
        status === "Paid" && "bg-success-soft text-success",
        status === "Ready" && "bg-info-soft text-info",
        status === "On hold" && "bg-warning-soft text-warning",
      )}
    >
      {status}
    </Badge>
  );
}

function PayslipBreakdown({ row }: { row: SalaryRow }) {
  const basic = Math.round(row.gross * 0.62);
  const hra = Math.round(row.gross * 0.22);
  const allowance = row.gross - basic - hra;
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-muted/50 p-4">
        <div className="flex items-center gap-3">
          <Initials name={row.name} tone="navy" />
          <div>
            <p className="font-semibold">{row.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.id} · {row.role}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Pay period</p>
            <p className="font-medium">September 2026</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Bank account</p>
            <p className="font-medium">{row.account}</p>
          </div>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Earnings
        </p>
        {[
          ["Basic salary", basic],
          ["House rent allowance", hra],
          ["Special allowance", allowance],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex justify-between border-b py-2.5 text-sm">
            <span>{label}</span>
            <span className="font-medium">{money(Number(value))}</span>
          </div>
        ))}
        <div className="flex justify-between pt-3 font-semibold">
          <span>Gross earnings</span>
          <span>{money(row.gross)}</span>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Deductions
        </p>
        <div className="flex justify-between border-b py-2.5 text-sm">
          <span>Provident fund & professional tax</span>
          <span className="font-medium text-destructive">−{money(row.deductions)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-primary p-4 text-primary-foreground">
        <div>
          <p className="text-xs opacity-75">Net salary</p>
          <p className="text-xs opacity-75">31 paid days</p>
        </div>
        <p className="font-display text-2xl font-bold">{money(row.net)}</p>
      </div>
      <Button className="w-full gap-2" onClick={() => toast.success("Payslip download started")}>
        <Download className="h-4 w-4" /> Download payslip
      </Button>
    </div>
  );
}

function SalaryStructureDialog({
  employee,
  onSave,
}: {
  employee: SalaryRow;
  onSave: (row: SalaryRow) => void;
}) {
  const defaultBasic = employee.basic ?? Math.round(employee.gross * 0.62);
  const defaultHra = employee.hra ?? Math.round(employee.gross * 0.22);
  const [basic, setBasic] = useState(String(defaultBasic));
  const [hra, setHra] = useState(String(defaultHra));
  const [allowance, setAllowance] = useState(
    String(employee.allowance ?? employee.gross - defaultBasic - defaultHra),
  );
  const [deductions, setDeductions] = useState(String(employee.fixedDeductions ?? employee.deductions));
  const [effectiveMonth, setEffectiveMonth] = useState(new Date().toISOString().slice(0, 7));
  const gross = (Number(basic) || 0) + (Number(hra) || 0) + (Number(allowance) || 0);
  const net = Math.max(0, gross - (Number(deductions) || 0));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (gross <= 0 || Number(deductions) < 0) {
      toast.error("Enter valid salary amounts");
      return;
    }
    onSave({
      ...employee,
      gross,
      basic: Number(basic),
      hra: Number(hra),
      allowance: Number(allowance),
      deductions: Number(deductions) || 0,
      net,
      effectiveFrom: `${effectiveMonth}-01`,
      status: "Ready",
    });
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit salary structure</DialogTitle>
        <DialogDescription>
          Set recurring monthly earnings and deductions for {employee.name}.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center gap-3">
            <Initials name={employee.name} tone="navy" />
            <div>
              <p className="font-semibold">{employee.name}</p>
              <p className="text-xs text-muted-foreground">
                {employee.id} · {employee.role}
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="salary-basic">Basic salary (₹)</Label>
            <Input
              id="salary-basic"
              type="number"
              min={0}
              value={basic}
              onChange={(e) => setBasic(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="salary-hra">House rent allowance (₹)</Label>
            <Input
              id="salary-hra"
              type="number"
              min={0}
              value={hra}
              onChange={(e) => setHra(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="salary-allowance">Special allowance (₹)</Label>
            <Input
              id="salary-allowance"
              type="number"
              min={0}
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="salary-deductions">PF, tax & deductions (₹)</Label>
            <Input
              id="salary-deductions"
              type="number"
              min={0}
              value={deductions}
              onChange={(e) => setDeductions(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="salary-effective">Effective from</Label>
            <Input
              id="salary-effective"
              type="month"
              value={effectiveMonth}
              onChange={(e) => setEffectiveMonth(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-primary/5 p-3 text-center text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Gross</p>
            <p className="font-semibold">{money(gross)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Deductions</p>
            <p className="font-semibold text-destructive">{money(Number(deductions) || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net salary</p>
            <p className="font-bold text-primary">{money(net)}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">Save salary structure</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function AdminPayroll() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const month = new Date().toISOString().slice(0, 7);
  const payrollDate = new Date(`${month}-01T00:00:00`);
  const payrollMonthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(payrollDate);
  const lastDay = new Date(payrollDate.getFullYear(), payrollDate.getMonth() + 1, 0).getDate();
  const shortMonth = new Intl.DateTimeFormat("en-IN", { month: "short" }).format(payrollDate);
  const { data: teachers } = useTeachers();
  const { data: staff } = useStaff();
  const { data: structures } = useSalaryStructures();
  const { data: payrollItems } = usePayroll(month);
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SalaryRow | null>(null);
  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const payrollRows = useMemo<SalaryRow[]>(() => {
    const people = [
      ...(teachers ?? []).map((person) => ({
        person,
        type: "TEACHER" as const,
        department: "Teaching" as const,
      })),
      ...(staff ?? []).map((person) => ({
        person,
        type: "STAFF" as const,
        department: "Non-Teaching" as const,
      })),
    ];
    return people.map(({ person, type, department }) => {
      const structure = (structures ?? [])
        .filter((s) => s.employee_type === type && s.employee_id === person.id && s.active)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
      const item = (payrollItems ?? []).find(
        (p) => p.employee_type === type && p.employee_id === person.id,
      );
      const gross =
        item?.gross_salary ??
        (structure ? structure.basic_salary + structure.hra + structure.special_allowance : 0);
      const deductions = item
        ? item.fixed_deductions + item.leave_deduction
        : (structure?.fixed_deductions ?? 0);
      return {
        id: person.employee_id ?? person.id.slice(0, 8),
        employeeId: person.id,
        employeeType: type,
        payrollId: item?.id,
        rawStatus: item?.status,
        name: person.name,
        role: person.designation ?? (type === "TEACHER" ? "Teacher" : "Staff"),
        department,
        account: item?.payment_reference ?? "Not recorded",
        gross,
        deductions,
        fixedDeductions: structure?.fixed_deductions ?? item?.fixed_deductions ?? 0,
        net: item?.net_salary ?? Math.max(0, gross - deductions),
        status: item?.status === "PAID" ? "Paid" : item?.status === "ON_HOLD" ? "On hold" : "Ready",
        basic: structure?.basic_salary,
        hra: structure?.hra,
        allowance: structure?.special_allowance,
      };
    });
  }, [teachers, staff, structures, payrollItems]);
  const rows = useMemo(
    () =>
      payrollRows.filter(
        (row) =>
          (department === "all" || row.department === department) &&
          (status === "all" || row.status === status) &&
          `${row.name} ${row.id} ${row.role}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [payrollRows, department, status, query],
  );
  const paid = payrollRows.filter((r) => r.status === "Paid").reduce((sum, r) => sum + r.net, 0);
  const payable = payrollRows.filter((r) => r.status !== "Paid").reduce((sum, r) => sum + r.net, 0);
  async function saveStructure(updated: SalaryRow) {
    if (!updated.employeeId || !updated.employeeType) return;
    try {
      await api.post("/salary-structures", {
        employeeType: updated.employeeType,
        employeeId: updated.employeeId,
        basicSalary: updated.basic ?? Math.round(updated.gross * 0.62),
        hra: updated.hra ?? Math.round(updated.gross * 0.22),
        specialAllowance: updated.allowance ?? 0,
        fixedDeductions: updated.deductions,
        effectiveFrom: updated.effectiveFrom ?? `${month}-01`,
      });
      await queryClient.invalidateQueries({ queryKey: ["salary-structures"] });
      toast.success(`${updated.name}'s salary structure saved`);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save salary structure");
    }
  }
  async function generatePayroll() {
    try {
      const result = await api.post<{ count: number }>("/payroll/generate", {
        month: `${month}-01`,
      });
      await queryClient.invalidateQueries({ queryKey: [`payroll-${month}`] });
      toast.success(`Calculated payroll for ${result.count} employees`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to calculate payroll");
    }
  }
  async function payrollAction(
    row: SalaryRow,
    action: "review" | "approve" | "hold" | "release" | "pay",
  ) {
    if (!row.payrollId) return toast.error("Calculate payroll before changing its status");
    try {
      await api.patch(`/payroll/${row.payrollId}`, {
        action,
        ...(action === "hold" ? { reason: "Held for administrative review" } : {}),
        ...(action === "pay"
          ? { method: "Bank Transfer", reference: `PAY-${Date.now().toString().slice(-8)}` }
          : {}),
      });
      await queryClient.invalidateQueries({ queryKey: [`payroll-${month}`] });
      toast.success(`${row.name}: payroll ${action} completed`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Payroll action failed");
    }
  }
  return (
    <>
      <PageHeader
        title="Payroll Management"
        description="Manage salary structures and monthly payroll for teaching and non-teaching staff."
        breadcrumb={["Fees & Finance", "Payroll Management"]}
        actions={
          <>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => toast.success("Payroll report exported")}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => void generatePayroll()}>
              <Send className="h-4 w-4" /> Calculate payroll
            </Button>
          </>
        }
      />
      {user?.role === "STAFF" && (
        <div className="mb-4 rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-sm">
          <span className="font-semibold text-info">Accounts access:</span> You can manage employee
          salary structures and prepare payroll. Final payment authorization remains with the school
          administration.
        </div>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InfoCard
          label="Total employees"
          value={payrollRows.length}
          hint="Teaching & non-teaching"
          icon={Users}
        />
        <InfoCard
          label="Monthly payroll"
          value={money(payrollRows.reduce((s, r) => s + r.net, 0))}
          hint="Net payable"
          icon={CircleDollarSign}
          tone="gold"
        />
        <InfoCard
          label="Paid this month"
          value={money(paid)}
          hint="Completed payments"
          icon={CheckCircle2}
          tone="success"
        />
        <InfoCard
          label="Awaiting payment"
          value={money(payable)}
          hint="Ready or on hold"
          icon={Banknote}
          tone="warning"
        />
      </div>
      <SectionCard
        title={`${payrollMonthLabel} payroll`}
        subtitle={`Salary cycle · 01 ${shortMonth} – ${lastDay} ${shortMonth}`}
        action={
          <Badge variant="outline" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Payment date: {lastDay} {shortMonth}
          </Badge>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-2 border-b p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search employee or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              <SelectItem value="Teaching">Teaching</SelectItem>
              <SelectItem value="Non-Teaching">Non-teaching</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Ready">Ready</SelectItem>
              <SelectItem value="On hold">On hold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Initials
                        name={row.name}
                        tone={row.department === "Teaching" ? "navy" : "gold"}
                      />
                      <div>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.id} · {row.role}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.department}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{money(row.gross)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {money(row.deductions)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{money(row.net)}</TableCell>
                  <TableCell>
                    <StatusPill status={row.status} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(row)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit salary structure
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSelected(row)}>
                          <Eye className="mr-2 h-4 w-4" /> View payslip
                        </DropdownMenuItem>
                        {row.rawStatus === "CALCULATED" && (
                          <DropdownMenuItem onClick={() => void payrollAction(row, "review")}>
                            Mark reviewed
                          </DropdownMenuItem>
                        )}
                        {user?.role === "SCHOOL_ADMIN" && row.rawStatus === "REVIEWED" && (
                          <DropdownMenuItem onClick={() => void payrollAction(row, "approve")}>
                            Approve salary
                          </DropdownMenuItem>
                        )}
                        {user?.role === "SCHOOL_ADMIN" &&
                          row.rawStatus &&
                          row.rawStatus !== "PAID" &&
                          row.rawStatus !== "ON_HOLD" && (
                            <DropdownMenuItem onClick={() => void payrollAction(row, "hold")}>
                              Place on hold
                            </DropdownMenuItem>
                          )}
                        {user?.role === "SCHOOL_ADMIN" && row.rawStatus === "ON_HOLD" && (
                          <DropdownMenuItem onClick={() => void payrollAction(row, "release")}>
                            Release hold
                          </DropdownMenuItem>
                        )}
                        {row.rawStatus === "APPROVED" && (
                          <DropdownMenuItem onClick={() => void payrollAction(row, "pay")}>
                            Record bank payment
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => toast.success(`Payslip sent to ${row.name}`)}
                        >
                          <Send className="mr-2 h-4 w-4" /> Send payslip
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            Showing {rows.length} of {payrollRows.length} employees
          </span>
          <span>Amounts in INR</span>
        </div>
      </SectionCard>
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Salary details</SheetTitle>
            <SheetDescription>Complete payslip breakdown for {payrollMonthLabel}.</SheetDescription>
          </SheetHeader>
          <div className="p-4">{selected && <PayslipBreakdown row={selected} />}</div>
        </SheetContent>
      </Sheet>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && <SalaryStructureDialog employee={editing} onSave={saveStructure} />}
      </Dialog>
    </>
  );
}

function EmployeeSalary() {
  const { user } = useAuth();
  const { data: items } = usePayroll();
  const latest = items?.[0];
  const fallback = payroll[0]!;
  const row: SalaryRow = {
    ...fallback,
    name: user?.name || fallback.name,
    role: user?.role === "TEACHER" ? "Teacher" : "School Staff",
    gross: latest?.gross_salary ?? 0,
    deductions: latest ? latest.fixed_deductions + latest.leave_deduction : 0,
    net: latest?.net_salary ?? 0,
    status: latest?.status === "PAID" ? "Paid" : latest?.status === "ON_HOLD" ? "On hold" : "Ready",
    rawStatus: latest?.status,
    payrollId: latest?.id,
  };
  const history = (items ?? []).map((item) => ({
    month: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(
      new Date(`${item.payroll_month}T00:00:00`),
    ),
    net: item.net_salary,
    paid: item.paid_at
      ? new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date(item.paid_at))
      : item.status.replaceAll("_", " "),
  }));
  const period = history[0]?.month ?? "No payroll generated";
  return (
    <>
      <PageHeader
        title="My Salary"
        description="View your salary breakdown, payment history, and download payslips."
        breadcrumb={["My workspace", "My Salary"]}
        actions={
          <Button className="gap-2" onClick={() => toast.success("Payslip download started")}>
            <Download className="h-4 w-4" /> Download payslip
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InfoCard
          label="Net salary"
          value={money(row.net)}
          hint={period}
          icon={Banknote}
          tone="success"
        />
        <InfoCard
          label="Gross earnings"
          value={money(row.gross)}
          hint="Before deductions"
          icon={CircleDollarSign}
        />
        <InfoCard
          label="Total deductions"
          value={money(row.deductions)}
          hint="PF & professional tax"
          icon={FileText}
          tone="warning"
        />
        <InfoCard
          label="Payment status"
          value={latest?.status.replaceAll("_", " ") ?? "Not generated"}
          hint={latest?.payment_method ?? "Awaiting payroll"}
          icon={CheckCircle2}
          tone="success"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <SectionCard
          title={`${period} payslip`}
          subtitle={
            latest
              ? `${latest.paid_days} paid days · ${latest.unpaid_days} unpaid days`
              : "Payroll has not been generated"
          }
        >
          <PayslipBreakdown row={row} />
        </SectionCard>
        <div className="space-y-5">
          <SectionCard
            title="Payment history"
            subtitle="Your recent salary payments"
            bodyClassName="p-0"
          >
            <div className="divide-y">
              {history.map((item) => (
                <div key={item.month} className="flex items-center gap-3 p-4">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-success-soft text-success">
                    <Landmark className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.month}</p>
                    <p className="text-xs text-muted-foreground">Bank transfer · {item.paid}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{money(item.net)}</p>
                    <p className="text-xs text-success">{item.paid}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
          <div className="rounded-2xl border border-info/20 bg-info-soft p-4 text-sm">
            <p className="font-semibold text-info">Need help with your salary?</p>
            <p className="mt-1 text-muted-foreground">
              Contact the school accounts office if your bank details or salary information is
              incorrect.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Salary({ mode = "personal" }: { mode?: "manage" | "personal" }) {
  return mode === "manage" ? <AdminPayroll /> : <EmployeeSalary />;
}
