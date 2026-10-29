"use client";

import { useMemo, useState } from "react";
import { cn, withClassPrefix } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Printer, Plus } from "lucide-react";
import {
  PageHeader,
  SearchInput,
  EmptyState,
  TableSkeleton,
  Initials,
} from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useCertificates, useStudents } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useSchoolBranding } from "@/hooks/use-school-branding";
import { CertificateDocument } from "@/components/shared/CertificateDocument";

const TYPES = [
  { value: "BONAFIDE", label: "Bonafide Certificate" },
  { value: "TRANSFER", label: "Transfer Certificate" },
  { value: "CHARACTER", label: "Character Certificate" },
];

function GenerateForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: students } = useStudents();
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState("BONAFIDE");
  const [rollInput, setRollInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedStudent = useMemo(
    () => (students ?? []).find((s) => s.id === studentId),
    [students, studentId],
  );

  function handleSelectStudent(id: string) {
    setStudentId(id);
    const found = (students ?? []).find((s) => s.id === id);
    if (found && found.roll != null && found.roll !== 0) {
      setRollInput(String(found.roll));
    } else {
      setRollInput("");
    }
  }

  // Sort students by class and roll/name so they are grouped predictably
  const sortedStudents = useMemo(() => {
    return [...(students ?? [])].sort((a, b) => {
      const clsA = a.class_name || "";
      const clsB = b.class_name || "";
      const cComp = clsA.localeCompare(clsB, undefined, { numeric: true });
      if (cComp !== 0) return cComp;
      const rollA = a.roll ?? 999999;
      const rollB = b.roll ?? 999999;
      if (rollA !== rollB) return rollA - rollB;
      return a.name.localeCompare(b.name);
    });
  }, [students]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) {
      toast.error("Select a student");
      return;
    }
    setSubmitting(true);
    try {
      // If a roll number was provided/updated and differs from profile, update the student record
      const trimmedRoll = rollInput.trim();
      if (trimmedRoll && (!selectedStudent?.roll || String(selectedStudent.roll) !== trimmedRoll)) {
        const rollNum = Number(trimmedRoll);
        if (!Number.isNaN(rollNum)) {
          try {
            await api.patch(`/students/${studentId}`, { roll: rollNum });
            await queryClient.invalidateQueries({ queryKey: ["students"] });
          } catch {
            // Ignore non-fatal student update failure
          }
        }
      }

      await api.post("/certificates", { studentId, type });
      await queryClient.invalidateQueries({ queryKey: ["certificates-all"] });
      toast.success("Certificate generated");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate certificate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {/* Student selection with Name, Roll Number, and Class */}
      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold">Select Student *</Label>
        <Select value={studentId} onValueChange={handleSelectStudent}>
          <SelectTrigger className="bg-surface h-10">
            <SelectValue placeholder="Select a student (shows Roll & Class)" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {sortedStudents.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <div className="flex items-center justify-between gap-4 py-0.5 text-left">
                  <span className="font-semibold text-slate-900">{s.name}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    Roll: {s.roll != null && s.roll !== 0 ? s.roll : "—"} · Class:{" "}
                    {s.class_name ? `${s.class_name}${s.section ? `-${s.section}` : ""}` : "—"}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selected Student Details Card to clearly distinguish identical names */}
      {selectedStudent && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs space-y-1.5 text-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Selected Student:</span>
            <span className="font-bold text-slate-900">{selectedStudent.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Class & Section:</span>
            <span>
              {selectedStudent.class_name
                ? `${selectedStudent.class_name}${selectedStudent.section ? ` – Section ${selectedStudent.section}` : ""}`
                : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Admission No.:</span>
            <span className="font-mono font-medium">{selectedStudent.admission_no || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">System Roll No.:</span>
            <span className="font-mono font-bold text-indigo-900">
              {selectedStudent.roll != null && selectedStudent.roll !== 0
                ? selectedStudent.roll
                : "Not set"}
            </span>
          </div>
        </div>
      )}

      {/* Roll Number option */}
      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold">Roll Number *</Label>
        <Input
          type="text"
          placeholder="e.g. 15"
          value={rollInput}
          onChange={(e) => setRollInput(e.target.value)}
          className="bg-surface font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          Confirm or enter the roll number to display on the printed certificate.
        </p>
      </div>

      {/* Certificate Type */}
      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold">Certificate Type *</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Generating…" : "Generate Certificate"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function CertificatesPage() {
  const { user } = useAuth();
  const isStudent = user?.role === "STUDENT";
  const { data: certificates, isLoading } = useCertificates();
  const { data: students } = useStudents();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const school = useSchoolBranding();
  const [preview, setPreview] = useState<{
    id: string;
    studentId: string;
    studentName: string;
    studentRoll: number | null | undefined;
    typeCode: string;
    type: string;
    issuedOn: string;
  } | null>(null);

  const studentMap = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students]);
  const studentName = (id: string) => studentMap.get(id)?.name ?? id;

  const rows = certificates ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (!q) return true;
      const st = studentMap.get(c.student_id);
      const name = (st?.name ?? studentName(c.student_id)).toLowerCase();
      const roll = st?.roll != null ? String(st.roll).toLowerCase() : "";
      const adm = (st?.admission_no ?? "").toLowerCase();
      const cls = (st?.class_name ?? "").toLowerCase();
      const certLabel = (TYPES.find((t) => t.value === c.type)?.label ?? c.type).toLowerCase();
      return (
        name.includes(q) ||
        roll.includes(q) ||
        adm.includes(q) ||
        cls.includes(q) ||
        certLabel.includes(q)
      );
    });
  }, [rows, search, studentMap]);

  return (
    <div>
      <PageHeader
        title="Certificates & Documents"
        description="Generate, track, and print student certificates with name and roll number."
        breadcrumb={["Dashboard", "Certificates & Documents"]}
        actions={
          isStudent ? undefined : (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4" /> Generate Certificate
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Generate Certificate</DialogTitle>
                </DialogHeader>
                <GenerateForm onDone={() => setOpen(false)} />
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <InfoCard label="Total Issued" value={rows.length} icon={FileText} tone="navy" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by student name, roll number, or class…"
          />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No certificates issued yet"
            description="Generate one to see it here."
          />
        ) : (
          <>
            {/* Phones: one row per certificate. */}
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((c) => {
                const st = studentMap.get(c.student_id);
                const label = TYPES.find((t) => t.value === c.type)?.label ?? c.type;
                const openPreview = () =>
                  setPreview({
                    id: c.id,
                    studentId: c.student_id,
                    typeCode: c.type,
                    studentName: st?.name ?? studentName(c.student_id),
                    studentRoll: st?.roll,
                    type: label,
                    issuedOn: c.issued_on,
                  });
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={openPreview}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-muted/50"
                    >
                      <Initials name={st?.name ?? studentName(c.student_id)} tone="info" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold capitalize">
                            {(st?.name ?? studentName(c.student_id)).toLowerCase()}
                          </p>
                          <span className="rounded bg-primary/10 px-1.5 py-0.2 font-mono text-[10px] font-bold text-primary">
                            Roll: {st?.roll != null && st.roll !== 0 ? st.roll : "—"}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {label} ·{" "}
                          {st?.class_name
                            ? `${withClassPrefix(st.class_name)}${st.section ? `-${st.section}` : ""} · `
                            : ""}
                          {new Date(`${c.issued_on}T00:00:00Z`).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </p>
                      </div>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground">
                        <Printer className="h-4 w-4" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Desktop Table with Student, Roll No., Class, Type, Issued On, Actions */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Student</th>
                    <th className="px-3 py-2.5">Roll No.</th>
                    <th className="px-3 py-2.5">Class</th>
                    <th className="px-3 py-2.5">Certificate</th>
                    <th className="px-3 py-2.5">Issued On</th>
                    <th className="px-4 py-2.5 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const st = studentMap.get(c.student_id);
                    const label = TYPES.find((t) => t.value === c.type)?.label ?? c.type;
                    const name = st?.name ?? studentName(c.student_id);
                    const cls = st?.class_name
                      ? `${st.class_name.replace(/^class\s*/i, "")}${st.section ? `-${st.section}` : ""}`
                      : null;
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex min-w-0 items-center gap-3">
                            <Initials name={name} tone="info" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold capitalize">
                                {name.toLowerCase()}
                              </p>
                              {st?.admission_no && (
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {st.admission_no}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {st?.roll != null && st.roll !== 0 ? (
                            st.roll
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {cls ? (
                            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                              Class {cls}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                c.type === "TRANSFER"
                                  ? "bg-warning"
                                  : c.type === "CHARACTER"
                                    ? "bg-success"
                                    : "bg-primary",
                              )}
                            />
                            {label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {new Date(`${c.issued_on}T00:00:00Z`).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() =>
                              setPreview({
                                id: c.id,
                                studentId: c.student_id,
                                studentName: name,
                                studentRoll: st?.roll,
                                typeCode: c.type,
                                type: label,
                                issuedOn: c.issued_on,
                              })
                            }
                          >
                            <Printer className="h-3.5 w-3.5" /> Print
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Full Certificate Preview and Print Dialog */}
      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="certificate-print-dialog max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 print:max-w-none print:max-h-none print:overflow-visible print:p-0">
          <DialogHeader className="print-hide print:hidden">
            <DialogTitle>{preview?.type}</DialogTitle>
          </DialogHeader>
          {preview && (
            <CertificateDocument
              serial={`CERT-${preview.id.slice(0, 8).toUpperCase()}`}
              type={preview.typeCode}
              typeLabel={preview.type}
              student={
                studentMap.get(preview.studentId) ?? {
                  name: preview.studentName,
                  roll: preview.studentRoll,
                }
              }
              issuedOn={preview.issuedOn}
              issuedBy={user?.name ?? null}
              school={school}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
