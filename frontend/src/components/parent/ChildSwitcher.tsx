import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Initials } from "@/components/shared/ui-kit";
import { EmptyState } from "@/components/shared/ui-kit";
import { Users } from "lucide-react";
import { useParentChild } from "@/lib/parent-child-context";
import { cn } from "@/lib/utils";

/** Rendered at the top of every Parent page. No-op UI for a single-child parent. */
export function ChildSwitcher({ className }: { className?: string }) {
  const { children, isLoading, selectedChildId, setSelectedChildId } = useParentChild();

  if (isLoading) return null;

  if (children.length === 0) {
    return (
      <div className={cn("mb-4", className)}>
        <EmptyState
          title="No linked children"
          description="Your school hasn't linked any student records to your account yet."
          icon={Users}
        />
      </div>
    );
  }

  if (children.length === 1) {
    const c = children[0]!;
    return (
      <div className={cn("mb-4 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3", className)}>
        <Initials name={c.name} tone="navy" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {c.class_name ? `Class ${c.class_name}${c.section ? `-${c.section}` : ""}` : "—"}
          </p>
        </div>
      </div>
    );
  }

  if (children.length <= 3) {
    return (
      <div className={cn("mb-4 flex flex-wrap gap-2", className)}>
        {children.map((c) => {
          const active = c.id === selectedChildId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedChildId(c.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:bg-muted",
              )}
            >
              <Initials name={c.name} tone={active ? "navy" : "info"} className="h-6 w-6 text-[10px]" />
              {c.name}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("mb-4 w-full max-w-xs", className)}>
      <Select value={selectedChildId ?? ""} onValueChange={setSelectedChildId}>
        <SelectTrigger className="bg-surface">
          <SelectValue placeholder="Select a child" />
        </SelectTrigger>
        <SelectContent>
          {children.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name} {c.class_name ? `— Class ${c.class_name}${c.section ? `-${c.section}` : ""}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
