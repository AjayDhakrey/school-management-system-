import {
  BookOpenCheck,
  CalendarDays,
  CalendarRange,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { TERMS_PER_YEAR } from "@/lib/fees";

// How class-wise fees are charged, and the colours / icons each group uses wherever fees are
// shown as a chart (Class Fee Structure, Student Fee Records).

export type BillingFrequency = "Monthly" | "Term" | "Annual" | "One-Time";

export const BILLING_GROUPS: {
  frequency: BillingFrequency;
  title: string;
  note: string;
  examples: string;
  /** "month" → "₹1,500/month" */
  per: string;
  /** Option label in the class-wise form. */
  option: string;
}[] = [
  {
    frequency: "Monthly",
    title: "Monthly Fees",
    note: "Charged every month",
    examples: "Monthly School Fee, Hostel Fee",
    per: "month",
    option: "Every month",
  },
  {
    frequency: "Term",
    title: "Term Fees",
    note: `Charged ${TERMS_PER_YEAR} times a year — Term 1, Term 2 and Term 3`,
    examples: "Examination Fee",
    per: "term",
    option: "Every term",
  },
  {
    frequency: "Annual",
    title: "Yearly Fees",
    note: "Charged once a year",
    examples: "Transport, Library, Activity Fee",
    per: "year",
    option: "Once a year",
  },
  {
    frequency: "One-Time",
    title: "One-Time Fees",
    note: "Charged once per student, when they join",
    examples: "Admission Fee",
    per: "one-time",
    option: "One time",
  },
];

export const GROUP_ICON: Record<BillingFrequency, LucideIcon> = {
  Monthly: CalendarDays,
  Term: BookOpenCheck,
  Annual: CalendarRange,
  "One-Time": UserPlus,
};

export const GROUP_TONE: Record<BillingFrequency, string> = {
  Monthly: "bg-primary/10 text-primary",
  Term: "bg-gold-soft text-gold-foreground",
  Annual: "bg-success-soft text-success",
  "One-Time": "bg-info-soft text-info",
};

/** Faint column tint per billing group, so each group reads as one band in the table. */
export const GROUP_BAND: Record<BillingFrequency, string> = {
  Monthly: "bg-primary/[0.03]",
  Term: "bg-gold-soft/30",
  Annual: "bg-success-soft/30",
  "One-Time": "bg-info-soft/30",
};

/** Coloured underline under each group's header band. */
export const GROUP_ACCENT: Record<BillingFrequency, string> = {
  Monthly: "border-b-primary/50",
  Term: "border-b-gold/60",
  Annual: "border-b-success/50",
  "One-Time": "border-b-info/50",
};
