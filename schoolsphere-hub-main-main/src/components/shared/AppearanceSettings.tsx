"use client";

import { Moon, Sun } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { useApp } from "@/lib/app-context";

export function AppearanceSettings() {
  const { theme, toggleTheme } = useApp();
  const isDark = theme === "dark";

  return (
    <SectionCard title="Appearance" subtitle="Choose how the app looks on this device">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Dark Mode</p>
            <p className="truncate text-xs text-muted-foreground">
              {isDark ? "Dark mode is on" : "Dark mode is off"}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label="Toggle dark mode"
          onClick={toggleTheme}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${isDark ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${isDark ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
      </div>
    </SectionCard>
  );
}
