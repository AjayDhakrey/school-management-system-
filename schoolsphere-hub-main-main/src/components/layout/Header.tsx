import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Search, LogOut, User, Settings, HelpCircle, MoreVertical } from "lucide-react";
import { CgMenuLeft } from "react-icons/cg";
import { useApp } from "@/lib/app-context";
import { useAuth, toDisplayRole } from "@/lib/auth-context";
import { SidebarBrand, SidebarNav } from "./AppSidebar";
import { useNotifications, useSchoolProfile } from "@/hooks/useApi";
import { PROFILE_PATH_FOR_ROLE, SETTINGS_PATH_FOR_ROLE } from "@/lib/navigation";
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
import { Initials } from "@/components/shared/ui-kit";
import { cn } from "@/lib/utils";

export function Header() {
  const { sidebarOpen, setSidebarOpen } = useApp();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const schoolUser = Boolean(user && user.role !== "SUPER_ADMIN");
  const { data: notifications = [] } = useNotifications(schoolUser);
  const { data: school } = useSchoolProfile(schoolUser);
  const unread = notifications.filter((n) => !n.read).length;
  const role = toDisplayRole(user);
  const profilePath = PROFILE_PATH_FOR_ROLE[role] ?? "/settings";
  const settingsPath = SETTINGS_PATH_FOR_ROLE[role] ?? "/settings";

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-surface/90 px-3 py-2.5 backdrop-blur sm:px-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground lg:hidden"
          >
            <CgMenuLeft className="h-5 w-5" />
          </button>
          <div className="hidden min-w-0 md:block">
            <p className="truncate font-display text-sm font-bold">
              {school?.name ?? "SchoolSphere"}
            </p>
            {school?.session && (
              <p className="truncate text-[11px] text-muted-foreground">Session {school.session}</p>
            )}
          </div>
        </div>

        <div className="relative min-w-0 justify-self-stretch md:justify-self-center md:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students, staff, invoices…"
            className="h-9 bg-muted/50 pl-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Notifications"
              className="relative grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
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
                  <div
                    key={n.id}
                    className={cn(
                      "border-b border-border px-3 py-2.5 last:border-0",
                      !n.read && "bg-gold-soft/40",
                    )}
                  >
                    <p className="text-xs font-semibold">{n.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground/80">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
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

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl border border-border p-1">
              <Initials name={user?.name ?? "?"} className="h-7 w-7 text-[10px]" />
              <span className="hidden text-left lg:block">
                <span className="block text-xs font-semibold leading-tight">{user?.name}</span>
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
              <Initials name={user?.name ?? "?"} className="h-9 w-9 text-[11px]" />
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
