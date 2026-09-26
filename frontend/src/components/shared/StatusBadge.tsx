import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "gold";

const tones: Record<Tone, string> = {
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-destructive-soft text-destructive border-destructive/25",
  info: "bg-info-soft text-info border-info/25",
  gold: "bg-gold-soft text-gold-foreground border-gold/35",
  neutral: "bg-muted text-muted-foreground border-border",
};

const map: Record<string, Tone> = {
  Active: "success",
  Present: "success",
  Paid: "success",
  Approved: "success",
  Pass: "success",
  Verified: "success",
  Available: "success",
  Submitted: "success",
  Graded: "success",
  Completed: "success",
  "On Route": "success",
  Pending: "warning",
  Partial: "warning",
  Late: "warning",
  New: "info",
  Enquiry: "info",
  Application: "info",
  "Document Verification": "warning",
  "Under Review": "warning",
  Waitlisted: "gold",
  Converted: "success",
  Ongoing: "info",
  Scheduled: "info",
  Leave: "info",
  Idle: "neutral",
  Inactive: "neutral",
  Medium: "info",
  Low: "neutral",
  High: "danger",
  Absent: "danger",
  Overdue: "danger",
  Rejected: "danger",
  Fail: "danger",
  Missing: "danger",
  Suspended: "danger",
  Maintenance: "warning",
  "On Leave": "warning",
  Issued: "warning",

  // SaaS/platform status values (school + subscription), stored upper-case in the DB
  ACTIVE: "success",
  PAID: "success",
  TRIAL: "info",
  PENDING: "warning",
  INACTIVE: "neutral",
  SUSPENDED: "danger",
  OVERDUE: "danger",
  EXPIRED: "danger",
};

export function StatusBadge({
  status,
  tone,
  className,
}: {
  status: string;
  tone?: Tone;
  className?: string;
}) {
  const t = tone ?? map[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        tones[t],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export function GradeBadge({ grade }: { grade: string }) {
  const tone: Tone = grade.startsWith("A")
    ? "success"
    : grade.startsWith("B")
      ? "info"
      : grade === "C"
        ? "gold"
        : grade === "D"
          ? "warning"
          : "danger";
  return (
    <span
      className={cn(
        "inline-flex h-7 w-9 items-center justify-center rounded-lg border text-xs font-bold",
        tones[tone],
      )}
    >
      {grade}
    </span>
  );
}
