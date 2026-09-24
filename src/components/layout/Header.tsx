import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  Search,
  LogOut,
  User,
  Settings,
  HelpCircle,
  MoreVertical,
  GraduationCap,
} from "lucide-react";
import { CgMenuLeft } from "react-icons/cg";
import { useApp } from "@/lib/app-context";
import { useAuth, toDisplayRole } from "@/lib/auth-context";
import { SidebarBrand, SidebarNav } from "./AppSidebar";
import { useNotifications, useSchoolProfile, useStudents, type ApiStudent } from "@/hooks/useApi";
import { PROFILE_PATH_FOR_ROLE, ROUTE_ROLES, SETTINGS_PATH_FOR_ROLE } from "@/lib/navigation";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountAvatar } from "@/components/shared/AccountAvatar";
import { useMyPhotoUrl } from "@/hooks/useMyPhotoUrl";
import { cn } from "@/lib/utils";

type ApiNotification = NonNullable<ReturnType<typeof useNotifications>["data"]>[number];

type SearchBoxProps = {
  /** Id of the results popover, referenced by the input's aria-controls. */
  id: string;
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Whether this role may look students up at all. */
  enabled: boolean;
  searching: boolean;
  hasQuery: boolean;
  students: ApiStudent[];
  onPick: (studentId: string) => void;
};

