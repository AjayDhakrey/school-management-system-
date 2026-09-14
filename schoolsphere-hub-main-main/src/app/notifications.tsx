"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  ClipboardCheck,
  Wallet,
  Award,
  NotebookPen,
  FileSpreadsheet,
  Megaphone,
  PlaneTakeoff,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useApi";
import { api } from "@/lib/api";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Attendance: ClipboardCheck,
  Fees: Wallet,
  Results: Award,
  Homework: NotebookPen,
  Exams: FileSpreadsheet,
  Notices: Megaphone,
  Leave: PlaneTakeoff,
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function Page() {
  const { data: notifications, isLoading } = useNotifications();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"All" | string>("All");

  const list = notifications ?? [];
  const categories = useMemo(() => Array.from(new Set(list.map((n) => n.category))), [list]);
  const filtered = filter === "All" ? list : list.filter((n) => n.category === filter);

  const unreadCount = list.filter((n) => !n.read).length;

  async function toggleRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update notification");
    }
  }

  async function markAllRead() {
    try {
      await api.patch("/notifications/read-all");
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark notifications as read");
    }
  }

  return (
    <div>
      <PageHeader
        title="Notification Center"
        description="Stay on top of everything relevant to you."
        breadcrumb={["Dashboard", "Notifications"]}
        actions={
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
            Mark all as read
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-2">
        <InfoCard label="All" value={list.length} icon={Bell} tone="navy" />
        <InfoCard label="Unread" value={unreadCount} icon={Bell} tone="gold" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("All")}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            filter === "All" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground hover:bg-muted",
          )}
        >
          All
        </button>
        {categories.map((label) => {
          const Icon = CATEGORY_ICON[label] ?? Bell;
          return (
            <button
              key={label}
              onClick={() => setFilter(label)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === label ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="panel mt-4 divide-y divide-border overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="No notifications" description="You're all caught up." icon={Bell} />
        ) : (
          filtered.map((n) => {
            const Icon = CATEGORY_ICON[n.category] ?? Bell;
            const isRead = Boolean(n.read);
            return (
              <button
                key={n.id}
                onClick={() => !isRead && toggleRead(n.id)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 sm:px-5",
                  !isRead && "bg-gold-soft/50",
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    {!isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />}
                  </div>
                  {n.body && <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
