import { Link, useParams } from "react-router-dom";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
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
import { StudentFormDialog } from "@/pages/StudentsPage";

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
        <Input id="g-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
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

  const linked = (allParents ?? []).filter((p) => (JSON.parse(p.linked_student_ids || "[]") as string[]).includes(studentId));
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
        <EmptyState title="No guardians linked" description="Add a new guardian or link an existing parent account." />
      ) : (
        <div className="space-y-3">
          {linked.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Initials name={p.name} tone="gold" />
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.email ?? "—"} · {p.phone ?? "—"}</p>
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
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <select
            className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
            value={existingToLink}
            onChange={(e) => setExistingToLink(e.target.value)}
          >
            <option value="">Link an existing guardian…</option>
            {unlinked.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.email ?? "no email"})
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={linkExisting} disabled={!existingToLink}>
            Link
          </Button>
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
  const [editOpen, setEditOpen] = useState(false);

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
        <EmptyState title="Student not found" description="This student record doesn't exist or you don't have access to it." />
      </div>
    );
  }

  const attendance = student.attendance ?? 0;
  const studentAttendance = (attendanceRecords ?? []).filter((a) => a.student_id === student.id);
  const presentDays = studentAttendance.filter((a) => a.status === "Present").length;
  const absentDays = studentAttendance.filter((a) => a.status === "Absent").length;
  const leaveDays = studentAttendance.filter((a) => a.status === "Leave").length;

  const studentFees = (feeRecords ?? []).filter((f) => f.student_id === student.id);
  const feeTotal = studentFees.reduce((a, f) => a + f.amount, 0);

  const examsById = new Map((exams ?? []).map((e) => [e.id, e]));
  const studentResults = (resultRecords ?? []).filter((r) => r.student_id === student.id);

  const linkedParents = (allParents ?? []).filter((p) => (JSON.parse(p.linked_student_ids || "[]") as string[]).includes(student.id));
  const siblingIds = new Set(
    linkedParents.flatMap((p) => JSON.parse(p.linked_student_ids || "[]") as string[]).filter((sid) => sid !== student.id),
  );
  const siblings = (allStudents ?? []).filter((s) => siblingIds.has(s.id));

  async function generateTC() {
    if (!student) return;
    try {
      await api.post("/certificates", { studentId: student.id, type: "TRANSFER" });
      await queryClient.invalidateQueries({ queryKey: [`certificates-${student.id}`] });
      toast.success("Transfer certificate generated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to generate transfer certificate");
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
              <p className="text-xs text-muted-foreground">{student.admission_no ?? "No admission no."}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {student.class_name ?? "Unassigned"} {student.section ? `- ${student.section}` : ""}
                {student.roll ? ` · Roll #${student.roll}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusBadge status={student.status ?? "Active"} />
                <StatusBadge status={student.fee_status ?? "Pending"} />
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
                    Admitted {student.admitted_on}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={generateTC}>Generate TC</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={toggleActive}>
                  {student.status === "Inactive" ? "Reactivate" : "Deactivate"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="personal">Personal Info</TabsTrigger>
            <TabsTrigger value="parent">Parents / Guardians</TabsTrigger>
            <TabsTrigger value="academic">Academic</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="fees">Fees</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoCard label="Attendance" value={`${attendance}%`} icon={CalendarClock} tone="info" />
            <InfoCard label="Fee Status" value={student.fee_status ?? "Pending"} icon={FileText} tone="gold" />
            <InfoCard label="Admission Date" value={student.admitted_on ?? "—"} icon={CalendarDays} tone="navy" />
            <InfoCard label="Blood Group" value={student.blood_group ?? "—"} icon={Droplet} tone="danger" />
          </div>
          <SectionCard title="Attendance Summary">
            <ProgressBar value={attendance} tone="success" label={<span>Overall attendance · {attendance}%</span>} />
          </SectionCard>
          <SectionCard title="Recent Notices">
            {(notices ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No notices yet.</p>
            ) : (
              <div className="space-y-3">
                {(notices ?? []).slice(0, 3).map((n) => (
                  <div key={n.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
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
                ["Date of Birth", student.dob ?? "—"],
                ["Blood Group", student.blood_group ?? "—"],
                ["Address", student.address ?? "—"],
                ["Admission Date", student.admitted_on ?? "—"],
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
                  <Link key={sib.id} to={`/students/${sib.id}`} className="panel flex items-center gap-3 p-3 hover:bg-muted">
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Instructor</TableHead>
                      <TableHead className="text-center">Credits / Wk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(classSubjectMappings ?? []).map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-semibold text-foreground">{sub.subject_name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{sub.subject_code ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={sub.subject_type ?? "Core"} />
                        </TableCell>
                        <TableCell>
                          {sub.teacher_name ? (
                            <span className="font-medium text-xs">{sub.teacher_name}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono font-medium">{sub.subject_credits ?? 3} hrs</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoCard label="Present Days" value={presentDays} icon={CalendarClock} tone="success" />
            <InfoCard label="Absent Days" value={absentDays} icon={CalendarClock} tone="danger" />
            <InfoCard label="Leaves" value={leaveDays} icon={CalendarClock} tone="warning" />
          </div>
          <SectionCard title="Attendance Records">
            <ProgressBar value={attendance} tone="success" label={<span>{attendance}% overall attendance</span>} />
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
          <SectionCard title="Fee Records" subtitle={`Total billed · ₹${feeTotal.toLocaleString()}`}>
            {studentFees.length === 0 ? (
              <EmptyState title="No fee records" description="No fees have been billed to this student yet." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fee Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Fine</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Paid On</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentFees.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.fee_type}</TableCell>
                        <TableCell>₹{f.amount.toLocaleString()}</TableCell>
                        <TableCell>₹{f.discount.toLocaleString()}</TableCell>
                        <TableCell>₹{f.fine.toLocaleString()}</TableCell>
                        <TableCell>{f.due_date ?? "—"}</TableCell>
                        <TableCell>{f.paid_on ?? "—"}</TableCell>
                        <TableCell><StatusBadge status={f.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="results" className="mt-4 space-y-4">
          <SectionCard title="Exam Results">
            {studentResults.length === 0 ? (
              <EmptyState title="No results yet" description="No exam results have been published for this student." />
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
                      const percentage = r.marks !== null && r.max_marks ? Math.round((r.marks / r.max_marks) * 100) : null;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {exam ? `${exam.subject ?? "—"} · ${exam.term}` : "—"}
                          </TableCell>
                          <TableCell>{r.marks ?? "—"}/{r.max_marks}</TableCell>
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
              <EmptyState title="No documents yet" description="No certificates have been issued for this student." />
            ) : (
              <div className="space-y-3">
                {(certificates ?? []).map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.type}</span>
                        <span className="block text-xs text-muted-foreground">Issued {d.issued_on}{d.issued_by ? ` · ${d.issued_by}` : ""}</span>
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