/** Student quick-search, shared by the desktop bar and the mobile hero. */
function SearchBox({
  id,
  className,
  inputClassName,
  iconClassName,
  placeholder,
  query,
  onQueryChange,
  open,
  setOpen,
  enabled,
  searching,
  hasQuery,
  students,
  onPick,
}: SearchBoxProps) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search
        className={cn(
          "pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground",
          iconClassName,
        )}
      />
      <Input
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && students[0]) {
            e.preventDefault();
            onPick(students[0].id);
          }
        }}
        placeholder={placeholder}
        className={cn("h-9 bg-muted/50 pl-9 text-sm", inputClassName)}
        role="combobox"
        aria-label="Search students"
        aria-expanded={open && hasQuery}
        aria-controls={id}
      />
      {enabled && open && hasQuery && (
        <div
          id={id}
          className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover text-foreground shadow-lg"
        >
          {searching ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching students…</p>
          ) : students.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No students found.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto py-1">
              {students.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(student.id)}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <GraduationCap className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{student.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {student.admission_no ?? "No admission number"}
                      {student.class_name
                        ? ` · ${student.class_name}${student.section ? ` ${student.section}` : ""}`
                        : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type NotificationsMenuProps = {
  notifications: ApiNotification[];
  unread: number;
  triggerClassName: string;
  canOpenCenter: boolean;
  onNavigate: (path: string) => void;
};

/** Bell with its recent-notification popover, shared by both headers. */
function NotificationsMenu({
  notifications,
  unread,
  triggerClassName,
  canOpenCenter,
  onNavigate,
}: NotificationsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Notifications" className={triggerClassName}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
            {unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          <span className="text-[11px] text-muted-foreground">{unread} unread</span>
        </div>
        <div className="scrollbar-slim max-h-80 overflow-y-auto">
          {notifications.slice(0, 5).map((n) => (
            <DropdownMenuItem
              key={n.id}
              // A notice notification opens the notice list; others the notification center.
              onSelect={() => {
                if (n.category === "Notices") onNavigate("/notices");
                else if (canOpenCenter) onNavigate("/notifications");
              }}
              className={cn(
                "block cursor-pointer rounded-none border-b border-border px-3 py-2.5 last:border-0",
                !n.read && "bg-gold-soft/40",
              )}
            >
              <p className="text-xs font-semibold">{n.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{n.body}</p>
              <p className="mt-1 text-[10px] text-muted-foreground/80">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </DropdownMenuItem>
          ))}
        </div>
        <Link
          to="/notifications"
          className="block px-3 py-2.5 text-center text-xs font-semibold text-primary hover:bg-accent"
        >
          View notification center
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const { sidebarOpen, setSidebarOpen } = useApp();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const photoUrl = useMyPhotoUrl();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const schoolUser = Boolean(user && user.role !== "SUPER_ADMIN");
  const { data: notifications = [] } = useNotifications(schoolUser);
  const { data: school } = useSchoolProfile(schoolUser);
  const unread = notifications.filter((n) => !n.read).length;
  const role = toDisplayRole(user);
  const canSearchStudents = (ROUTE_ROLES["/students"] ?? []).includes(role);
  const { data: studentMatches = [], isFetching: isSearching } = useStudents(
    canSearchStudents && debouncedQuery.length > 0,
    debouncedQuery ? { q: debouncedQuery } : undefined,
  );
  const canOpenNotificationCenter = (ROUTE_ROLES["/notifications"] ?? []).includes(role);
  const profilePath = PROFILE_PATH_FOR_ROLE[role] ?? "/settings";
  const settingsPath = SETTINGS_PATH_FOR_ROLE[role] ?? "/settings";

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const visibleStudents = studentMatches.slice(0, 6);

  function openStudent(studentId: string) {
    setQuery("");
    setDebouncedQuery("");
    setSearchOpen(false);
    navigate(`/students/${studentId}`);
  }

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      {/* Phones and tablets get a compact app-style bar: menu, search, notifications. */}
      <header className="relative flex min-h-[12vh] flex-col overflow-hidden px-4 pt-[calc(0.6rem+env(safe-area-inset-top))] pb-[32px] text-white lg:hidden">
        {/* Flat single-tone bar, clipped so it never spills past the wave. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 bottom-[24px] overflow-hidden bg-[#5F9AF8]"
        >
          <div className="absolute -top-24 -left-20 h-[210px] w-[210px] rounded-full bg-white/12" />
        </div>
        <svg
          aria-hidden
          viewBox="0 180 900 110"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 h-[24px] w-full"
        >
          <path
            d="M0 262L21.5 268.2C43 274.3 86 286.7 128.8 277C171.7 267.3 214.3 235.7 257.2 215C300 194.3 343 184.7 385.8 202.7C428.7 220.7 471.3 266.3 514.2 266.8C557 267.3 600 222.7 642.8 218.2C685.7 213.7 728.3 249.3 771.2 266.3C814 283.3 857 281.7 878.5 280.8L900 280L900 0L878.5 0C857 0 814 0 771.2 0C728.3 0 685.7 0 642.8 0C600 0 557 0 514.2 0C471.3 0 428.7 0 385.8 0C343 0 300 0 257.2 0C214.3 0 171.7 0 128.8 0C86 0 43 0 21.5 0L0 0Z"
            fill="#5F9AF8"
          />
        </svg>
        <div className="relative flex items-center gap-2.5">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30 active:bg-white/35"
          >
            <CgMenuLeft className="h-5 w-5" />
          </button>
          <SearchBox
            id="mobile-search-results"
            className="flex-1"
            placeholder="Search"
            inputClassName="h-11 rounded-full border-transparent bg-white pl-10 text-sm text-foreground shadow-[0_10px_24px_-14px_rgb(12_40_95/0.6)] placeholder:text-muted-foreground/80"
            iconClassName="left-3.5 text-foreground/60"
            query={query}
            onQueryChange={setQuery}
            open={searchOpen}
            setOpen={setSearchOpen}
            enabled={canSearchStudents}
            searching={isSearching}
            hasQuery={debouncedQuery.length > 0}
            students={visibleStudents}
            onPick={openStudent}
          />
          <NotificationsMenu
            notifications={notifications}
            unread={unread}
            canOpenCenter={canOpenNotificationCenter}
            onNavigate={navigate}
            triggerClassName="relative grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30 active:bg-white/35"
          />
        </div>
      </header>

      <header className="sticky top-0 z-30 hidden grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-surface/90 px-3 py-2.5 backdrop-blur sm:px-5 lg:grid">
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold">
              {school?.name ?? "SchoolSphere"}
            </p>
            {school?.session && (
              <p className="truncate text-[11px] text-muted-foreground">Session {school.session}</p>
            )}
          </div>
        </div>

        <SearchBox
          id="header-search-results"
          className="justify-self-stretch md:w-80 md:justify-self-center"
          placeholder="Search students, staff, invoices…"
          query={query}
          onQueryChange={setQuery}
          open={searchOpen}
          setOpen={setSearchOpen}
          enabled={canSearchStudents}
          searching={isSearching}
          hasQuery={debouncedQuery.length > 0}
          students={visibleStudents}
          onPick={openStudent}
        />

        <div className="flex items-center gap-1.5">
          <NotificationsMenu
            notifications={notifications}
            unread={unread}
            canOpenCenter={canOpenNotificationCenter}
            onNavigate={navigate}
            triggerClassName="relative grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
          />

          {/* Desktop only: on phones the account lives in the sidebar sheet and the bottom nav. */}
          <DropdownMenu>
            <DropdownMenuTrigger className="hidden items-center gap-2 rounded-xl border border-border p-1 lg:flex">
              <AccountAvatar name={user?.name ?? "?"} photoUrl={photoUrl} className="h-7 w-7 text-[10px]" />
              <span className="text-left">
                <span className="block text-xs leading-tight font-semibold">{user?.name}</span>
                <span className="block text-[10px] leading-tight text-muted-foreground">
                  {role}
                </span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>My account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={profilePath}>
                  <User className="mr-2 h-4 w-4" /> My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={settingsPath}>
                  <Settings className="mr-2 h-4 w-4" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          overlayClassName="bg-foreground/20"
          className="flex h-full w-[278px] flex-col gap-0 border-r border-border/80 bg-card p-0 text-foreground shadow-xl data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-none"
        >
          <SidebarBrand mobile onClose={() => setSidebarOpen(false)} />
          <SidebarNav mobile onNavigate={() => setSidebarOpen(false)} />
          {/* <div className="mx-5 border-t border-border/70 pt-4">
            <div className="space-y-1 rounded-2xl bg-muted/60 p-2">
              <Link
                to={settingsPath}
                onClick={() => setSidebarOpen(false)}
                className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-foreground/70 transition-colors hover:bg-card hover:text-foreground"
              >
                <Settings className="h-[18px] w-[18px]" />
                Settings
              </Link>
              <button
                type="button"
                className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium text-foreground/70 transition-colors hover:bg-card hover:text-foreground"
              >
                <HelpCircle className="h-[18px] w-[18px]" />
                Help Center
              </button>
            </div>
          </div> */}
          <div className="mt-5 p-5 pt-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2 shadow-sm">
              <AccountAvatar name={user?.name ?? "?"} photoUrl={photoUrl} className="h-9 w-9 text-[11px]" />
              <Link
                to={profilePath}
                onClick={() => setSidebarOpen(false)}
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-xs font-semibold text-foreground">
                  {user?.name}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {role}
                </span>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Account actions"
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem asChild>
                    <Link to={profilePath} onClick={() => setSidebarOpen(false)}>
                      <User className="mr-2 h-4 w-4" /> My Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
