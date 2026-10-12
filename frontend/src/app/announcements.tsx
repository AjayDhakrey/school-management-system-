"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, ChevronRight, Megaphone, Plus, Users } from "lucide-react";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      await api.post("/notices", {
        title,
        description,
        category: CATEGORY,
        priority: "Medium",
        audience,
      });
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
        <Textarea
          id="an-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
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

/** "2026-09-19" → "Today", "Yesterday", "3 days ago" or "19 Sep 2026". */
function friendlyDate(value: string | null | undefined) {
  if (!value) return { label: "—", isNew: false };
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return { label: value, isNew: false };
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  const isNew = days >= 0 && days <= 3;
  if (days === 0) return { label: "Today", isNew };
  if (days === 1) return { label: "Yesterday", isNew };
  if (days > 1 && days < 7) return { label: `${days} days ago`, isNew };
  return {
    label: date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
    isNew,
  };
}

/** One announcement in the feed — tap anywhere on it to read the full message. */
function AnnouncementCard({ notice: n, onOpen }: { notice: ApiNotice; onOpen: () => void }) {
  const { label, isNew } = friendlyDate(n.date);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex w-full items-start gap-3">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Megaphone className="h-5 w-5" />
          {isNew && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-destructive" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="line-clamp-1 text-[15px] font-bold capitalize leading-tight">
              {n.title}
            </h4>
            {isNew && (
              <span className="shrink-0 rounded-full bg-destructive-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
                New
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> {label}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {noticeAudienceLabel(n)}
            </span>
          </div>
        </div>
      </div>

      {n.description && (
        <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-foreground/75">
          {n.description}
        </p>
      )}

      <span className="mt-auto flex w-full items-center justify-between pt-3 text-xs font-semibold text-primary">
        Read more
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 transition-transform group-hover:translate-x-0.5">
          <ChevronRight className="h-4 w-4" />
        </span>
      </span>
    </button>
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

      <div className="panel overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No announcements yet"
            description="Publish one to notify the school."
          />
        ) : (
          <ul className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
            {rows.map((n) => (
              <li key={n.id}>
                <AnnouncementCard notice={n} onOpen={() => setSelected(n)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <NoticeDetailDialog notice={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
