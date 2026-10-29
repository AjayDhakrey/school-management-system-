import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "17 Oct 2026" from an ISO date/time. */
export function niceDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** "1" → "Class 1"; names that already start with "Class" (e.g. "Class-1") are kept as-is. */
export function withClassPrefix(name: string) {
  const trimmed = name.trim();
  return /^class\b/i.test(trimmed) ? trimmed : `Class ${trimmed}`;
}
