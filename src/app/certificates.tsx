"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Printer, Plus } from "lucide-react";
import { PageHeader, SearchInput, EmptyState, TableSkeleton, Initials } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCertificates, useStudents } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

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
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return toast.error("Select a student");
    setSubmitting(true);
    try {
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
      <Select value={studentId} onValueChange={setStudentId}>
        <SelectTrigger className="bg-surface">
          <SelectValue placeholder="Select a student" />
        </SelectTrigger>
        <SelectContent>
          {(students ?? []).map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Generate
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
  const [preview, setPreview] = useState<{ studentName: string; type: string; issuedOn: string } | null>(null);

  const studentName = (id: string) => (students ?? []).find((s) => s.id === id)?.name ?? id;

  const rows = certificates ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => !q || studentName(c.student_id).toLowerCase().includes(q));
  }, [rows, search, students]);

  return (
    <div>
      <PageHeader
        title="Certificates & Documents"
        description="Generate and track student certificates."
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
          <SearchInput value={search} onChange={setSearch} placeholder="Search student…" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No certificates issued yet" description="Generate one to see it here." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Issued On</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={studentName(c.student_id)} tone="info" />
                        <span className="truncate font-medium">{studentName(c.student_id)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{TYPES.find((t) => t.value === c.type)?.label ?? c.type}</TableCell>
                    <TableCell className="text-muted-foreground">{c.issued_on}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPreview({
                            studentName: studentName(c.student_id),
                            type: TYPES.find((t) => t.value === c.type)?.label ?? c.type,
                            issuedOn: c.issued_on,
                          })
                        }
                      >
                        <Printer className="h-3.5 w-3.5" /> Print
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg print:max-w-none">
          <DialogHeader>
            <DialogTitle>{preview?.type}</DialogTitle>
          </DialogHeader>
          {preview && (
            <SectionCard>
              <div className="space-y-3 p-2 text-sm">
                <p>This is to certify that <span className="font-semibold">{preview.studentName}</span> is/was a bona fide student of this school.</p>
                <p className="text-muted-foreground">Certificate Type: {preview.type}</p>
                <p className="text-muted-foreground">Issued On: {preview.issuedOn}</p>
                <p className="text-muted-foreground">Issued By: {user?.name}</p>
              </div>
              <Button className="mt-4 w-full" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            </SectionCard>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
