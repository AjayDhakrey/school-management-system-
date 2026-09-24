"use client";

import { useEffect, useState } from "react";
import { Initials } from "@/components/shared/ui-kit";
import { cn } from "@/lib/utils";

/** Initials avatar that swaps in the signed-in user's own photo when they've set one. */
export function AccountAvatar({
  name,
  photoUrl,
  className = "",
}: {
  name: string;
  photoUrl?: string | null | undefined;
  className?: string | undefined;
}) {
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [photoUrl]);

  if (photoUrl && !error) {
    return (
      <img
        src={photoUrl}
        alt={name}
        onError={() => setError(true)}
        className={cn("h-9 w-9 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return <Initials name={name} className={className} />;
}
