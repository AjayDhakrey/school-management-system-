import { type ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import { AiFillHome, AiOutlineBell, AiOutlineHome, AiOutlineSchedule } from "react-icons/ai";
import {
  HiNewspaper,
  HiOutlineNewspaper,
  HiOutlineUserCircle,
  HiUserCircle,
} from "react-icons/hi2";
import { PiCalendarDotsDuotone, PiCalendarDotsFill } from "react-icons/pi";
import { FaChalkboardUser } from "react-icons/fa6";
import { GoTools } from "react-icons/go";
import {
  IoBook,
  IoBookOutline,
  IoBus,
  IoBusOutline,
  IoBusiness,
  IoBusinessOutline,
  IoCash,
  IoCashOutline,
  IoGrid,
  IoGridOutline,
  IoLibrary,
  IoLibraryOutline,
  IoMegaphone,
  IoMegaphoneOutline,
  IoNotifications,
  IoNotificationsOutline,
  IoSchool,
  IoSchoolOutline,
  IoWallet,
  IoWalletOutline,
} from "react-icons/io5";
import { useApp, type Role } from "@/lib/app-context";
import { useAuth, toDisplayRole, DASHBOARD_PATH_FOR_ROLE } from "@/lib/auth-context";
import { useNotifications } from "@/hooks/useApi";
import { PROFILE_PATH_FOR_ROLE, ROUTE_ROLES } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type DockIcon = ComponentType<{ className?: string }>;

type DockItem = {
  label: string;
  to: string;
  /** Outline variant, shown while the item is idle. */
  icon: DockIcon;
  /** Solid variant, shown while the item is active. */
  activeIcon: DockIcon;
  /** Path prefixes that count as "inside" this item. */
  match: string[];
  badge?: number;
  /** When true, only an exact pathname match counts — sub-routes with their own tab
   *  (e.g. /transport/maintenance) should not also light up a broader /transport tab. */
  exact?: boolean;
};

const EXAM_PATHS = ["/examinations", "/results"];

/** Second slot: the role's academics hub, or its main workspace for roles without one. */
const WORKSPACE: Record<Role, DockItem> = {
  "Super Admin": {
    label: "Schools",
    to: "/super-admin/schools",
    icon: IoBusinessOutline,
    activeIcon: IoBusiness,
    match: ["/super-admin/schools"],
  },
  "School Admin": {
    label: "Classes",
    to: "/classes",
    icon: FaChalkboardUser,
    activeIcon: FaChalkboardUser,
    match: ["/classes"],
  },
  Teacher: {
    label: "Subjects",
    to: "/teacher/subjects",
    icon: IoBookOutline,
    activeIcon: IoBook,
    match: ["/teacher/subjects"],
  },
  // Students land on their timetable rather than the subjects list.
  Student: {
    label: "Timetable",
    to: "/timetable",
    icon: PiCalendarDotsDuotone,
    activeIcon: PiCalendarDotsFill,
    match: ["/timetable"],
  },
  Parent: {
    label: "Timetable",
    to: "/parent/children/timetable",
    icon: PiCalendarDotsDuotone,
    activeIcon: PiCalendarDotsFill,
    match: ["/parent/children/timetable"],
  },
  Staff: {
    label: "Students",
    to: "/students",
    icon: IoSchoolOutline,
    activeIcon: IoSchool,
    match: ["/students", "/admissions"],
  },
  Accountant: {
    label: "Fees",
    to: "/fees/collection",
    icon: IoWalletOutline,
    activeIcon: IoWallet,
    match: ["/fees"],
  },
  Librarian: {
    label: "Library",
    to: "/library",
    icon: IoLibraryOutline,
    activeIcon: IoLibrary,
    match: ["/library"],
  },
  "Transport Manager": {
    label: "Transport",
    to: "/transport",
    icon: IoBusOutline,
    activeIcon: IoBus,
    match: ["/transport"],
    exact: true,
  },
};

function isWithin(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Red count bubble pinned to an icon's top-right corner. */
function Badge({ count }: { count: number }) {
  return (
    <span className="absolute -top-[3px] -right-[6px] grid h-[15px] min-w-[15px] place-items-center rounded-full bg-[#f4414d] px-[3px] text-[9px] leading-none font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** One tab: icon over label, tinted and filled while active. */
function DockTile({ item, active }: { item: Omit<DockItem, "to" | "match">; active: boolean }) {
  const Icon = active ? item.activeIcon : item.icon;
  return (
    <>
      <span
        className={cn("relative mb-[5px]", active ? "text-(--dock-active)" : "text-(--dock-ink)")}
      >
        <Icon className="h-[23px] w-[23px]" />
        {!!item.badge && <Badge count={item.badge} />}
      </span>
      <span
        className={cn(
          "text-[10px] leading-none whitespace-nowrap min-[380px]:text-[11px]",
          active ? "font-semibold text-(--dock-active)" : "font-medium text-(--dock-label)",
        )}
      >
        {item.label}
      </span>
    </>
  );
}

const TILE_CLASS =
  "flex w-full flex-col items-center justify-center rounded-[16px] px-0.5 transition-transform active:scale-[0.94]";

/** Bottom tab bar for phones/tablets, where the sidebar is hidden. */
export function MobileBottomNav() {
  const { setSidebarOpen } = useApp();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const schoolUser = Boolean(user && user.role !== "SUPER_ADMIN");
  const { data: notifications = [] } = useNotifications(schoolUser);

  if (!user) return null;

  const role = toDisplayRole(user);
  const homePath = DASHBOARD_PATH_FOR_ROLE[user.role];
  const profilePath = PROFILE_PATH_FOR_ROLE[role] ?? "/settings";
  const unread = notifications.filter((n) => !n.read).length;

  const alerts: DockItem =
    role === "Student"
      ? {
          label: "Exams",
          to: "/examinations",
          icon: HiOutlineNewspaper,
          activeIcon: HiNewspaper,
          match: EXAM_PATHS,
        }
      : role === "Super Admin"
        ? {
            label: "Notices",
            to: "/super-admin/announcements",
            icon: IoMegaphoneOutline,
            activeIcon: IoMegaphone,
            match: ["/super-admin/announcements"],
          }
        : role === "Teacher"
          ? {
              label: "Attendance",
              to: "/attendance",
              icon: AiOutlineSchedule,
              activeIcon: AiOutlineSchedule,
              match: ["/attendance"],
            }
          : role === "School Admin"
            ? {
                label: "Subjects",
                to: "/subjects",
                icon: IoBookOutline,
                activeIcon: IoBook,
                match: ["/subjects"],
              }
            : role === "Parent"
              ? {
                  label: "Attendance",
                  to: "/parent/children/attendance",
                  icon: AiOutlineSchedule,
                  activeIcon: AiOutlineSchedule,
                  match: ["/parent/children/attendance"],
                }
              : role === "Transport Manager"
                ? {
                    label: "Complaints",
                    to: "/transport/complaints",
                    icon: AiOutlineBell,
                    activeIcon: AiOutlineBell,
                    match: ["/transport/complaints"],
                  }
                : (ROUTE_ROLES["/notifications"] ?? []).includes(role)
                ? {
                    label: "Alerts",
                    to: "/notifications",
                    icon: IoNotificationsOutline,
                    activeIcon: IoNotifications,
                    match: ["/notifications"],
                    badge: unread,
                  }
                : {
                    label: "Notices",
                    to: "/notices",
                    icon: IoMegaphoneOutline,
                    activeIcon: IoMegaphone,
                    match: ["/notices"],
                  };

  const home: DockItem = {
    label: "Home",
    to: homePath,
    icon: AiOutlineHome,
    activeIcon: AiFillHome,
    match: [homePath],
  };
  const profile: DockItem = {
    label: "Profile",
    to: profilePath,
    icon: HiOutlineUserCircle,
    activeIcon: HiUserCircle,
    match: [profilePath],
  };

  // Students get their fees in the centre slot, Teachers get their classes, School Admins
  // get attendance, Parents get fee payment, Accountants get payroll; every other role keeps
  // the menu button there. The sidebar stays reachable for them from the header's hamburger.
  const centre: DockItem | null =
    role === "Student"
      ? {
          label: "Fees",
          to: "/my-fees",
          icon: IoWalletOutline,
          activeIcon: IoWallet,
          match: ["/my-fees"],
        }
      : role === "Teacher"
        ? {
            label: "Classes",
            to: "/teacher/classes",
            icon: FaChalkboardUser,
            activeIcon: FaChalkboardUser,
            match: ["/teacher/classes"],
          }
        : role === "School Admin"
          ? {
              label: "Attendance",
              to: "/attendance",
              icon: AiOutlineSchedule,
              activeIcon: AiOutlineSchedule,
              match: ["/attendance"],
            }
          : role === "Parent"
            ? {
                label: "Fees",
                to: "/parent/fees/pay",
                icon: IoWalletOutline,
                activeIcon: IoWallet,
                match: ["/parent/fees/pay", "/parent/fees/details", "/parent/fees/history"],
              }
            : role === "Accountant"
              ? {
                  label: "Payroll",
                  to: "/payroll",
                  icon: IoCashOutline,
                  activeIcon: IoCash,
                  match: ["/payroll"],
                }
              : role === "Transport Manager"
                ? {
                    label: "Maintenance",
                    to: "/transport/maintenance",
                    icon: GoTools,
                    activeIcon: GoTools,
                    match: ["/transport/maintenance"],
                  }
                : null;

  const left = [home, WORKSPACE[role]];
  const right = [alerts, profile];
  const renderItem = (item: DockItem) => {
    const active = item.exact ? pathname === item.to : isWithin(pathname, item.match);
    return (
      <li key={item.to} className="flex items-center justify-center">
        <Link to={item.to} aria-current={active ? "page" : undefined} className={TILE_CLASS}>
          <DockTile item={item} active={active} />
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      {/* Edge-to-edge bar: only the top corners are rounded, and the safe-area inset is
          padded inside so the row never sits under the phone's home indicator. */}
      <div className="rounded-t-[28px] bg-(--dock-surface) pt-[21px] pb-[calc(21px+env(safe-area-inset-bottom))] shadow-[0_-2px_26px_-8px_var(--dock-shadow),0_-1px_2px_var(--dock-shadow)]">
        <ul className="grid grid-cols-5 px-1">
          {left.map(renderItem)}
          {centre ? (
            renderItem(centre)
          ) : (
            <li className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
                className={TILE_CLASS}
              >
                <DockTile
                  item={{ label: "Menu", icon: IoGridOutline, activeIcon: IoGrid }}
                  active={false}
                />
              </button>
            </li>
          )}
          {right.map(renderItem)}
        </ul>
      </div>
    </nav>
  );
}
