"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, Hourglass, CheckCircle2, Plus } from "lucide-react";
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  EmptyState,
  TableSkeleton,
  Initials,
} from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLeads, type ApiLead } from "@/hooks/useApi";
import { api } from "@/lib/api";

const STATUSES = ["NEW", "CONTACTED", "DEMO_SCHEDULED", "CONVERTED", "LOST"];

function AddLeadForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [schoolName, setSchoolName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/leads", { schoolName, contactName, email, phone, source, notes });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Lead added for ${schoolName}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add lead");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="lead-school">School Name</Label>
        <Input id="lead-school" required value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lead-contact">Contact Name</Label>
        <Input id="lead-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lead-source">Source</Label>
        <Input id="lead-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Website, Referral…" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lead-email">Email</Label>
        <Input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lead-phone">Phone</Label>
        <Input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="lead-notes">Notes</Label>
        <Textarea id="lead-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <DialogFooter className="sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Add Lead
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function LeadsPage() {
  const { data: leads, isLoading } = useLeads();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = leads ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((l) => {
      const matchesQ = !q || l.school_name.toLowerCase().includes(q) || (l.contact_name ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      return matchesQ && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const open_ = rows.filter((l) => l.status !== "CONVERTED" && l.status !== "LOST").length;
  const converted = rows.filter((l) => l.status === "CONVERTED").length;

  async function updateStatus(lead: ApiLead, status: string) {
    try {
      await api.patch(`/leads/${lead.id}`, { status });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`${lead.school_name} marked ${status.replace("_", " ").toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update lead");
    }
  }

  async function convert(lead: ApiLead) {
    try {
      const { schoolId } = await api.post<{ schoolId: string }>(`/leads/${lead.id}/convert`, {});
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
      toast.success(`${lead.school_name} converted to a school`);
      navigate(`/super-admin/schools/${schoolId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to convert lead");
    }
  }

  return (
    <div>
      <PageHeader
        title="Leads & Onboarding"
        description="Track prospective schools from first contact to signup."
        breadcrumb={["Dashboard", "Leads & Onboarding"]}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Lead</DialogTitle>
              </DialogHeader>
              <AddLeadForm onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Leads" value={rows.length} icon={UserPlus} tone="navy" />
        <InfoCard label="In Progress" value={open_} icon={Hourglass} tone="gold" />
        <InfoCard label="Converted" value={converted} icon={CheckCircle2} tone="success" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search school / contact…" />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUSES} placeholder="Status" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No leads found" description="Try adjusting your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={l.school_name} tone="info" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{l.school_name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{l.email ?? "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.contact_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.source ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={l.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {l.status !== "CONVERTED" && l.status !== "LOST" && (
                          <Select value={l.status} onValueChange={(v) => updateStatus(l, v)}>
                            <SelectTrigger className="h-8 w-[150px] bg-surface text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.filter((s) => s !== "CONVERTED").map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s.replace("_", " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {l.status !== "CONVERTED" && l.status !== "LOST" && (
                          <Button size="sm" onClick={() => convert(l)}>
                            Convert
                          </Button>
                        )}
                      </div>
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
