import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  CalendarRange,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { AccountAvatar } from "@/components/shared/AccountAvatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAuth, toDisplayRole } from "@/lib/auth-context";
import { APP_SETTINGS_PATH } from "@/lib/navigation";
import { useMyPhotoUrl } from "@/hooks/useMyPhotoUrl";
import { useSchoolProfile } from "@/hooks/useApi";

/**
 * Personal profile for the roles that have no linked teacher/staff/student record
 * (Super Admin, School Admin). Other roles keep their own profile pages.
 */

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}

function Shortcut({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/50"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default function MyProfilePage() {
  const { user } = useAuth();
  const photoUrl = useMyPhotoUrl();
  const role = toDisplayRole(user);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const { data: school } = useSchoolProfile(Boolean(user && !isSuperAdmin));

  return (
    <div>
      <PageHeader
        title="My Profile"
        description="Your account details."
        breadcrumb={["Dashboard", "My Profile"]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <section className="panel overflow-hidden shadow-md shadow-gray-300">
            <div className="h-20 bg-gradient-to-r from-primary/80 to-primary/40" />
            <div className="-mt-10 flex flex-wrap items-end gap-4 px-5 pb-5">
              <AccountAvatar
                name={user?.name ?? "?"}
                photoUrl={photoUrl}
                className="h-20 w-20 border-4 border-surface text-xl"
              />
              <div className="min-w-0 flex-1 pb-1">
                <p className="truncate font-display text-xl font-bold">{user?.name}</p>
                <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
              </div>
              <StatusBadge status={role} tone="info" />
            </div>
          </section>

          <SectionCard title="Account details">
            <div className="divide-y divide-border">
              <Detail icon={UserRound} label="Full name" value={user?.name} />
              <Detail icon={Mail} label="Email (sign-in)" value={user?.email} />
              <Detail icon={ShieldCheck} label="Role" value={role} />
              {!isSuperAdmin && <Detail icon={Building2} label="School" value={school?.name} />}
            </div>
          </SectionCard>

          {!isSuperAdmin && school && (
            <SectionCard
              title="My school"
              {...(school.tagline ? { subtitle: school.tagline } : {})}
            >
              <div className="grid gap-x-6 sm:grid-cols-2">
                <Detail icon={CalendarRange} label="Current session" value={school.session} />
                <Detail
                  icon={BadgeCheck}
                  label="Plan"
                  value={school.plan ? `${school.plan} · ${school.status}` : school.status}
                />
                <Detail icon={Phone} label="School phone" value={school.phone} />
                <Detail icon={Mail} label="School email" value={school.email} />
                <div className="sm:col-span-2">
                  <Detail icon={MapPin} label="Address" value={school.address} />
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        <SectionCard title="Shortcuts" bodyClassName="grid gap-2">
          {isSuperAdmin ? (
            <Shortcut
              to="/super-admin/settings"
              icon={Building2}
              title="Platform Settings"
              description="Platform name, branding and identity"
            />
          ) : (
            <Shortcut
              to="/settings"
              icon={Building2}
              title="School Settings"
              description="School profile, academic years, configuration"
            />
          )}
          <Shortcut
            to={APP_SETTINGS_PATH}
            icon={SlidersHorizontal}
            title="App Settings"
            description="Theme, text size and password"
          />
          {isSuperAdmin && (
            <Shortcut
              to="/super-admin/security"
              icon={Settings}
              title="Security"
              description="Audit log and password"
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
