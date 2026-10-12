"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Camera } from "lucide-react";
import { Initials } from "@/components/shared/ui-kit";
import { useGalleryPhoto } from "@/hooks/useGalleryPhoto";

/** Gradient banner used at the top of every "My Profile" page: photo, name and status line. */
export function ProfileHero({
  name,
  photoUrl,
  onPhotoChange,
  lines,
  badges,
  stats,
}: {
  name: string;
  photoUrl: string;
  onPhotoChange: (url: string) => void;
  lines: ReactNode;
  badges?: ReactNode;
  /** Up to three quick facts shown in a frosted strip along the bottom of the banner. */
  stats?: { label: string; value: ReactNode }[];
}) {
  const [photoError, setPhotoError] = useState(false);
  useEffect(() => setPhotoError(false), [photoUrl]);

  const { openGallery, fileInputRef, handleFileChange } = useGalleryPhoto((url) => {
    onPhotoChange(url);
    setPhotoError(false);
  });

  return (
    <div className="relative mb-4 overflow-hidden rounded-3xl border border-border shadow-[var(--shadow-soft)]">
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(135deg,var(--hero-sky)_0%,var(--hero)_100%)]"
      />
      <div aria-hidden className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10" />
      <div
        aria-hidden
        className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-white/10"
      />

      <div className="relative flex flex-col gap-3 px-4 pt-6 pb-4 text-white sm:flex-row sm:items-center sm:gap-4 sm:p-6">
        <div className="relative shrink-0 self-center sm:self-auto">
          {photoUrl && !photoError ? (
            <img
              src={photoUrl}
              alt={name}
              onError={() => setPhotoError(true)}
              className="h-24 w-24 rounded-full object-cover shadow-lg ring-4 ring-white/70 ring-offset-2 ring-offset-transparent"
            />
          ) : (
            <Initials
              name={name}
              className="h-24 w-24 bg-white/20 text-2xl text-white shadow-lg ring-4 ring-white/70"
            />
          )}
          <button
            type="button"
            onClick={openGallery}
            aria-label="Choose photo from gallery"
            className="absolute -right-1 -bottom-1 grid h-8 w-8 place-items-center rounded-full bg-white text-primary shadow-md transition-transform hover:scale-105 active:scale-95"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="font-display text-xl font-bold sm:text-2xl">{name}</h2>
          {lines}
          {badges && (
            <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {badges}
            </div>
          )}
        </div>
      </div>

      {stats && stats.length > 0 && (
        <div
          className="relative mx-3 mb-3 grid divide-x divide-white/20 rounded-2xl bg-white/15 py-2.5 text-center text-white backdrop-blur-sm sm:mx-6 sm:mb-6 sm:max-w-md"
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 px-2">
              <p className="truncate font-display text-base font-bold leading-tight">{s.value}</p>
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-white/75">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
