"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Plus } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNotices } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const AUDIENCES = ["All", "Teachers", "Parents", "Students"];
const CATEGORY = "Announcement";

function NewAnnouncementForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("All");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/notices", { title, description, category: CATEGORY, priority: "Medium", audience });
      await queryClient.invalidateQueries({ queryKey: ["notices"] });
      toast.success("Announcement published");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish announcement");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="an-title">Title</Label>
        <Input id="an-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="an-desc">Message</Label>
        <Textarea id="an-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Audience</Label>
        <Select value={audience} onValueChange={setAudience}>
          <SelectTrigger className="bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUDIENCES.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
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
          Publish
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const isStudent = user?.role === "STUDENT";
  const { data: notices, isLoading } = useNotices();
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => (notices ?? []).filter((n) => n.category === CATEGORY), [notices]);

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="School-level announcements for teachers, parents and students."
        breadcrumb={["Dashboard", "Announcements"]}
        actions={
          isStudent ? undefined : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" /> New Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New Announcement</DialogTitle>
              </DialogHeader>
              <NewAnnouncementForm onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <InfoCard label="Published" value={rows.length} icon={Bell} tone="navy" />
      </div>

      <div className="panel">
        {isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : rows.length === 0 ? (
          <EmptyState title="No announcements yet" description="Publish one to notify the school." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <p className="font-medium">{n.title}</p>
                      {n.description && <p className="line-clamp-1 text-xs text-muted-foreground">{n.description}</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={n.audience ?? "All"} tone="info" />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{n.date}</TableCell>
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
