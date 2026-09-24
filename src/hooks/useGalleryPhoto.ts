import { useRef } from "react";
import { toast } from "sonner";

/** Opens the device gallery/file picker and hands back a data URL for the chosen image. */
export function useGalleryPhoto(onSelect: (dataUrl: string) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openGallery() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onSelect(reader.result);
    };
    reader.onerror = () => toast.error("Could not read that image");
    reader.readAsDataURL(file);
  }

  return { openGallery, fileInputRef, handleFileChange };
}
