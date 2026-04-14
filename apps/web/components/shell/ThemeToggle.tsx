"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "arb-finder:theme:v1";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as "dark" | "light" | null;
    const next = stored ?? "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={cn(
        "relative inline-flex h-8 w-16 items-center rounded-full border transition-colors",
        "border-border bg-surface-raised hover:border-border-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] flex h-6 w-6 items-center justify-center rounded-full bg-surface shadow-sm transition-transform",
          theme === "dark" ? "translate-x-[4px]" : "translate-x-[34px]",
        )}
      >
        {theme === "dark" ? (
          <Moon className="h-3 w-3 text-accent" />
        ) : (
          <Sun className="h-3 w-3 text-boost" />
        )}
      </span>
    </button>
  );
}
