"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const nowDark = !isDark;
    setIsDark(nowDark);
    if (nowDark) {
      document.documentElement.classList.add("dark");
      try { localStorage.setItem("sf-theme", "dark"); } catch {}
    } else {
      document.documentElement.classList.remove("dark");
      try { localStorage.setItem("sf-theme", "light"); } catch {}
    }
  }

  return (
    <Button size="icon" variant="ghost" onClick={toggle} title={isDark ? "Light mode" : "Dark mode"}>
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
