import { ClearPageClient } from "@/app/clear/clear-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Fallback for when the topbar's Clear cache button isn't visible (stale
 * chunks, broken build, whatever). Typing `localhost:3000/clear` reaches
 * this page directly, which immediately runs the same wipe-and-reload
 * routine on mount and bounces you to "/".
 */
export default function ClearPage() {
  return <ClearPageClient />;
}
