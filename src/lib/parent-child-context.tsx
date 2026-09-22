import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStudents, type ApiStudent } from "@/hooks/useApi";

interface ParentChildState {
  children: ApiStudent[];
  isLoading: boolean;
  selectedChildId: string | null;
  selectedChild: ApiStudent | null;
  setSelectedChildId: (id: string) => void;
}

const ParentChildContext = createContext<ParentChildState | null>(null);

function storageKey(userId: string | undefined) {
  return `scholaris-parent-selected-child:${userId ?? "anon"}`;
}

/**
 * Scoped to the /parent/* route subtree only — mounts a single useStudents() query
 * (already server-scoped to this parent's own children) and tracks which child is
 * currently selected across every Parent page.
 */
export function ParentChildProvider({ children: node }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: kids, isLoading } = useStudents();
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);

  const list = useMemo(() => kids ?? [], [kids]);

  useEffect(() => {
    if (list.length === 0) return;
    const stored = localStorage.getItem(storageKey(user?.id));
    const valid = stored && list.some((c) => c.id === stored);
    setSelectedChildIdState(valid ? stored! : list[0]!.id);
  }, [list, user?.id]);

  function setSelectedChildId(id: string) {
    setSelectedChildIdState(id);
    localStorage.setItem(storageKey(user?.id), id);
  }

  const selectedChild = list.find((c) => c.id === selectedChildId) ?? null;

  const value = useMemo<ParentChildState>(
    () => ({ children: list, isLoading, selectedChildId, selectedChild, setSelectedChildId }),
    [list, isLoading, selectedChildId, selectedChild],
  );

  return <ParentChildContext.Provider value={value}>{node}</ParentChildContext.Provider>;
}

export function useParentChild() {
  const ctx = useContext(ParentChildContext);
  if (!ctx) throw new Error("useParentChild must be used within ParentChildProvider");
  return ctx;
}
