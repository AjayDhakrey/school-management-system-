"use client";

import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

/** Sign-out row for the profile/settings pages — phones have no account menu in the header. */
export function SignOutCard({ className }: { className?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleSignOut() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <SectionCard
      title="Account"
      subtitle="Sign out of this device"
      className={cn("mt-4", className)}
    >
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive-soft text-destructive">
            <LogOut className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user?.name ?? "Signed in"}</p>
            <p className="truncate text-xs text-muted-foreground">
              You will need to sign in again to continue.
            </p>
          </div>
        </div>
        <Button type="button" variant="destructive" onClick={handleSignOut} className="shrink-0">
          Log Out
        </Button>
      </div>
    </SectionCard>
  );
}
