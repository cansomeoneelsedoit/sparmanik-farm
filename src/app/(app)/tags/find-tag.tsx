"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findTagByLabel } from "@/app/(app)/tags/actions";

/**
 * Jump straight to a plant by typing its stake number (A012-001) — the
 * no-scanning way to open a plant page from a desk.
 */
export function FindTag({ greenhouseId }: { greenhouseId: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  function go() {
    if (!q.trim()) return;
    start(async () => {
      const r = await findTagByLabel(greenhouseId, q);
      if (r.ok && r.data) router.push(`/t/${r.data.code}`);
      else if (!r.ok) toast.error(r.error);
    });
  }

  return (
    <form
      className="flex w-full max-w-sm items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a plant… e.g. A012-001"
        className="h-10 font-mono uppercase placeholder:font-sans placeholder:normal-case"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      <Button type="submit" className="h-10 shrink-0" disabled={pending || !q.trim()}>
        <Search className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only sm:ml-1">{pending ? "…" : "Open"}</span>
      </Button>
    </form>
  );
}
