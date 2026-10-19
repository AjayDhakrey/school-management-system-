import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  Mail,
  Printer,
  Pencil,
  MoreHorizontal,
  Droplet,
  CalendarClock,
  CalendarDays,
  FileText,
  Plus,
  Link2Off,
  LayoutGrid,
  UserRound,
  Users,
  GraduationCap,
  CalendarCheck,
  Wallet,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Initials, PageHeader, EmptyState } from "@/components/shared/ui-kit";
import { InfoCard, ProgressBar } from "@/components/shared/InfoCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, GradeBadge } from "@/components/shared/StatusBadge";
import {
  useStudent,
  useStudents,
  useParents,
  useSubjects,
  useSubjectMappings,
  useAttendanceFor,
  useFeesFor,
  useResultsFor,
  useExams,
  useCertificates,
  useNotices,
  type ApiParent,
} from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { billNewStudent } from "@/lib/auto-billing";
import { feeStatusOf, feeTitle, sortStudentFees } from "@/lib/fees";
import { FeeCard } from "@/components/shared/FeeCard";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudentFormDialog } from "@/pages/StudentsPage";
import { PhoneInput } from "@/components/shared/PhoneInput";

const PROFILE_TABS = [
  { value: "overview", label: "Overview", short: "Overview", icon: LayoutGrid },
  { value: "personal", label: "Personal Info", short: "Personal", icon: UserRound },
  { value: "parent", label: "Parents / Guardians", short: "Parents", icon: Users },
  { value: "academic", label: "Academic", short: "Academic", icon: GraduationCap },
  { value: "attendance", label: "Attendance", short: "Attendance", icon: CalendarCheck },
  { value: "fees", label: "Fees", short: "Fees", icon: Wallet },
  { value: "results", label: "Results", short: "Results", icon: Award },
  { value: "documents", label: "Documents", short: "Docs", icon: FileText },
] as const;

const SUBJECT_TONES = [
  "bg-info-soft text-info",
  "bg-gold-soft text-gold-foreground",
  "bg-success-soft text-success",
  "bg-primary/10 text-primary",
  "bg-destructive-soft text-destructive",
];

/** A stable colour per subject name. */
function subjectTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 1000;
  return SUBJECT_TONES[hash % SUBJECT_TONES.length];
}

/** What the student actually owes on a fee: amount less discount plus fine. */
function feePayable(f: { amount: number; discount: number; fine: number }) {
  return Math.max(0, f.amount - f.discount + f.fine);
}

const STAT_TONE = {
  info: "bg-info-soft text-info",
  gold: "bg-gold-soft text-gold-foreground",
  navy: "bg-primary/10 text-primary",
  danger: "bg-destructive-soft text-destructive",
} as const;

/** "2026-09-15" → "15 Sep 2026". */
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Compact overview tile — icon and label on one line, the value below it. */
function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  muted,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof STAT_TONE;
  label: string;
  value: string;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", STAT_TONE[tone])}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      </div>
      <p
        className={cn(
          "mt-2 truncate font-display text-base font-bold leading-tight sm:text-lg",
          muted && "text-sm font-semibold text-muted-foreground",
        )}
      >
        {value}
      </p>
      {children}
    </div>
  );
}

function AddGuardianForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const guardian = await api.post<{ id: string }>("/parents", { name, email, phone });
      await api.post(`/parents/${guardian.id}/link`, { studentId });
      await queryClient.invalidateQueries({ queryKey: ["parents"] });
      toast.success(`${name} linked as guardian`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add guardian");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="g-name">Full Name</Label>
        <Input id="g-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="g-email">Email</Label>
        <Input id="g-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="g-phone">Phone</Label>
        <PhoneInput id="g-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Add & Link Guardian
        </Button>
      </DialogFooter>
    </form>
  );
}

