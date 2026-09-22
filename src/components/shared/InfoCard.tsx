import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function InfoCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "navy",
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "navy" | "gold" | "success" | "danger" | "info" | "warning";
  className?: string;
}) {
  const tones = {
    navy: "bg-primary/10 text-primary",
    gold: "bg-gold-soft text-gold-foreground",
    success: "bg-success-soft text-success",
    danger: "bg-destructive-soft text-destructive",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
  };
  return (
    <div className={cn("panel flex items-start gap-2 p-3 sm:gap-3 sm:p-4", className)}>
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10",
          tones[tone]
        )}
      >
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
        <p className="mt-0.5 font-display text-base font-bold tracking-tight sm:text-xl">{value}</p>
        {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">{hint}</p>}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  tone = "navy",
  label,
}: {
  value: number;
  className?: string;
  tone?: "navy" | "gold" | "success" | "danger";
  label?: ReactNode;
}) {
  const fills = {
    navy: "bg-primary",
    gold: "bg-gold",
    success: "bg-success",
    danger: "bg-destructive",
  };
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-[11px]  text-muted-foreground">
          {label}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-red-500">
        <div
          className={cn("h-full rounded-full transition-all", fills[tone])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
