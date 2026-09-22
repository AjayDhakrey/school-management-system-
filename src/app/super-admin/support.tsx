"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Hourglass, CheckCircle2, Plus } from "lucide-react";
import { PageHeader, SearchInput, FilterSelect, EmptyState, TableSkeleton, Initials } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSupportTickets, useSchools, type ApiSupportTicket } from "@/hooks/useApi";
import { api } from "@/lib/api";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

function NewTicketForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: schools } = useSchools();
  const [schoolId, setSchoolId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/support", { schoolId: schoolId || null, subject, message, priority });
      await queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      toast.success("Ticket created");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label>School</Label>
        <Select value={schoolId} onValueChange={setSchoolId}>
          <SelectTrigger className="bg-surface">
            <SelectValue placeholder="Select a school (optional)" />
          </SelectTrigger>
          <SelectContent>
            {(schools ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ticket-subject">Subject</Label>
        <Input id="ticket-subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ticket-message">Message</Label>
        <Textarea id="ticket-message" value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          Create Ticket
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function SupportPage() {
  const { data: tickets, isLoading } = useSupportTickets();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = tickets ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((t) => {
      const matchesQ = !q || t.subject.toLowerCase().includes(q) || (t.school_name ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      return matchesQ && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const openCount = rows.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length;
  const resolved = rows.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;

  async function updateStatus(ticket: ApiSupportTicket, status: string) {
    try {
      await api.patch(`/support/${ticket.id}`, { status });
      await queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      toast.success(`Ticket marked ${status.replace("_", " ").toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update ticket");
    }
  }

  return (
    <div>
      <PageHeader
        title="Support Center"
        description="Support tickets raised by schools."
        breadcrumb={["Dashboard", "Support Center"]}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                New Ticket
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New Ticket</DialogTitle>
              </DialogHeader>
              <NewTicketForm onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InfoCard label="Total Tickets" value={rows.length} icon={LifeBuoy} tone="navy" />
        <InfoCard label="Open" value={openCount} icon={Hourglass} tone="gold" />
        <InfoCard label="Resolved" value={resolved} icon={CheckCircle2} tone="success" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search subject / school…" />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUSES} placeholder="Status" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No tickets found" description="Try adjusting your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={t.subject} tone="info" />
                        <span className="truncate font-medium">{t.subject}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.school_name ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={t.priority} />
                    </TableCell>
                    <TableCell>
                      <Select value={t.status} onValueChange={(v) => updateStatus(t, v)}>
                        <SelectTrigger className="h-8 w-[150px] bg-surface text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
