"use client";

import { useRouter } from "next/navigation";

/**
 * Category chip rendered inside an item card. The card itself wraps in a
 * <Link>; nesting another <a> inside that triggers the React invalid-HTML
 * warning ("In HTML, <a> cannot be a descendant of <a>") and aborts
 * client-side navigation, so every category click hard-reloads. Using a
 * <button> with `router.push` instead keeps it accessible and lets the
 * SPA router take over.
 *
 * `e.stopPropagation()` prevents the surrounding card's Link from also
 * firing — staff would otherwise land on the item detail instead of the
 * filtered category list.
 */
export function CategoryChipLink({ name }: { name: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        router.push(`/inventory?cat=${encodeURIComponent(name)}`);
      }}
      className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:border-accent hover:text-foreground"
      title={`Filter to category "${name}"`}
    >
      {name}
    </button>
  );
}
