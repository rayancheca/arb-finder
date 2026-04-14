"use client";

import { useEffect } from "react";

/**
 * Listens for j/k/enter on the dashboard. Walks every element with
 * `data-arb-row`, applies a soft focus outline to the current one, and
 * navigates to the opp detail on Enter. Cleanly ignores input/textarea
 * keystrokes so typing in TopBar search doesn't break.
 */
export function DashboardKeyboardNav() {
  useEffect(() => {
    let current = -1;

    function rows(): HTMLElement[] {
      return Array.from(
        document.querySelectorAll<HTMLElement>("[data-arb-row]"),
      );
    }

    function highlight(idx: number) {
      const all = rows();
      all.forEach((el, i) => {
        el.classList.toggle("ring-2", i === idx);
        el.classList.toggle("ring-accent", i === idx);
        el.classList.toggle("ring-offset-0", i === idx);
      });
      if (idx >= 0 && all[idx]) {
        all[idx].scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const all = rows();
      if (all.length === 0) return;

      if (e.key === "j") {
        e.preventDefault();
        current = Math.min(all.length - 1, current + 1);
        highlight(current);
      } else if (e.key === "k") {
        e.preventDefault();
        current = Math.max(0, current - 1);
        highlight(current);
      } else if (e.key === "Enter") {
        const el = current >= 0 ? all[current] : undefined;
        const href = el?.getAttribute("href");
        if (href) {
          e.preventDefault();
          window.location.href = href;
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
