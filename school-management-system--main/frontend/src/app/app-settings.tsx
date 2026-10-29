import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  Sun,
  Type,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { AccountAvatar } from "@/components/shared/AccountAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp, type TextSize } from "@/lib/app-context";
import { useAuth, toDisplayRole } from "@/lib/auth-context";
import { PROFILE_PATH_FOR_ROLE } from "@/lib/navigation";
import { useMyPhotoUrl } from "@/hooks/useMyPhotoUrl";
import { useSchoolProfile } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { mobileFromEmail } from "@/lib/parent-login";
import { studentIdFromEmail } from "@/lib/student-login";
import { cn } from "@/lib/utils";

/** One labelled row: text on the left, its control on the right (stacked on phones). */
function SettingRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0 sm:ml-4">{children}</div>
    </div>
  );
}

/** Segmented single-choice control. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-xl border border-border bg-muted/40 p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon && <o.icon className="h-3.5 w-3.5" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const { user, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  // Still on the starting password the school gave out: remind them what it is.
  const firstPasswordRule = !user?.mustChangePassword
    ? null
    : mobileFromEmail(user.email)
      ? "the first four letters of your name (first one capital) followed by the first four digits of your mobile number"
      : studentIdFromEmail(user.email)
        ? "your date of birth (DDMMYYYY)"
        : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("The new password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("The new passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch("/auth/password", { currentPassword, newPassword });
      if (user?.mustChangePassword) {
        // Marks the starting password as replaced (shown to admins on the login lists).
        await api.post("/auth/complete-password-change", {});
        await refreshUser();
      }
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-md gap-4">
      {firstPasswordRule && (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          Your current password is {firstPasswordRule}.
        </p>
      )}
      <PasswordField
        id="current-password"
        label="Current password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
      />
      <PasswordField
        id="new-password"
        label="New password"
        value={newPassword}
        onChange={setNewPassword}
        placeholder="At least 6 characters"
        autoComplete="new-password"
      />
      <div className="grid gap-1.5">
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
        />
        {mismatch && <p className="text-xs text-destructive">Passwords don't match.</p>}
      </div>
      <div>
        <Button type="submit" disabled={submitting || mismatch}>
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}

export default function AppSettingsPage() {
  const { theme, setTheme, textSize, setTextSize, collapsed, toggleCollapsed } = useApp();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const photoUrl = useMyPhotoUrl();
  const role = toDisplayRole(user);
  const { data: school } = useSchoolProfile(Boolean(user && user.role !== "SUPER_ADMIN"));
  const profilePath = PROFILE_PATH_FOR_ROLE[role];

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Personalise how the app looks and keep your account secure."
        breadcrumb={["Dashboard", "Settings"]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <SectionCard title="Appearance" subtitle="Saved on this device">
            <div className="divide-y divide-border">
              <SettingRow icon={Monitor} title="Theme" description="Light or dark interface.">
                <Segmented
                  label="Theme"
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: "light", label: "Light", icon: Sun },
                    { value: "dark", label: "Dark", icon: Moon },
                  ]}
                />
              </SettingRow>
              <SettingRow
                icon={Type}
                title="Text size"
                description="Scales text and spacing across the app."
              >
                <Segmented<TextSize>
                  label="Text size"
                  value={textSize}
                  onChange={setTextSize}
                  options={[
                    { value: "small", label: "Small" },
                    { value: "default", label: "Default" },
                    { value: "large", label: "Large" },
                  ]}
                />
              </SettingRow>
              <SettingRow
                icon={PanelLeftClose}
                title="Compact sidebar"
                description="Show only icons in the sidebar on large screens."
              >
                <Switch
                  checked={collapsed}
                  onCheckedChange={toggleCollapsed}
                  aria-label="Compact sidebar"
                />
              </SettingRow>
            </div>
          </SectionCard>

          <SectionCard
            title="Change password"
            subtitle="You'll use the new password next time you sign in"
          >
            <ChangePasswordForm />
          </SectionCard>
        </div>

        <div className="grid content-start gap-4">
          <SectionCard title="Account">
            <div className="flex items-center gap-3">
              <AccountAvatar
                name={user?.name ?? "?"}
                photoUrl={photoUrl}
                className="h-12 w-12 text-sm"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                <p className="mt-0.5 text-[11px] font-medium text-primary">{role}</p>
              </div>
            </div>
            {school?.name && (
              <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {school.name}
                {school.session ? ` · Session ${school.session}` : ""}
              </p>
            )}
            <div className="mt-4 grid gap-2">
              {profilePath && (
                <Button asChild variant="outline" className="justify-start gap-2">
                  <Link to={profilePath}>
                    <UserRound className="h-4 w-4" /> View my profile
                  </Link>
                </Button>
              )}
              <Button
                variant="outline"
                className="justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => {
                  logout();
                  navigate("/login", { replace: true });
                }}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
