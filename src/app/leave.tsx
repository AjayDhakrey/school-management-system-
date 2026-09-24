"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Clock3, CheckCircle2, XCircle, Plus, Check, X, Eye } from "lucide-react";
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  EmptyState,
  Pager,
  Initials,
  usePaged,
} from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useLeaveRequests, useClassLeave, useStudents, useTeachers, useUsers, type ApiLeaveRequest } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TableSkeleton } from "@/components/shared/ui-kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type LeaveType = "STUDENT" | "TEACHER" | "STAFF";
const TITLES: Record<LeaveType, string> = {
  STUDENT: "Student Leaves",
  TEACHER: "Teacher Leaves",
  STAFF: "Staff Leaves",
};

function TeacherOwnLeaveView() {
  const [tab, setTab] = useState<"my" | "student">("my");

  return (
    <div>
      <PageHeader title="Leave" description="Your own leave requests and leave requests from your class students." breadcrumb={["Dashboard", "Leave"]} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="my">My Leave</TabsTrigger>
          <TabsTrigger value="student">Student Leave</TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="mt-4">
          <TeacherMyLeaveTab />
        </TabsContent>
        <TabsContent value="student" className="mt-4">
          <TeacherStudentLeaveTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TeacherMyLeaveTab() {
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useLeaveRequests("TEACHER");
  const [applyOpen, setApplyOpen] = useState(false);
  const [leaveType, setLeaveType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rows = requests ?? [];
  const pending = rows.filter((r) => r.status === "Pending").length;
  const approved = rows.filter((r) => r.status === "Approved").length;
  const rejected = rows.filter((r) => r.status === "Rejected").length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/leave", { fromDate, toDate, reason: leaveType ? `${leaveType}: ${reason}` : reason });
      await queryClient.invalidateQueries({ queryKey: ["leave-TEACHER"] });
      toast.success("Leave request submitted");
      setApplyOpen(false);
      setLeaveType("");
      setFromDate("");
      setToDate("");
      setReason("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" className="h-9" onClick={() => setApplyOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Apply for Leave
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Requests" value={rows.length} icon={ClipboardList} tone="navy" />
        <InfoCard label="Pending" value={pending} icon={Clock3} tone="warning" />
        <InfoCard label="Approved" value={approved} icon={CheckCircle2} tone="success" />
        <InfoCard label="Rejected" value={rejected} icon={XCircle} tone="danger" />
      </div>

      <SectionCard className="mt-4" title="Leave History" subtitle="All your leave requests">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No leave requests yet" icon={ClipboardList} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2">From</th>
                  <th className="px-2 py-2">To</th>
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="px-2 py-2 text-muted-foreground">{r.from_date ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.to_date ?? "—"}</td>
                    <td className="max-w-[240px] truncate px-2 py-2 text-muted-foreground">{r.reason ?? "—"}</td>
                    <td className="px-2 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
            <DialogDescription>Submit a new leave request for approval.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Leave Type</Label>
                <Input required placeholder="Sick Leave" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>From</Label>
                <Input required type="date" min={new Date().toISOString().slice(0, 10)} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>To</Label>
                <Input required type="date" min={fromDate || new Date().toISOString().slice(0, 10)} value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea required placeholder="Reason for leave" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeacherStudentLeaveTab() {
  const queryClient = useQueryClient();
  const { data: leave, isLoading } = useClassLeave();
  const { data: students } = useStudents();
  const [actingId, setActingId] = useState<string | null>(null);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students ?? []) map.set(s.id, s.name);
    return map;
  }, [students]);

  const rows = leave ?? [];
  const pending = rows.filter((r) => r.status === "Pending").length;

  async function decide(id: string, status: "Approved" | "Rejected") {
    setActingId(id);
    try {
      await api.patch(`/leave/${id}`, { status });
      await queryClient.invalidateQueries({ queryKey: ["leave-class-students"] });
      toast.success(`Leave request ${status.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update leave request");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">
        Only students in the class(es) where you are the Class Teacher — approving/rejecting is limited to your own class.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Total Requests" value={rows.length} icon={ClipboardList} tone="navy" />
        <InfoCard label="Pending" value={pending} icon={Clock3} tone="warning" />
      </div>

      <div className="panel">
        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No class leave requests"
            description="You'll see leave requests here once you're assigned as a Class Teacher and a student in your class applies."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{studentNameById.get(r.requester_id) ?? "Unknown student"}</TableCell>
                    <TableCell>{r.from_date ?? "—"}</TableCell>
                    <TableCell>{r.to_date ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{r.reason ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {r.status === "Pending" ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-success"
                            disabled={actingId === r.id}
                            onClick={() => decide(r.id, "Approved")}
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-destructive"
                            disabled={actingId === r.id}
                            onClick={() => decide(r.id, "Rejected")}
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <StatusBadge status={r.status} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Splits "Sick Leave: fever" (the convention every apply-leave form uses) into type + free-text reason. */
function splitReason(reason: string | null): { type: string; text: string } {
  if (!reason) return { type: "—", text: "—" };
  const idx = reason.indexOf(":");
  if (idx === -1) return { type: "—", text: reason };
  return { type: reason.slice(0, idx).trim(), text: reason.slice(idx + 1).trim() };
}

export default function Page({ type: leaveType }: { type: LeaveType }) {
  const { user } = useAuth();
  if (user?.role === "TEACHER" && leaveType === "TEACHER") return <TeacherOwnLeaveView />;

  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useLeaveRequests(leaveType);
  const { data: students } = useStudents(leaveType === "STUDENT");
  const { data: teachers } = useTeachers(leaveType === "TEACHER");
  const { data: users } = useUsers(leaveType === "STAFF");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiLeaveRequest | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const nameFor = (requesterId: string) => {
    if (leaveType === "STUDENT") return students?.find((s) => s.id === requesterId)?.name ?? "Unknown student";
    if (leaveType === "TEACHER") return teachers?.find((t) => t.id === requesterId)?.name ?? "Unknown teacher";
    return users?.find((u) => u.id === requesterId)?.name ?? "Unknown staff member";
  };

  const role = leaveType === "STUDENT" ? "Student" : leaveType === "TEACHER" ? "Teacher" : "Staff";
  const rows = requests ?? [];

  const filtered = useMemo(() => {
    return rows.filter((l) => {
      const matchesSearch = !search || nameFor(l.requester_id).toLowerCase().includes(search.toLowerCase());
      const matchesStatus = status === "all" || l.status === status;
      return matchesSearch && matchesStatus;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, status, students, teachers, users]);

  const { rows: paged, pageCount } = usePaged(filtered, page, 8);

  const total = rows.length;
  const pending = rows.filter((l) => l.status === "Pending").length;
  const approved = rows.filter((l) => l.status === "Approved").length;
  const rejected = rows.filter((l) => l.status === "Rejected").length;
  const history = rows.filter((l) => l.status !== "Pending").slice(0, 6);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: [`leave-${leaveType}`] });
  }

  async function updateStatus(id: string, s: "Approved" | "Rejected") {
    setActingId(id);
    try {
      await api.patch(`/leave/${id}`, { status: s });
      await invalidate();
      toast.success(`Leave request ${s.toLowerCase()}`);
      setSelected((prev) => (prev && prev.id === id ? { ...prev, status: s } : prev));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update leave request");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={TITLES[leaveType]}
        description={`Review and process leave requests from ${role.toLowerCase()}s only.`}
        breadcrumb={["Dashboard", "Leave Management", TITLES[leaveType]]}
        actions={
          leaveType === "STUDENT" ? (
            <Button size="sm" className="h-9" onClick={() => setApplyOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Apply for Leave
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Requests" value={total} icon={ClipboardList} tone="navy" />
        <InfoCard label="Pending" value={pending} icon={Clock3} tone="warning" />
        <InfoCard label="Approved" value={approved} icon={CheckCircle2} tone="success" />
        <InfoCard label="Rejected" value={rejected} icon={XCircle} tone="danger" />
      </div>

      <SectionCard className="mt-4" title={TITLES[leaveType]} subtitle="All submitted leave applications">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search person…" />
          <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={["Pending", "Approved", "Rejected"]} placeholder="Status" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : paged.length === 0 ? (
          <EmptyState title="No leave requests found" icon={ClipboardList} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2">Person</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">From</th>
                  <th className="px-2 py-2">To</th>
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((l) => {
                  const { type, text } = splitReason(l.reason);
                  const name = nameFor(l.requester_id);
                  return (
                    <tr key={l.id} className="border-b border-border/60">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Initials name={name} />
                          <span className="font-medium">{name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">{type}</td>
                      <td className="px-2 py-2 text-muted-foreground">{l.from_date ?? "—"}</td>
                      <td className="px-2 py-2 text-muted-foreground">{l.to_date ?? "—"}</td>
                      <td className="max-w-[160px] truncate px-2 py-2 text-muted-foreground">{text}</td>
                      <td className="px-2 py-2"><StatusBadge status={l.status} /></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setSelected(l)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {l.status === "Pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 text-success"
                                disabled={actingId === l.id}
                                onClick={() => updateStatus(l.id, "Approved")}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive"
                                disabled={actingId === l.id}
                                onClick={() => updateStatus(l.id, "Rejected")}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
      </SectionCard>

      <SectionCard className="mt-4" title="Leave History" subtitle="Processed leave requests">
        {history.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No processed requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2">Person</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Dates</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((l) => {
                  const { type } = splitReason(l.reason);
                  return (
                    <tr key={l.id} className="border-b border-border/60">
                      <td className="px-2 py-2 font-medium">{nameFor(l.requester_id)}</td>
                      <td className="px-2 py-2">{type}</td>
                      <td className="px-2 py-2 text-muted-foreground">{l.from_date} – {l.to_date}</td>
                      <td className="px-2 py-2"><StatusBadge status={l.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <Initials name={nameFor(selected.requester_id)} />
                  <div>
                    <SheetTitle>{nameFor(selected.requester_id)}</SheetTitle>
                    <SheetDescription>{role} · {splitReason(selected.reason).type}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">From</p><p>{selected.from_date ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">To</p><p>{selected.to_date ?? "—"}</p></div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p className="mt-1 text-sm">{splitReason(selected.reason).text}</p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Status</p>
                  <StatusBadge status={selected.status} />
                </div>
              </div>
              {selected.status === "Pending" && (
                <SheetFooter>
                  <Button variant="outline" className="flex-1" disabled={actingId === selected.id} onClick={() => updateStatus(selected.id, "Rejected")}>
                    Reject
                  </Button>
                  <Button className="flex-1" disabled={actingId === selected.id} onClick={() => updateStatus(selected.id, "Approved")}>
                    Approve
                  </Button>
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {leaveType === "STUDENT" && (
        <ApplyForStudentDialog open={applyOpen} onClose={() => setApplyOpen(false)} onDone={invalidate} />
      )}
    </div>
  );
}

function ApplyForStudentDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { data: students } = useStudents(open);
  const [studentId, setStudentId] = useState("");
  const [leaveType, setLeaveType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) {
      toast.error("Select a student");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/leave", {
        requesterType: "STUDENT",
        studentId,
        fromDate,
        toDate,
        reason: leaveType ? `${leaveType}: ${reason}` : reason,
      });
      toast.success("Leave request submitted");
      await onDone();
      onClose();
      setStudentId("");
      setLeaveType("");
      setFromDate("");
      setToDate("");
      setReason("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply for Leave</DialogTitle>
          <DialogDescription>Submit a leave request on behalf of a student.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label>Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger className="bg-surface">
                <SelectValue placeholder="Select student" />
              </SelectTrigger>
              <SelectContent>
                {(students ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.class_name ? `— ${s.class_name}${s.section ? `-${s.section}` : ""}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Leave Type</Label><Input required placeholder="Sick Leave" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} /></div>
            <div className="space-y-1"><Label>From</Label><Input required type="date" min={new Date().toISOString().slice(0, 10)} value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>To</Label><Input required type="date" min={fromDate || new Date().toISOString().slice(0, 10)} value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Reason</Label><Textarea required placeholder="Reason for leave" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>Submit Request</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