function ParentsGuardiansSection({ studentId }: { studentId: string }) {
  const { data: allParents, isLoading } = useParents();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [existingToLink, setExistingToLink] = useState("");

  const linked = (allParents ?? []).filter((p) =>
    (JSON.parse(p.linked_student_ids || "[]") as string[]).includes(studentId),
  );
  const unlinked = (allParents ?? []).filter((p) => !linked.some((l) => l.id === p.id));

  async function linkExisting() {
    if (!existingToLink) return;
    try {
      await api.post(`/parents/${existingToLink}/link`, { studentId });
      await queryClient.invalidateQueries({ queryKey: ["parents"] });
      toast.success("Guardian linked");
      setExistingToLink("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link guardian");
    }
  }

  async function unlink(parent: ApiParent) {
    try {
      await api.post(`/parents/${parent.id}/unlink`, { studentId });
      await queryClient.invalidateQueries({ queryKey: ["parents"] });
      toast.success(`${parent.name} removed as guardian`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove guardian");
    }
  }

  return (
    <SectionCard
      title="Parents / Guardians"
      subtitle="Linked guardian accounts for this student"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Add Guardian
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Guardian</DialogTitle>
            </DialogHeader>
            <AddGuardianForm studentId={studentId} onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : linked.length === 0 ? (
        <EmptyState
          title="No guardians linked"
          description="Add a new guardian or link an existing parent account."
        />
      ) : (
        <div className="space-y-3">
          {linked.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <Initials name={p.name} tone="gold" />
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.email ?? "—"} · {p.phone ?? "—"}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => unlink(p)}>
                <Link2Off className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {unlinked.length > 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 p-4">
          <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Link Existing Guardian
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <select
                className="h-10 w-full appearance-none rounded-xl border border-border bg-card px-3.5 pr-9 text-sm font-medium shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={existingToLink}
                onChange={(e) => setExistingToLink(e.target.value)}
              >
                <option value="">Select a guardian to link…</option>
                {unlinked.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.email ?? "no email"})
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </span>
            </div>
            <Button
              size="sm"
              onClick={linkExisting}
              disabled={!existingToLink}
              className="h-10 shrink-0 gap-1.5 rounded-xl px-5 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" /> Link Guardian
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

const attendanceMarkStyle: Record<string, string> = {
  Present: "bg-success-soft text-success",
  Absent: "bg-destructive-soft text-destructive",
  Leave: "bg-warning-soft text-warning",
};

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState<string>("overview");

  // Teachers cannot see Fees or Documents tabs
  const visibleTabs = isTeacher
    ? PROFILE_TABS.filter((t) => t.value !== "fees" && t.value !== "documents")
    : PROFILE_TABS;

  const { data: student, isLoading, isError } = useStudent(id);
  const { data: allStudents } = useStudents();
  const { data: allParents } = useParents();
  const { data: subjects } = useSubjects();
  const { data: classSubjectMappings } = useSubjectMappings(
    student?.class_id ? { classId: student.class_id } : undefined,
    Boolean(student?.class_id),
  );
  const { data: attendanceRecords } = useAttendanceFor(id);
  const { data: feeRecords } = useFeesFor(id);
  const { data: resultRecords } = useResultsFor(id);
  const { data: exams } = useExams();
  const { data: certificates } = useCertificates(id);
  const { data: notices } = useNotices();

  const [billing, setBilling] = useState(false);

  /** Bills this student from their class's fee structure (same rules as on admission). */
  async function billFromStructure() {
    if (!student) return;
    setBilling(true);
    try {
      const { count, total, reason } = await billNewStudent({
        studentId: student.id,
        classId: student.class_id,
        academicYearId: student.academic_year_id,
        admittedOn: student.admitted_on,
        isHosteller: Boolean(student.is_hosteller),
        hasTransport: Boolean(student.vehicle_id),
      });
      if (count) {
        toast.success(
          `Billed ${count} fee${count === 1 ? "" : "s"} (₹${total.toLocaleString()}) to ${student.name}`,
        );
        await queryClient.invalidateQueries({ queryKey: [`fees-${id}`] });
        await queryClient.invalidateQueries({ queryKey: ["fees"] });
      } else {
        toast.info(`Nothing to bill — ${reason ?? "no fees are due"}.`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to bill fees");
    } finally {
      setBilling(false);
    }
  }

  async function invalidateStudent() {
    await queryClient.invalidateQueries({ queryKey: [`student-${id}`] });
    await queryClient.invalidateQueries({ queryKey: ["students"] });
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Loading…" breadcrumb={["Dashboard", "Students"]} />
        <p className="text-sm text-muted-foreground">Loading student profile…</p>
      </div>
    );
  }

  if (isError || !student) {
    return (
      <div>
        <PageHeader title="Student not found" breadcrumb={["Dashboard", "Students"]} />
        <EmptyState
          title="Student not found"
          description="This student record doesn't exist or you don't have access to it."
        />
      </div>
    );
  }

  const attendance = student.attendance ?? 0;
  const studentAttendance = (attendanceRecords ?? []).filter((a) => a.student_id === student.id);
  const presentDays = studentAttendance.filter((a) => a.status === "Present").length;
  const absentDays = studentAttendance.filter((a) => a.status === "Absent").length;
  const leaveDays = studentAttendance.filter((a) => a.status === "Leave").length;

  const studentFees = sortStudentFees(
    (feeRecords ?? []).filter((f) => f.student_id === student.id),
  );
  const feeStatus = feeStatusOf(studentFees);
  const feeTotal = studentFees.reduce((a, f) => a + f.amount, 0);
  const feePayableTotal = studentFees.reduce((a, f) => a + feePayable(f), 0);
  const feePaidTotal = studentFees.reduce((a, f) => a + (f.paid_amount ?? 0), 0);

  const examsById = new Map((exams ?? []).map((e) => [e.id, e]));
  const studentResults = (resultRecords ?? []).filter((r) => r.student_id === student.id);

  const linkedParents = (allParents ?? []).filter((p) =>
    (JSON.parse(p.linked_student_ids || "[]") as string[]).includes(student.id),
  );
  const siblingIds = new Set(
    linkedParents
      .flatMap((p) => JSON.parse(p.linked_student_ids || "[]") as string[])
      .filter((sid) => sid !== student.id),
  );
  const siblings = (allStudents ?? []).filter((s) => siblingIds.has(s.id));

  async function generateTC() {
    if (!student) return;
    try {
      await api.post("/certificates", { studentId: student.id, type: "TRANSFER" });
      await queryClient.invalidateQueries({ queryKey: [`certificates-${student.id}`] });
      toast.success("Transfer certificate generated");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to generate transfer certificate",
      );
    }
  }

  async function toggleActive() {
    if (!student) return;
    const nextStatus = student.status === "Inactive" ? "Active" : "Inactive";
    try {
      await api.patch(`/students/${student.id}`, { status: nextStatus });
      await invalidateStudent();
      toast.success(nextStatus === "Inactive" ? "Student deactivated" : "Student reactivated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update status");
    }
  }

  return (
    <div>
      <PageHeader title={student.name} breadcrumb={["Dashboard", "Students", student.name]} />

      <div className="panel mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Initials name={student.name} className="h-16 w-16 text-lg" />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold">{student.name}</h2>
              <p className="text-xs text-muted-foreground">
                {student.admission_no ?? "No admission no."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {student.class_name ?? "Unassigned"} {student.section ? `- ${student.section}` : ""}
                {student.roll ? ` · Roll #${student.roll}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusBadge status={student.status ?? "Active"} />
                {!isTeacher && <StatusBadge status={feeStatus} />}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {student.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {student.phone}
                  </span>
                )}
                {student.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {student.email}
                  </span>
                )}
                {student.admitted_on && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Admitted {formatDate(student.admitted_on)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isTeacher && (
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </DialogTrigger>
                <StudentFormDialog
                  initial={student}
                  onDone={async () => {
                    await invalidateStudent();
                    setEditOpen(false);
                  }}
                  onClose={() => setEditOpen(false)}
                />
              </Dialog>
            )}
            {!isTeacher && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={billing} onClick={billFromStructure}>
                    {billing ? "Billing fees…" : "Bill fees from fee structure"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={generateTC}>Generate TC</DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={toggleActive}
                  >
                    {student.status === "Inactive" ? "Reactivate" : "Deactivate"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Phones: every section visible at once as an icon grid. */}
        <div className="grid grid-cols-4 gap-y-1 rounded-2xl border border-border bg-card p-1.5 shadow-sm sm:hidden">
          {visibleTabs.map(({ value, short, icon: Icon }) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-pressed={active}
                className="flex flex-col items-center gap-1 rounded-xl py-1.5 transition-transform active:scale-95"
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={cn(
                    "w-full truncate px-0.5 text-center text-[10px] leading-none",
                    active ? "font-semibold text-primary" : "font-medium text-muted-foreground",
                  )}
                >
                  {short}
                </span>
              </button>
            );
          })}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <TabsList className="w-max">
            {visibleTabs.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <StatTile icon={CalendarClock} tone="info" label="Attendance" value={`${attendance}%`}>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    attendance >= 75
                      ? "bg-success"
                      : attendance >= 50
                        ? "bg-warning"
                        : "bg-destructive",
                  )}
                  style={{ width: `${Math.min(100, attendance)}%` }}
                />
              </div>
            </StatTile>
            {!isTeacher && (
              <StatTile icon={FileText} tone="gold" label="Fee Status" value={feeStatus}>
                <p
                  className={cn(
                    "mt-1 text-[11px] font-medium",
                    feeStatus === "Paid" || feeStatus === "No fees"
                      ? "text-success"
                      : feeStatus === "Overdue"
                        ? "text-destructive"
                        : "text-warning",
                  )}
                >
                  {feeStatus === "Paid"
                    ? "All dues cleared"
                    : feeStatus === "No fees"
                      ? "Nothing billed yet"
                      : feeStatus === "Overdue"
                        ? "Payment overdue"
                        : "Dues outstanding"}
                </p>
              </StatTile>
            )}
            <StatTile
              icon={CalendarDays}
              tone="navy"
              label="Admitted On"
              value={formatDate(student.admitted_on)}
            />
            <StatTile
              icon={Droplet}
              tone="danger"
              label="Blood Group"
              value={student.blood_group || "Not recorded"}
              muted={!student.blood_group}
            />
          </div>
          <SectionCard title="Attendance Summary">
            <ProgressBar
              value={attendance}
              tone="success"
              label={<span>Overall attendance · {attendance}%</span>}
            />
          </SectionCard>
          <SectionCard title="Recent Notices">
            {(notices ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No notices yet.</p>
            ) : (
              <div className="space-y-3">
                {(notices ?? []).slice(0, 3).map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{n.description}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{n.date}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="personal" className="mt-4">
          <SectionCard title="Personal Information">
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Full Name", student.name],
                ["Date of Birth", formatDate(student.dob)],
                ["Blood Group", student.blood_group ?? "—"],
                [
                  "Accommodation",
                  student.is_hosteller
                    ? `Hosteller${student.hostel_room ? ` · ${student.hostel_room}` : ""}`
                    : "Day Scholar",
                ],
                ["Address", student.address ?? "—"],
                ["Admission Date", formatDate(student.admitted_on)],
                ["Admission No.", student.admission_no ?? "—"],
                ["Email", student.email ?? "—"],
                ["Phone", student.phone ?? "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </TabsContent>

        <TabsContent value="parent" className="mt-4 space-y-4">
          <ParentsGuardiansSection studentId={student.id} />
          {siblings.length > 0 && (
            <SectionCard title="Linked Siblings">
              <div className="grid gap-3 sm:grid-cols-2">
                {siblings.map((sib) => (
                  <Link
                    key={sib.id}
                    to={`/students/${sib.id}`}
                    className="panel flex items-center gap-3 p-3 hover:bg-muted"
                  >
                    <Initials name={sib.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{sib.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sib.class_name ?? "—"} {sib.section ? `- ${sib.section}` : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="academic" className="mt-4">
          <SectionCard
            title="Class Subjects & Faculty"
            subtitle={`Curriculum subjects mapped to ${student.class_name ?? "Student Class"}${student.section ? `-${student.section}` : ""}`}
          >
            {(classSubjectMappings ?? []).length === 0 ? (
              <EmptyState title="No subjects assigned to this class yet" />
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {(classSubjectMappings ?? []).map((sub) => (
                  <li key={sub.id} className="rounded-2xl border border-border bg-surface p-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-base font-bold uppercase",
                          subjectTone(sub.subject_name ?? ""),
                        )}
                      >
                        {(sub.subject_name ?? "?").trim().charAt(0) || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-bold capitalize">
                            {sub.subject_name}
                          </p>
                          <StatusBadge status={sub.subject_type ?? "Core"} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          {sub.subject_code && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono font-medium">
                              {sub.subject_code}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" /> {sub.subject_credits ?? 3} hrs /
                            week
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-muted/50 px-2.5 py-2">
                      {sub.teacher_name ? (
                        <Initials
                          name={sub.teacher_name}
                          tone="navy"
                          className="h-7 w-7 text-[10px]"
                        />
                      ) : (
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground">
                          <UserRound className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Teacher
                        </p>
                        <p
                          className={cn(
                            "truncate text-xs font-semibold",
                            !sub.teacher_name && "font-medium text-muted-foreground",
                          )}
                        >
                          {sub.teacher_name ?? "Not assigned yet"}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoCard
              label="Present Days"
              value={presentDays}
              icon={CalendarClock}
              tone="success"
            />
            <InfoCard label="Absent Days" value={absentDays} icon={CalendarClock} tone="danger" />
            <InfoCard label="Leaves" value={leaveDays} icon={CalendarClock} tone="warning" />
          </div>
          <SectionCard title="Attendance Records">
            <ProgressBar
              value={attendance}
              tone="success"
              label={<span>{attendance}% overall attendance</span>}
            />
            {studentAttendance.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No attendance records yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-14">
                {studentAttendance
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((a) => (
                    <div
                      key={a.id}
                      className={`grid h-8 place-items-center rounded-md text-[11px] font-semibold ${attendanceMarkStyle[a.status] ?? "bg-muted text-muted-foreground"}`}
                      title={`${a.date} · ${a.status}`}
                    >
                      {a.status[0]}
                    </div>
                  ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="fees" className="mt-4 space-y-4">
          <SectionCard
            title="Fee Records"
            subtitle={`Total billed · ₹${feeTotal.toLocaleString()}`}
          >
            {studentFees.length === 0 ? (
              <EmptyState
                title="No fee records"
                description="No fees have been billed to this student yet. Bill them from the class fee structure — monthly fees from the admission month, the current term, yearly and one-time fees."
                action={
                  <Button size="sm" disabled={billing} onClick={billFromStructure}>
                    {billing ? "Billing…" : "Bill fees from fee structure"}
                  </Button>
                }
              />
            ) : (
              <>
                <div className="mb-3 grid grid-cols-3 divide-x divide-border rounded-2xl bg-muted/50 py-2.5 text-center">
                  {[
                    { label: "Billed", value: feePayableTotal, tone: "" },
                    { label: "Paid", value: feePaidTotal, tone: "text-success" },
                    {
                      label: "Due",
                      value: Math.max(0, feePayableTotal - feePaidTotal),
                      tone:
                        feePayableTotal - feePaidTotal > 0 ? "text-destructive" : "text-success",
                    },
                  ].map((item) => (
                    <div key={item.label} className="min-w-0 px-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {item.label}
                      </p>
                      <p
                        className={cn(
                          "truncate text-sm font-bold tabular-nums sm:text-base",
                          item.tone,
                        )}
                      >
                        ₹{item.value.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2.5 md:hidden">
                  {studentFees.map((f) => (
                    <FeeCard
                      key={f.id}
                      title={feeTitle(f)}
                      status={f.status}
                      dueDate={formatDate(f.due_date)}
                      total={feePayable(f)}
                      paid={f.paid_amount ?? 0}
                    />
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fee</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead className="text-right">Fine</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Paid On</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentFees.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{feeTitle(f)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            ₹{f.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {f.discount ? `−₹${f.discount.toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {f.fine ? `+₹${f.fine.toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            ₹{(f.paid_amount ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(f.due_date)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(f.paid_on)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={f.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="results" className="mt-4 space-y-4">
          <SectionCard title="Exam Results">
            {studentResults.length === 0 ? (
              <EmptyState
                title="No results yet"
                description="No exam results have been published for this student."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam</TableHead>
                      <TableHead>Marks</TableHead>
                      <TableHead>Percentage</TableHead>
                      <TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentResults.map((r) => {
                      const exam = r.exam_id ? examsById.get(r.exam_id) : undefined;
                      const percentage =
                        r.marks !== null && r.max_marks
                          ? Math.round((r.marks / r.max_marks) * 100)
                          : null;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {exam ? `${exam.subject ?? "—"} · ${exam.term}` : "—"}
                          </TableCell>
                          <TableCell>
                            {r.marks ?? "—"}/{r.max_marks}
                          </TableCell>
                          <TableCell>{percentage !== null ? `${percentage}%` : "—"}</TableCell>
                          <TableCell>{r.grade ? <GradeBadge grade={r.grade} /> : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <SectionCard title="Documents & Certificates">
            {(certificates ?? []).length === 0 ? (
              <EmptyState
                title="No documents yet"
                description="No certificates have been issued for this student."
              />
            ) : (
              <div className="space-y-3">
                {(certificates ?? []).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.type}</span>
                        <span className="block text-xs text-muted-foreground">
                          Issued {d.issued_on}
                          {d.issued_by ? ` · ${d.issued_by}` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status="Issued" />
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
