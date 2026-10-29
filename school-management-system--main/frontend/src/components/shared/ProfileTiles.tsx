import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const TONES = {
  primary: "bg-primary/10 text-primary",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  gold: "bg-gold-soft text-gold-foreground",
  danger: "bg-destructive-soft text-destructive",
} as const;

export type TileTone = keyof typeof TONES;

/** Rounded, tinted square holding an icon — the leading element of every profile row. */
export function IconTile({
  icon: Icon,
  tone = "primary",
  size = "md",
}: {
  icon: LucideIcon;
  tone?: TileTone | undefined;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl",
        TONES[tone],
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} />
    </span>
  );
}

/** Read-only facts as a grid of tiles — two across on phones, four on wider cards. */
export function InfoTileList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One read-only fact: icon on top, small label, the value and an optional hint underneath. */
export function InfoTile({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tone?: TileTone;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-primary/30">
      <IconTile icon={icon} tone={tone} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 truncate text-sm font-bold leading-snug">{value}</div>
        {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** A prominent ID-card style banner for the one value people copy and quote — e.g. admission no. */
export function HighlightTile({
  icon: Icon,
  label,
  value,
  trailing,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="relative mb-3 flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-3.5 text-primary-foreground shadow-sm">
      <span className="pointer-events-none absolute -top-8 -right-6 h-24 w-24 rounded-full bg-white/10" />
      <span className="pointer-events-none absolute -bottom-10 right-16 h-20 w-20 rounded-full bg-white/5" />
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15">
        <Icon className="h-5 w-5" />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-75">{label}</p>
        <p className="truncate font-mono text-[15px] font-bold tracking-wide sm:text-base">
          {value}
        </p>
      </div>
      {trailing && <div className="relative shrink-0">{trailing}</div>}
    </div>
  );
}

/** A labelled text input with its icon sitting inside the field. */
export function IconField({
  id,
  label,
  icon: Icon,
  className,
  ...inputProps
}: { id: string; label: string; icon: LucideIcon } & ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          className={cn("h-11 rounded-xl bg-surface pl-10", className)}
          {...inputProps}
        />
      </div>
    </div>
  );
}
