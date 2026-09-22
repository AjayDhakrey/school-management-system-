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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { noticeAudienceLabel, useHasPermission, useNotices, type ApiNotice } from "@/hooks/useApi";
import { ClassNoticeForm } from "@/components/shared/ClassNoticeForm";
import { NoticeDetailDialog } from "@/components/shared/NoticeDetailDialog";
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
  const isTeacher = user?.role === "TEACHER";
  const { data: teacherCanPost } = useHasPermission("notices.post_to_class", isTeacher);
  // Students and staff only read; teachers post to their own classes unless switched off.
  const canPublish = isTeacher
    ? Boolean(teacherCanPost)
    : user?.role !== "STUDENT" && user?.role !== "STAFF";
  const { data: notices, isLoading } = useNotices();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApiNotice | null>(null);

  const rows = useMemo(() => (notices ?? []).filter((n) => n.category === CATEGORY), [notices]);

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="School-level announcements for teachers, parents and students."
        breadcrumb={["Dashboard", "Announcements"]}
        actions={
          canPublish ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4" /> New Announcement
                </Button>
              </DialogTrigger>
              <DialogContent className={isTeacher ? "max-w-lg" : "max-w-md"}>
                <DialogHeader>
                  <DialogTitle>New Announcement</DialogTitle>
                  {isTeacher && (
                    <DialogDescription>
                      Sent to the students and parents of the classes you choose.
                    </DialogDescription>
                  )}
                </DialogHeader>
                {isTeacher ? (
                  <ClassNoticeForm category={CATEGORY} onDone={() => setOpen(false)} />
                ) : (
                  <NewAnnouncementForm onDone={() => setOpen(false)} />
                )}
              </DialogContent>
            </Dialog>
          ) : undefined
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
                      <button type="button" className="text-left" onClick={() => setSelected(n)}>
                        <p className="font-medium">{n.title}</p>
                        {n.description && (
                          <>
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {n.description}
                            </p>
                            <p className="mt-0.5 text-xs font-medium text-primary">Read more</p>
                          </>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={noticeAudienceLabel(n)} tone="info" />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {n.date}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <NoticeDetailDialog notice={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
