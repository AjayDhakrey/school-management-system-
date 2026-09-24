import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, MoreVertical, User } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useAuth, toDisplayRole } from "@/lib/auth-context";
import { navForRole, PROFILE_PATH_FOR_ROLE } from "@/lib/navigation";
import { SCHOOL } from "@/lib/siteData";
import { cn } from "@/lib/utils";
import { AccountAvatar } from "@/components/shared/AccountAvatar";
import { useMyPhotoUrl } from "@/hooks/useMyPhotoUrl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import edunexLogo from "@/assets/edunex-logo.png";

export function SidebarNav({
  onNavigate,
  mobile = false,
}: {
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const { collapsed } = useApp();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const groups = navForRole(toDisplayRole(user));

  // Collapsible ("dropdown") groups start open only if they contain the active route —
  // this only affects groups that opt in via `collapsible: true` (currently just the
  // School Admin sidebar), every other role's groups render exactly as before.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const g of groups) {
      if (g.collapsible && g.items.some((item) => pathname.startsWith(item.to))) {
        initial.add(g.label);
      }
    }
    return initial;
  });

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <nav
      className={cn(
        "scrollbar-slim flex-1 overflow-y-auto",
        mobile ? "space-y-3 px-4 pb-5" : "space-y-3 px-3 pb-5",
      )}
    >
      {groups.map((g, gi) => {
        // In icon-only rail mode the dropdown toggle isn't shown, so always render items there.
        const isOpen = !g.collapsible || collapsed || openGroups.has(g.label);
        return (
          <div key={g.label || gi}>
            {g.label && !collapsed && g.collapsible && (
              <button
                type="button"
                onClick={() => toggleGroup(g.label)}
                className="flex w-full items-center justify-between rounded-lg px-3 pt-2 pb-1.5 text-[10px] font-bold tracking-[0.12em] text-muted-foreground/80 uppercase hover:text-foreground"
              >
                {g.label}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    !isOpen && "-rotate-90",
                  )}
                />
              </button>
            )}
            {g.label && !collapsed && !g.collapsible && (
              <p className="px-3 pt-2 pb-1.5 text-[10px] font-bold tracking-[0.12em] text-muted-foreground/80 uppercase">
                {g.label}
              </p>
            )}
            {g.label && collapsed && <div className="mx-3 my-2 h-px bg-border" />}
            {isOpen && (
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={() => onNavigate?.()}
                        title={item.label}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                          mobile && "min-h-10 gap-3 px-3 text-[13px]",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-primary/10 text-foreground font-semibold"
                            : "text-foreground/70 hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 shrink-0 text-primary",
                            mobile && "h-[18px] w-[18px]",
                            !mobile && !collapsed && "h-[18px] w-[18px]",
                          )}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function SidebarBrand({
  onClose,
  mobile = false,
}: {
  onClose?: () => void;
  mobile?: boolean;
}) {
  const { collapsed } = useApp();
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-4 py-4",
        mobile && "px-5 py-6",
        collapsed && "flex-col gap-3 px-0 py-4",
      )}
    >
      <span
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-sm border border-border/70 bg-card shadow-sm",
          mobile && "h-14 w-14",
        )}
      >
        <img src={edunexLogo} alt="Edunex" />
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate font-display text-sm font-bold leading-tight text-foreground">
            {SCHOOL.name}
          </span>
          <span className="mt-1 block text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {SCHOOL.session}
          </span>
        </span>
      )}
    </div>
  );
}

export function AppSidebar() {
  const { collapsed } = useApp();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = toDisplayRole(user);
  const profilePath = PROFILE_PATH_FOR_ROLE[role] ?? "/settings";
  const photoUrl = useMyPhotoUrl();

  function handleSignOut() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col overflow-hidden border-r border-border/80 bg-card text-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px]" : "w-[248px]",
      )}
    >
      <SidebarBrand />
      <SidebarNav />
      {!collapsed && (
        <div className="mt-2 p-3 pt-2">
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2 shadow-sm">
            <AccountAvatar
              name={user?.name ?? "?"}
              photoUrl={photoUrl}
              className="h-9 w-9 text-[11px]"
            />
            <Link to={profilePath} className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-foreground">
                {user?.name}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{role}</span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account actions"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem asChild>
                  <Link to={profilePath}>
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
      )}
    </aside>
  );
}
