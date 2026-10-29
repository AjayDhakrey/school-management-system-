"use client";

import { useEffect, useState } from "react";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import { Initials } from "@/components/shared/ui-kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useGalleryPhoto } from "@/hooks/useGalleryPhoto";

/** The "Photo" field inside a profile's editable form — pairs with ProfileHero above it. */
export function PhotoField({
  id,
  name,
  photoUrl,
  onPhotoChange,
}: {
  id: string;
  name: string;
  photoUrl: string;
  onPhotoChange: (url: string) => void;
}) {
  const [photoError, setPhotoError] = useState(false);
  useEffect(() => setPhotoError(false), [photoUrl]);

  const { openGallery, fileInputRef, handleFileChange } = useGalleryPhoto((url) => {
    onPhotoChange(url);
    setPhotoError(false);
  });

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        <Camera className="mr-1 inline h-3.5 w-3.5" />
        Photo
      </Label>
      {photoUrl.startsWith("data:") ? (
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <img src={photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            Photo selected from your device
          </span>
          <button
            type="button"
            onClick={openGallery}
            className="shrink-0 text-xs font-semibold text-primary hover:underline"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => onPhotoChange("")}
            aria-label="Remove photo"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2.5">
          {photoUrl && !photoError ? (
            <img
              src={photoUrl}
              alt=""
              onError={() => setPhotoError(true)}
              className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <Initials name={name} className="h-9 w-9" />
          )}
          <Input
            id={id}
            value={photoUrl}
            onChange={(e) => onPhotoChange(e.target.value)}
            placeholder="https://… or choose from gallery"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={openGallery}
            aria-label="Choose photo from gallery"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
