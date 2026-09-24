import {
  LayoutDashboard,
  GraduationCap,
  Users,
  UserCog,
  School,
  BookOpen,
  CalendarClock,
  NotebookPen,
  ClipboardCheck,
  Wallet,
  FileCheck2,
  FileSpreadsheet,
  Award,
  Library,
  Bus,
  PlaneTakeoff,
  CalendarDays,
  Megaphone,
  Bell,
  FileText,
  ShieldCheck,
  Settings,
  Building2,
  CreditCard,
  Layers,
  UserPlus,
  IndianRupee,
  RefreshCw,
  LifeBuoy,
  ToggleLeft,
  UserCircle,
  CalendarHeart,
  Clock,
  UserSquare2,
  BadgeIndianRupee,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./app-context";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: Role[];
  /** Roles that can still reach the route (e.g. via a dashboard shortcut card or direct URL) but should not see it as a sidebar tab. */
  hideFromSidebar?: Role[];
};

export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean };

const ALL: Role[] = [
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

// School-internal data/modules belong exclusively to School Admin (and the roles
// working inside that one school) — Super Admin is a platform/SaaS operator and
// must never see another entity's students, staff, fees, etc.
const ALL_SCHOOL: Role[] = ALL.filter((r) => r !== "Super Admin");
const admins: Role[] = ["School Admin"];

export const NAV: NavGroup[] = [
  {
    label: "",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard, roles: ALL },
      { label: "My Profile", to: "/profile", icon: UserCircle, roles: ["Student"] },
      { label: "My Profile", to: "/teacher/profile", icon: UserCircle, roles: ["Teacher"] },
    ],
  },
  {
    label: "Student Management",
    items: [
      {
        label: "Students",
        to: "/students",
        icon: GraduationCap,
        roles: [...admins, "Teacher", "Staff"],
        hideFromSidebar: ["Teacher"],
      },
      { label: "Admissions", to: "/admissions", icon: FileCheck2, roles: [...admins, "Staff"] },
    ],
  },
  {
    label: "My Children",
    items: [
      {
        label: "Child Profile",
        to: "/parent/children/profile",
        icon: UserSquare2,
        roles: ["Parent"],
      },
      {
        label: "Attendance",
        to: "/parent/children/attendance",
        icon: ClipboardCheck,
        roles: ["Parent"],
      },
      {
        label: "Timetable",
        to: "/parent/children/timetable",
        icon: CalendarClock,
        roles: ["Parent"],
      },
      { label: "Homework", to: "/parent/children/homework", icon: NotebookPen, roles: ["Parent"] },
      { label: "Exams", to: "/parent/children/exams", icon: FileSpreadsheet, roles: ["Parent"] },
      { label: "Results", to: "/parent/children/results", icon: Award, roles: ["Parent"] },
    ],
  },
  {
    label: "Fees",
    items: [
      { label: "Fee Details", to: "/parent/fees/details", icon: Wallet, roles: ["Parent"] },
      { label: "Pay Fees", to: "/parent/fees/pay", icon: Wallet, roles: ["Parent"] },
      { label: "Payment History", to: "/parent/fees/history", icon: Wallet, roles: ["Parent"] },
    ],
  },
  {
    label: "",
    items: [
      { label: "Leave Requests", to: "/parent/leave", icon: PlaneTakeoff, roles: ["Parent"] },
      { label: "Transport", to: "/parent/transport", icon: Bus, roles: ["Parent"] },
    ],
  },
  {
    label: "My Classes",
    items: [
      { label: "Classes", to: "/teacher/classes", icon: Layers, roles: ["Teacher"] },
      { label: "Students", to: "/teacher/students", icon: GraduationCap, roles: ["Teacher"] },
      { label: "Subjects", to: "/teacher/subjects", icon: BookOpen, roles: ["Teacher"] },
    ],
  },
  {
    label: "Staff Management",
    items: [
      { label: "Teaching Staff", to: "/teaching-staff", icon: UserCog, roles: admins },
      { label: "Non-Teaching Staff", to: "/non-teaching-staff", icon: Users, roles: admins },
      {
        label: "My Salary",
        to: "/my-salary",
        icon: BadgeIndianRupee,
        roles: ["Teacher", "Staff", "Accountant", "Librarian", "Transport Manager"],
      },
      {
        label: "Student Leaves",
        to: "/leave/students",
        icon: PlaneTakeoff,
        roles: admins,
        hideFromSidebar: ["School Admin"],
      },
      {
        label: "Teacher Leaves",
        to: "/leave/teachers",
        icon: PlaneTakeoff,
        roles: [...admins, "Teacher"],
        hideFromSidebar: ["School Admin", "Teacher"],
      },
      {
        label: "Class Leave",
        to: "/teacher/class-leave",
        icon: PlaneTakeoff,
        roles: ["Teacher"],
        hideFromSidebar: ["Teacher"],
      },
      {
        label: "Staff Leaves",
        to: "/leave/staff",
        icon: PlaneTakeoff,
        roles: [...admins, "Staff", "Accountant", "Librarian", "Transport Manager"],
        hideFromSidebar: ["School Admin"],
      },
      {
        label: "My Attendance",
        to: "/staff/my-attendance",
        icon: Clock,
        roles: ["Staff", "Accountant", "Librarian", "Transport Manager"],
      },
    ],
  },
  {
    label: "Academics",
    items: [
      {
        label: "My Subjects",
        to: "/my-subjects",
        icon: BookOpen,
        roles: ["Student"],
        hideFromSidebar: ["Student"],
      },
      {
        label: "Classes & Sections",
        to: "/classes",
        icon: School,
        roles: [...admins, "Teacher"],
        hideFromSidebar: ["School Admin", "Teacher"],
      },
      {
        label: "Subjects",
        to: "/subjects",
        icon: BookOpen,
        roles: [...admins, "Teacher"],
        hideFromSidebar: ["School Admin", "Teacher"],
      },
      {
        label: "Timetable",
        to: "/timetable",
        icon: CalendarClock,
        roles: [...admins, "Teacher", "Student"],
        hideFromSidebar: ["Student", "Teacher"],
      },
      {
        label: "Attendance",
        to: "/attendance",
        icon: ClipboardCheck,
        roles: [...admins, "Teacher", "Student"],
        hideFromSidebar: ["Student", "School Admin", "Teacher"],
      },
      {
        label: "My Attendance",
        to: "/teacher/my-attendance",
        icon: Clock,
        roles: ["Teacher"],
        hideFromSidebar: ["Teacher"],
      },
      {
        label: "Homework",
        to: "/homework",
        icon: NotebookPen,
        roles: [...admins, "Teacher", "Student"],
        hideFromSidebar: ["Student", "Teacher"],
      },
      {
        label: "Examinations",
        to: "/examinations",
        icon: FileSpreadsheet,
        // Staff see the module; what they can do comes from the exams.* / results.*
        // permissions the School Admin grants under Roles & Permissions.
        roles: [...admins, "Teacher", "Student", "Staff"],
        hideFromSidebar: ["Student", "Teacher"],
      },
      {
        label: "Results",
        to: "/results",
        icon: Award,
        roles: [...admins, "Teacher", "Student"],
        hideFromSidebar: ["Teacher"],
      },
    ],
  },
  {
    label: "My Leave",
    items: [{ label: "My Leave", to: "/my-leave", icon: PlaneTakeoff, roles: ["Student"] }],
  },
  {
    label: "",
    items: [
      {
        label: "Holidays",
        to: "/holidays",
        icon: CalendarHeart,
        roles: ["Student", "Parent"],
        hideFromSidebar: ["Student"],
      },
    ],
  },
  {
    label: "Fees & Finance",
    items: [
      {
        label: "Payroll Management",
        to: "/payroll",
        icon: BadgeIndianRupee,
        roles: [...admins, "Accountant"],
      },
      {
        label: "Fee Structure",
        to: "/fees/structure",
        icon: Wallet,
        roles: [...admins, "Accountant"],
        hideFromSidebar: ["School Admin"],
      },
      {
        label: "Fee Collection",
        to: "/fees/collection",
        icon: Wallet,
        roles: [...admins, "Accountant"],
        hideFromSidebar: ["School Admin"],
      },
      {
        label: "Pending Fees",
        to: "/fees/pending",
        icon: Wallet,
        roles: [...admins, "Accountant"],
        hideFromSidebar: ["School Admin"],
      },
      {
        label: "Fee Reports",
        to: "/fees/reports",
        icon: Wallet,
        roles: [...admins, "Accountant"],
        hideFromSidebar: ["School Admin"],
      },
      { label: "Fees", to: "/my-fees", icon: Wallet, roles: ["Student"] },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Notices", to: "/notices", icon: Megaphone, roles: ALL_SCHOOL },
      { label: "Announcements", to: "/announcements", icon: Bell, roles: ALL_SCHOOL },
      {
        label: "Notifications",
        to: "/notifications",
        icon: Bell,
        roles: ["Student", "Teacher", "Parent"],
      },
    ],
  },
  {
    label: "School Services",
    items: [
      {
        label: "Library",
        to: "/library",
        icon: Library,
        // Teachers and staff borrow books too; they see their own loans and the catalogue.
        roles: [
          ...admins,
          "Librarian",
          "Student",
          "Teacher",
          "Staff",
          "Accountant",
          "Transport Manager",
        ],
      },
      {
        label: "Transport",
        to: "/transport",
        icon: Bus,
        roles: [...admins, "Transport Manager", "Student"],
      },
      {
        label: "Certificates & Documents",
        to: "/certificates",
        icon: FileText,
        roles: [...admins, "Student"],
      },
      {
        label: "Parents",
        to: "/parents",
        icon: Users,
        roles: [...admins, "Teacher"],
        hideFromSidebar: ["Teacher"],
      },
      { label: "Events", to: "/events", icon: CalendarDays, roles: ALL_SCHOOL },
    ],
  },
  {
    label: "",
    items: [
      { label: "Reports", to: "/reports", icon: FileText, roles: [...admins, "Accountant"] },
      {
        label: "School Settings",
        to: "/settings",
        icon: Settings,
        roles: ALL_SCHOOL.filter((r) => r !== "Student" && r !== "Parent"),
      },
    ],
  },
  {
    label: "System",
    items: [
      { label: "User Management", to: "/users", icon: Users, roles: admins },
      { label: "Roles & Permissions", to: "/roles", icon: ShieldCheck, roles: admins },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Schools", to: "/super-admin/schools", icon: Building2, roles: ["Super Admin"] },
      {
        label: "School Admins",
        to: "/super-admin/school-admins",
        icon: UserCog,
        roles: ["Super Admin"],
      },
      {
        label: "Leads & Onboarding",
        to: "/super-admin/leads",
        icon: UserPlus,
        roles: ["Super Admin"],
      },
      {
        label: "Subscriptions",
        to: "/super-admin/subscriptions",
        icon: CreditCard,
        roles: ["Super Admin"],
      },
      { label: "Plans & Features", to: "/super-admin/plans", icon: Layers, roles: ["Super Admin"] },
      {
        label: "Revenue & Payments",
        to: "/super-admin/revenue",
        icon: IndianRupee,
        roles: ["Super Admin"],
      },
      { label: "Renewals", to: "/super-admin/renewals", icon: RefreshCw, roles: ["Super Admin"] },
      {
        label: "Support Center",
        to: "/super-admin/support",
        icon: LifeBuoy,
        roles: ["Super Admin"],
      },
      {
        label: "Announcements",
        to: "/super-admin/announcements",
        icon: Megaphone,
        roles: ["Super Admin"],
      },
      {
        label: "Feature Control",
        to: "/super-admin/features",
        icon: ToggleLeft,
        roles: ["Super Admin"],
      },
      {
        label: "Security & Audit",
        to: "/super-admin/security",
        icon: ShieldCheck,
        roles: ["Super Admin"],
      },
      { label: "Settings", to: "/super-admin/settings", icon: Settings, roles: ["Super Admin"] },
    ],
  },
];

