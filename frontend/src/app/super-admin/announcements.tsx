"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2 } from "lucide-react";
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
import { useAnnouncements } from "@/hooks/useApi";
import { api } from "@/lib/api";

function NewAnnouncementForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("ALL");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/announcements", { title, body, audience });
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
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
        <Label htmlFor="ann-title">Title</Label>
        <Input id="ann-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ann-body">Body</Label>
        <Textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Audience</Label>
        <Select value={audience} onValueChange={setAudience}>
          <SelectTrigger className="bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["ALL", "TRIAL", "ACTIVE"].map((a) => (
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
  const { data: announcements, isLoading } = useAnnouncements();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const rows = announcements ?? [];

  async function remove(id: string) {
    try {
      await api.delete(`/announcements/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove announcement");
    }
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Broadcast platform-wide updates to schools."
        breadcrumb={["Dashboard", "Announcements"]}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                New Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New Announcement</DialogTitle>
              </DialogHeader>
              <NewAnnouncementForm onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <InfoCard label="Published" value={rows.length} icon={Megaphone} tone="navy" />
      </div>

      <div className="panel">
        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState title="No announcements yet" description="Publish one to notify every school." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <p className="font-medium">{a.title}</p>
                      {a.body && <p className="line-clamp-1 text-xs text-muted-foreground">{a.body}</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.audience} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.created_at}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => remove(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
