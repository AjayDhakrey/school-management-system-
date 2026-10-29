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

export type TextSize = "small" | "default" | "large";
const TEXT_SIZE_PX: Record<TextSize, string> = { small: "15px", default: "16px", large: "17.5px" };

type AppState = {
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
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
  const [textSize, setTextSize] = useState<TextSize>("default");

  useEffect(() => {
    const storedTheme = localStorage.getItem("scholaris-theme");
    if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
    const storedCollapsed = localStorage.getItem("scholaris-collapsed");
    if (storedCollapsed) setCollapsed(storedCollapsed === "1");
    const storedTextSize = localStorage.getItem("scholaris-text-size");
    if (storedTextSize === "small" || storedTextSize === "large") setTextSize(storedTextSize);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Everything is sized in rem, so the root font size scales the whole interface.
  useEffect(() => {
    document.documentElement.style.fontSize = TEXT_SIZE_PX[textSize];
  }, [textSize]);

  const value = useMemo<AppState>(
    () => ({
      theme,
      toggleTheme: () =>
        setTheme((t) => {
          const next = t === "dark" ? "light" : "dark";
          localStorage.setItem("scholaris-theme", next);
          return next;
        }),
      setTheme: (next) => {
        localStorage.setItem("scholaris-theme", next);
        setTheme(next);
      },
      textSize,
      setTextSize: (size) => {
        localStorage.setItem("scholaris-text-size", size);
        setTextSize(size);
      },
      sidebarOpen,
      setSidebarOpen,
      collapsed,
      toggleCollapsed: () =>
        setCollapsed((c) => {
          localStorage.setItem("scholaris-collapsed", c ? "0" : "1");
          return !c;
        }),
    }),
    [theme, textSize, sidebarOpen, collapsed],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