/**
 * School Admin's sidebar is a deliberately curated, collapsible-dropdown structure —
 * separate from the shared NAV array above so this never affects any other role's
 * sidebar. Route-level access for these paths is still governed by ROUTE_ROLES (derived
 * from NAV below), which already includes "School Admin" for every route here.
 */
export const SCHOOL_ADMIN_NAV: NavGroup[] = [
  {
    label: "",
    items: [
      {
        label: "Dashboard",
        to: "/school-admin/dashboard",
        icon: LayoutDashboard,
        roles: ["School Admin"],
      },
    ],
  },
  {
    label: "Student Management",
    items: [
      { label: "Students", to: "/students", icon: GraduationCap, roles: ["School Admin"] },
      { label: "Admissions", to: "/admissions", icon: FileCheck2, roles: ["School Admin"] },
    ],
  },
  {
    label: "Staff Management",
    items: [
      { label: "Teaching Staff", to: "/teaching-staff", icon: UserCog, roles: ["School Admin"] },
      {
        label: "Non-Teaching Staff",
        to: "/non-teaching-staff",
        icon: Users,
        roles: ["School Admin"],
      },
    ],
  },
  {
    label: "Fees & Finance",
    items: [
      {
        label: "Payroll & Salary",
        to: "/payroll",
        icon: BadgeIndianRupee,
        roles: ["School Admin"],
      },
      { label: "Fee Structure", to: "/fees/structure", icon: Wallet, roles: ["School Admin"] },
      { label: "Fee Collection", to: "/fees/collection", icon: Wallet, roles: ["School Admin"] },
      { label: "Pending Fees", to: "/fees/pending", icon: Wallet, roles: ["School Admin"] },
      { label: "Fee Reports", to: "/fees/reports", icon: Wallet, roles: ["School Admin"] },
    ],
  },
  {
    label: "Academics",
    items: [
      { label: "Library", to: "/library", icon: Library, roles: ["School Admin"] },
      { label: "Timetable", to: "/timetable", icon: CalendarClock, roles: ["School Admin"] },
      {
        label: "Examinations",
        to: "/examinations",
        icon: FileSpreadsheet,
        roles: ["School Admin"],
      },
      { label: "Transport", to: "/transport", icon: Bus, roles: ["School Admin"] },
      {
        label: "Certificates & Documents",
        to: "/certificates",
        icon: FileText,
        roles: ["School Admin"],
      },
      { label: "Parents", to: "/parents", icon: Users, roles: ["School Admin"] },
      { label: "Events", to: "/events", icon: CalendarDays, roles: ["School Admin"] },
      { label: "Reports", to: "/reports", icon: FileText, roles: ["School Admin"] },
      { label: "School Settings", to: "/settings", icon: Settings, roles: ["School Admin"] },
    ],
  },
  {
    label: "System",
    items: [
      { label: "User Management", to: "/users", icon: Users, roles: ["School Admin"] },
      { label: "Roles & Permissions", to: "/roles", icon: ShieldCheck, roles: ["School Admin"] },
    ],
  },
];

export function navForRole(role: Role): NavGroup[] {
  if (role === "School Admin") return SCHOOL_ADMIN_NAV;
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => (!i.roles || i.roles.includes(role)) && !i.hideFromSidebar?.includes(role),
    ),
  })).filter((g) => g.items.length > 0);
}

/** Same per-route role lists as the sidebar, keyed by path — reused by route guards and any UI (e.g. dashboard quick actions) that links to these routes. */
export const ROUTE_ROLES: Record<string, Role[]> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.to, i.roles ?? ALL]),
);

/** Where the account/profile menu should link for each role — shared by the header and sidebar profile cards. */
export const PROFILE_PATH_FOR_ROLE: Partial<Record<Role, string>> = {
  Student: "/profile",
  Teacher: "/teacher/profile",
  Parent: "/parent/children/profile",
  "Super Admin": "/super-admin/settings",
};

export const SETTINGS_PATH_FOR_ROLE: Partial<Record<Role, string>> = {
  Student: "/profile",
  Parent: "/parent/children/profile",
  "Super Admin": "/super-admin/settings",
};
