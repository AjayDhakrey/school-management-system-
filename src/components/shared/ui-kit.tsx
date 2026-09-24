import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Search, Inbox, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: string[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {breadcrumb.map((b, i) => (
              <span key={b} className="flex items-center gap-1.5">
                {i > 0 && <span className="opacity-50">/</span>}
                <span className={i === breadcrumb.length - 1 ? "text-foreground/80" : ""}>{b}</span>
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate font-display text-xl font-bold sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 bg-surface pl-9 text-sm"
      />
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-9 w-full bg-surface text-sm sm:w-[150px]", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description = "Try adjusting your search or filters to find what you're looking for.",
  icon: Icon = Inbox,
  action,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-1 font-display text-base font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive-soft text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <p className="mt-1 font-display text-base font-semibold">Couldn't load this section</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something went wrong while preparing this view. Please try again.
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-6 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function Pager({
  page,
  pageCount,
  onPage,
  total,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  total: number;
}) {
  if (pageCount <= 0) return null;
  return (
    <div className="grid gap-2 border-t border-border px-4 py-3 sm:flex sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Page {page} of {pageCount} · {total} records
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        {Array.from({ length: Math.min(5, pageCount) }).map((_, i) => {
          const p = i + 1;
          return (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              className="hidden h-8 w-8 p-0 sm:inline-flex"
              onClick={() => onPage(p)}
            >
              {p}
            </Button>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page === pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function Initials({
  name,
  className,
  tone = "navy",
}: {
  name: string;
  className?: string;
  tone?: "navy" | "gold" | "info";
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0] ?? "")
    .join("");
  const tones = {
    navy: "bg-primary/12 text-primary",
    gold: "bg-gold-soft text-gold-foreground",
    info: "bg-info-soft text-info",
  };
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold",
        tones[tone],
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function usePaged<T>(items: T[], page: number, perPage = 8) {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const safe = Math.min(page, pageCount);
  return {
    pageCount,
    rows: items.slice((safe - 1) * perPage, safe * perPage),
  };
}
