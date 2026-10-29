import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useLeads, usePayments, useSchools, useSupportTickets } from "@/hooks/useApi";

// Super Admin has no school, so the school-scoped `notifications` table is always empty for
// it. Its notification center is derived from platform data it can already read instead.

export type PlatformNotificationCategory = "Renewals" | "Leads" | "Support" | "Payments";

export interface PlatformNotification {
  id: string;
  category: PlatformNotificationCategory;
  title: string;
  body: string;
  created_at: string;
  path: string;
  read: boolean;
}

const DAY_MS = 86_400_000;
const EXPIRY_WINDOW_DAYS = 30;
const PAYMENT_WINDOW_DAYS = 30;
const STORAGE_KEY = "edunex-platform-notifications-read";
const CHANGE_EVENT = "edunex-platform-notifications-read";

// Read state is a per-browser convenience; it never needs to reach the server.
function loadReadIds(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage blocked (private window etc.) — read state just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function parseIds(raw: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / DAY_MS);
}

export function usePlatformNotifications(enabled = true) {
  const { data: schools = [], isLoading: loadingSchools } = useSchools(enabled);
  const { data: leads = [], isLoading: loadingLeads } = useLeads(enabled);
  const { data: tickets = [], isLoading: loadingTickets } = useSupportTickets(enabled);
  const { data: payments = [], isLoading: loadingPayments } = usePayments(enabled);
  const rawReadIds = useSyncExternalStore(subscribe, loadReadIds, () => "[]");
  const readIds = useMemo(() => parseIds(rawReadIds), [rawReadIds]);

  const notifications = useMemo<PlatformNotification[]>(() => {
    const items: Omit<PlatformNotification, "read">[] = [];

    for (const school of schools) {
      const expires = school.subscription_expires_at;
      if (!expires) continue;
      const days = daysUntil(expires);
      if (days > EXPIRY_WINDOW_DAYS) continue;
      // Keyed by expiry date so a renewed school alerts again on its next expiry.
      items.push({
        id: `renewal-${school.id}-${expires}`,
        category: "Renewals",
        title:
          days < 0
            ? `${school.name}'s subscription has expired`
            : `${school.name}'s subscription expires ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
        body: `${school.plan} plan · expiry ${new Date(expires).toLocaleDateString("en-IN")}`,
        created_at:
          days < 0
            ? expires
            : new Date(new Date(expires).getTime() - EXPIRY_WINDOW_DAYS * DAY_MS).toISOString(),
        path: "/super-admin/renewals",
      });
    }

    for (const lead of leads) {
      if (lead.status !== "NEW") continue;
      items.push({
        id: `lead-${lead.id}`,
        category: "Leads",
        title: `New lead: ${lead.school_name}`,
        body: [lead.contact_name, lead.email, lead.phone].filter(Boolean).join(" · "),
        created_at: lead.created_at,
        path: "/super-admin/leads",
      });
    }

    for (const ticket of tickets) {
      if (ticket.status !== "OPEN" && ticket.status !== "IN_PROGRESS") continue;
      items.push({
        id: `ticket-${ticket.id}`,
        category: "Support",
        title: `${ticket.priority === "URGENT" || ticket.priority === "HIGH" ? `${ticket.priority} ` : ""}support ticket: ${ticket.subject}`,
        body: [ticket.school_name, ticket.status.replace("_", " ").toLowerCase()]
          .filter(Boolean)
          .join(" · "),
        created_at: ticket.created_at,
        path: "/super-admin/support",
      });
    }

    for (const payment of payments) {
      const when = payment.created_at ?? payment.paid_on;
      if (-daysUntil(when) > PAYMENT_WINDOW_DAYS) continue;
      items.push({
        id: `payment-${payment.id}`,
        category: "Payments",
        title: `Payment received from ${payment.school_name ?? payment.school_id}`,
        body: [`₹${Number(payment.amount).toLocaleString("en-IN")}`, payment.plan, payment.method]
          .filter(Boolean)
          .join(" · "),
        created_at: when,
        path: "/super-admin/revenue",
      });
    }

    return items
      .map((item) => ({ ...item, read: readIds.has(item.id) }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [schools, leads, tickets, payments, readIds]);

  const markRead = useCallback((id: string) => {
    const ids = parseIds(loadReadIds());
    if (ids.has(id)) return;
    ids.add(id);
    saveReadIds(ids);
  }, []);

  const markAllRead = useCallback(() => {
    const ids = parseIds(loadReadIds());
    for (const n of notifications) ids.add(n.id);
    saveReadIds(ids);
  }, [notifications]);

  return {
    notifications,
    unread: notifications.filter((n) => !n.read).length,
    isLoading: loadingSchools || loadingLeads || loadingTickets || loadingPayments,
    markRead,
    markAllRead,
  };
}
