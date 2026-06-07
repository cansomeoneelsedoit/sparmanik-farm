"use client";

import { useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Read the current dark-mode state from the document.documentElement
 * class. `useSyncExternalStore` is the idiomatic way to mirror an
 * external state into React without the React 19 `set-state-in-effect`
 * lint warning that fires when you `setState` inside a `useEffect`.
 *
 * The bootstrap script in root layout.tsx sets the class before React
 * hydrates, so the first read is correct and we don't need to subscribe
 * to any DOM mutation — only the click handler toggles the class.
 */
function useDark(): [boolean, (next: boolean) => void] {
  const isDark = useSyncExternalStore(
    () => () => {},
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  // Local mirror so the icon flips immediately on click without waiting
  // for the next render cycle.
  const [, force] = useState(0);
  function set(next: boolean) {
    if (next) {
      document.documentElement.classList.add("dark");
      try {
        localStorage.setItem("sf-theme", "dark");
      } catch {}
    } else {
      document.documentElement.classList.remove("dark");
      try {
        localStorage.setItem("sf-theme", "light");
      } catch {}
    }
    force((n) => n + 1);
  }
  return [isDark, set];
}

export function ThemeToggle() {
  const [isDark, setDark] = useDark();
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => setDark(!isDark)}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
