"use client";

import { Delete } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Big on-screen numeric keypad for the POS register. Melons are read off a scale
 * and typed in; a keypad gives large touch targets and — unlike a native numeric
 * input on an ID-locale tablet — no decimal-comma ambiguity (always a dot).
 *
 * Purely controlled: it mutates a numeric STRING (so a trailing "." while the
 * user types is preserved). The parent parses with Number() at use time.
 */
export function NumpadInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  function press(k: string) {
    if (k === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (k === ".") {
      if (value.includes(".")) return;
      onChange(value === "" ? "0." : value + ".");
      return;
    }
    // A leading zero is replaced by the first real digit ("0" then "5" → "5"),
    // but "0." is preserved by the branch above.
    if (value === "0") {
      onChange(k);
      return;
    }
    onChange(value + k);
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          aria-label={k === "back" ? "Backspace" : k}
          className={cn(
            "flex h-14 items-center justify-center rounded-lg border bg-background text-xl font-semibold",
            "transition active:scale-95 hover:bg-muted",
          )}
        >
          {k === "back" ? <Delete className="h-5 w-5" /> : k}
        </button>
      ))}
    </div>
  );
}
