import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Role =
  | "Super Admin"
  | "School Admin"
  | "Teacher"
  | "Student"
  | "Parent"
  | "Staff"
  | "Accountant"
  | "Librarian"
  | "Transport Manager";

export const ROLES: Role[] = [
  "Super Admin",
  "School Admin",
  "Teacher",
  "Student",
  "Parent",
  "Staff",
  "Accountant",
  "Librarian",
  "Transport Manager",
];

type AppState = {
  theme: "light" | "dark";
  toggleTheme: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem("scholaris-theme");
    if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
    const storedCollapsed = localStorage.getItem("scholaris-collapsed");
    if (storedCollapsed) setCollapsed(storedCollapsed === "1");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo<AppState>(
    () => ({
      theme,
      toggleTheme: () =>
        setTheme((t) => {
          const next = t === "dark" ? "light" : "dark";
          localStorage.setItem("scholaris-theme", next);
          return next;
        }),
      sidebarOpen,
      setSidebarOpen,
      collapsed,
      toggleCollapsed: () =>
        setCollapsed((c) => {
          localStorage.setItem("scholaris-collapsed", c ? "0" : "1");
          return !c;
        }),
    }),
    [theme, sidebarOpen, collapsed],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
