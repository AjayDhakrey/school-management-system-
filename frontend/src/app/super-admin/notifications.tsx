import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CreditCard, Headphones, RefreshCw, UserPlus, type LucideIcon } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/shared/ui-kit";
import { InfoCard } from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  usePlatformNotifications,
  type PlatformNotificationCategory,
} from "@/hooks/usePlatformNotifications";

const CATEGORIES: PlatformNotificationCategory[] = ["Renewals", "Leads", "Support", "Payments"];

const CATEGORY_ICON: Record<PlatformNotificationCategory, LucideIcon> = {
  Renewals: RefreshCw,
  Leads: UserPlus,
  Support: Headphones,
  Payments: CreditCard,
};

function timeAgo(iso: string) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const mins = Math.round((Date.now() - when.getTime()) / 60000);
  if (mins < 0) return when.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return when.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Page() {
  const navigate = useNavigate();
  const { notifications, unread, isLoading, markRead, markAllRead } = usePlatformNotifications();
  const [filter, setFilter] = useState<"All" | PlatformNotificationCategory>("All");

  const filtered =
    filter === "All" ? notifications : notifications.filter((n) => n.category === filter);

  return (
    <div>
      <PageHeader
        title="Notification Center"
        description="Renewals, new leads, support tickets and payments across the platform."
        breadcrumb={["Dashboard", "Notifications"]}
        actions={
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={unread === 0}>
            Mark all as read
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <InfoCard label="All" value={notifications.length} icon={Bell} tone="navy" />
        <InfoCard label="Unread" value={unread} icon={Bell} tone="gold" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(["All", ...CATEGORIES] as const).map((label) => {
          const Icon = label === "All" ? null : CATEGORY_ICON[label];
          const count =
            label === "All"
              ? notifications.length
              : notifications.filter((n) => n.category === label).length;
          return (
            <button
              key={label}
              onClick={() => setFilter(label)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === label
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:bg-muted",
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {label}
              <span className="opacity-70">{count}</span>
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
            const Icon = CATEGORY_ICON[n.category];
            return (
              <button
                key={n.id}
                onClick={() => {
                  markRead(n.id);
                  navigate(n.path);
                }}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 sm:px-5",
                  !n.read && "bg-gold-soft/50",
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />}
                  </div>
                  {n.body && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {timeAgo(n.created_at)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
