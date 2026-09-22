"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  AlertTriangle,
  MailOpen,
  CalendarCheck2,
  Plus,
  Paperclip,
  Share2,
  CheckCheck,
  Pin,
  Trash2,
} from "lucide-react";
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  EmptyState,
  Pager,
  usePaged,
} from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { noticeAudienceLabel, useHasPermission, useNotices, type ApiNotice } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { ClassNoticeForm } from "@/components/shared/ClassNoticeForm";
import { NoticeDetailDialog } from "@/components/shared/NoticeDetailDialog";
import { useQueryClient } from "@tanstack/react-query";

const AUDIENCES = ["Students", "Teachers", "Parents", "Staff"];

export default function Page() {
  const { user } = useAuth();
  return user?.role === "SCHOOL_ADMIN" ? <AdminNoticesView /> : <StudentNoticesView />;
}

function StudentNoticesView() {
  const { user } = useAuth();
  const { data: notices, isLoading } = useNotices();
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<ApiNotice | null>(null);
  // Teachers can post to their own classes unless the school switched it off in Roles.
  const { data: canPost } = useHasPermission("notices.post_to_class", user?.role === "TEACHER");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteNotice(n: ApiNotice) {
    if (!confirm(`Delete "${n.title}"? Students and parents will no longer see it.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/notices/${n.id}`);
      await queryClient.invalidateQueries({ queryKey: ["notices"] });
      setDetail(null);
      toast.success("Notice deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete notice");
    } finally {
      setDeleting(false);
    }
  }

  const rows = notices ?? [];
  const unread = rows.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Notices"
        description="Notices relevant to you."
        breadcrumb={["Dashboard", "Notices"]}
        actions={
          canPost ? (
            <Button size="sm" className="h-9" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create Notice
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <InfoCard label="Total Notices" value={rows.length} icon={Bell} tone="navy" />
        <InfoCard label="Unread" value={unread} icon={MailOpen} tone="gold" />
      </div>

      <SectionCard className="mt-4" title="All Notices">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No notices found" icon={Bell} />
        ) : (
          <div className="space-y-2">
            {rows.map((n) => (
              <button
                key={n.id}
                onClick={() => setDetail(n)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border border-border px-3 py-3 text-left transition-colors hover:bg-accent",
                  !n.read && "bg-gold-soft/60",
                )}
              >
                <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bell className="h-5 w-5" />
                  {!n.read && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-gold" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    {n.priority && <StatusBadge status={n.priority} />}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {n.description}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {n.date} · {n.author} · {n.category}
                    {n.class_id && ` · ${noticeAudienceLabel(n)}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <NoticeDetailDialog
        notice={detail}
        onClose={() => setDetail(null)}
        footer={
          user && detail?.created_by === user.id ? (
            <DialogFooter>
              <Button
                variant="outline"
                className="text-destructive"
                disabled={deleting}
                onClick={() => deleteNotice(detail)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete notice
              </Button>
            </DialogFooter>
          ) : undefined
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Notice</DialogTitle>
            <DialogDescription>
              Send a notice to the students and parents of your classes.
            </DialogDescription>
          </DialogHeader>
          <ClassNoticeForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminNoticesView() {
  const { data } = useNotices();
  const queryClient = useQueryClient();
  const notices = data ?? [];
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ApiNotice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [noticeCategory, setNoticeCategory] = useState("");
  const [noticePriority, setNoticePriority] = useState("Medium");
  const [description, setDescription] = useState("");
  const [audiences, setAudiences] = useState<string[]>(["Students", "Teachers", "Parents"]);
  const [submitting, setSubmitting] = useState(false);

  const categories = useMemo(
    () =>
      Array.from(new Set(notices.map((n) => n.category).filter((v): v is string => Boolean(v)))),
    [notices],
  );

  const filtered = useMemo(() => {
    return notices.filter((n) => {
      const matchesSearch = n.title.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === "all" || n.category === category;
      const matchesPriority = priority === "all" || n.priority === priority;
      return matchesSearch && matchesCategory && matchesPriority;
    });
  }, [notices, search, category, priority]);

  const { rows, pageCount } = usePaged(filtered, page, 6);

  const totalNotices = notices.length;
  const highPriority = notices.filter((n) => n.priority === "High").length;
  const unread = notices.filter((n) => !n.read).length;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const publishedThisMonth = notices.filter((n) => n.date?.startsWith(currentMonth)).length;

  const important = notices.filter((n) => n.priority === "High");

  const openNotice = async (n: ApiNotice) => {
    setDetail({ ...n, read: true });
    if (!n.read) {
      await api.post(`/notices/${n.id}/read`);
      await queryClient.invalidateQueries({ queryKey: ["notices"] });
    }
  };

  const markAllRead = async () => {
    await Promise.all(notices.filter((n) => !n.read).map((n) => api.post(`/notices/${n.id}/read`)));
    await queryClient.invalidateQueries({ queryKey: ["notices"] });
    toast.success("All notices marked as read");
  };

  async function publishNotice(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const audience = audiences.length === 1 ? audiences[0] : "All";
      await api.post("/notices", {
        title,
        description,
        category: noticeCategory,
        priority: noticePriority,
        audience,
      });
      await queryClient.invalidateQueries({ queryKey: ["notices"] });
      setTitle("");
      setNoticeCategory("");
      setDescription("");
      setNoticePriority("Medium");
      setCreateOpen(false);
      toast.success("Notice published successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish notice");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Notice & Announcement Management"
        description="Publish and track school-wide notices and announcements."
        breadcrumb={["Dashboard", "Notices"]}
        actions={
          <Button size="sm" className="h-9" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Create Notice
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Total Notices" value={totalNotices} icon={Bell} tone="navy" />
        <InfoCard label="High Priority" value={highPriority} icon={AlertTriangle} tone="danger" />
        <InfoCard label="Unread" value={unread} icon={MailOpen} tone="gold" />
        <InfoCard
          label="Published This Month"
          value={publishedThisMonth}
          icon={CalendarCheck2}
          tone="info"
        />
      </div>

      <SectionCard
        className="mt-4"
        title="Important Notices"
        subtitle="Pinned high priority announcements"
        action={<Pin className="h-4 w-4 text-gold-foreground" />}
      >
        {important.length === 0 ? (
          <EmptyState title="No pinned notices" icon={Pin} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {important.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotice(n)}
                className="rounded-xl border border-gold/35 bg-gold-soft px-3 py-2 text-left"
              >
                <p className="truncate text-sm font-semibold">{n.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {n.date} · {n.author}
                </p>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard className="mt-4" title="All Notices" subtitle="Browse and manage announcements">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search notices…"
          />
          <FilterSelect
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            options={categories}
            placeholder="Category"
          />
          <FilterSelect
            value={priority}
            onChange={(v) => {
              setPriority(v);
              setPage(1);
            }}
            options={["High", "Medium", "Low"]}
            placeholder="Priority"
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No notices found" icon={Bell} />
        ) : (
          <div className="space-y-2">
            {rows.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotice(n)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border border-border px-3 py-3 text-left transition-colors hover:bg-accent",
                  !n.read && "bg-gold-soft/60",
                )}
              >
                <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bell className="h-5 w-5" />
                  {!n.read && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-gold" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    <StatusBadge status={n.priority} />
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {n.description}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {n.date} · {n.author} · {n.category}
                    {n.class_id && ` · ${noticeAudienceLabel(n)}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
        <Pager page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} />
      </SectionCard>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
                <DialogDescription>
                  {detail.date} · {detail.author}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={detail.priority} />
                  <StatusBadge status={detail.category} tone="neutral" />
                  {detail.class_id && (
                    <StatusBadge status={noticeAudienceLabel(detail)} tone="info" />
                  )}
                </div>
                <p>{detail.description}</p>
                <p className="text-muted-foreground">
                  Please ensure all concerned members are informed in advance and necessary
                  preparations are made well before the scheduled date.
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
                  <Paperclip className="h-4 w-4 shrink-0" /> notice-attachment.pdf
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={markAllRead}>
                  <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all as read
                </Button>
                <Button onClick={() => toast.success("Notice link copied to share")}>
                  <Share2 className="mr-1.5 h-4 w-4" /> Share
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Notice</DialogTitle>
            <DialogDescription>Publish a new notice or announcement.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={publishNotice}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Title</Label>
                <Input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Notice title"
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input required placeholder="General / Event / Meeting…" />
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Input required placeholder="High / Medium / Low" />
              </div>
              <div className="space-y-1">
                <Label>Publish Date</Label>
                <Input required type="date" min={new Date().toISOString().slice(0, 10)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Audience</Label>
              <div className="flex flex-wrap gap-3 pt-1">
                {AUDIENCES.map((a) => (
                  <label key={a} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={audiences.includes(a)}
                      onCheckedChange={(checked) =>
                        setAudiences((current) =>
                          checked
                            ? [...new Set([...current, a])]
                            : current.filter((value) => value !== a),
                        )
                      }
                    />{" "}
                    {a}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notice description"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || audiences.length === 0}>
                {submitting ? "Publishing…" : "Publish Notice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
