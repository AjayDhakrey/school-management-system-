"use client";

import { ChevronRight, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { IconTile } from "@/components/shared/ProfileTiles";
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
    <section className={cn("panel mt-4 overflow-hidden shadow-md shadow-gray-300", className)}>
      <button
        type="button"
        onClick={handleSignOut}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-destructive/5 active:bg-destructive/10"
      >
        <IconTile icon={LogOut} tone="danger" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-destructive">Log Out</span>
          <span className="block truncate text-xs text-muted-foreground">
            Signed in as {user?.name ?? "you"} · you'll need to sign in again
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </section>
  );
}
