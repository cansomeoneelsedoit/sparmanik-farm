"use client";

import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * <img> wrapper that gracefully falls back to a placeholder when the
 * underlying file 404s. Used everywhere we render an upload that *might*
 * be gone (e.g. items imported from prod whose photos didn't make it
 * over) so the page doesn't flash a broken-image icon.
 *
 * Renders a `<div>` placeholder with a Lucide ImageIcon if `src` is null
 * OR the image fails to load.
 */
export function SmartImage({
  src,
  alt,
  className,
  fallbackClassName,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground/40",
          className,
          fallbackClassName,
        )}
        aria-label={alt}
      >
        <ImageIcon className="h-1/3 w-1/3" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setErrored(true)}
      loading="lazy"
    />
  );
}
