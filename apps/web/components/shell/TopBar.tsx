"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

export function TopBar() {
  // Null until client-hydrates to avoid server/client clock mismatches
  // (SSR renders one time, client renders a slightly-later time → warn).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function openPalette() {
    // CommandPalette listens for ⌘K on window. Synthesize the same event
    // so clicks on the fake search field route through a single code path.
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      }),
    );
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={openPalette}
          className="flex items-center gap-2 rounded-[7px] border border-border bg-surface px-2.5 py-1.5 text-[12px] text-text-dim transition-colors hover:border-border-strong hover:text-text w-[280px]"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search games, teams, markets…</span>
          <span className="ml-auto mono-num rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-faint">
            ⌘K
          </span>
        </button>
      </div>

      <div className="flex items-center gap-5 text-[11px]">
        <div className="flex items-center gap-1.5 text-text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-profit animate-pulse" />
          <span className="font-medium uppercase tracking-[0.1em] text-text-faint">
            live
          </span>
          <span className="mono-num text-text">5m poll</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5 text-text-dim">
          <span className="uppercase tracking-[0.1em] text-text-faint">
            now
          </span>
          <span className="mono-num text-text tabular-nums">
            {now
              ? now.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                })
              : "--:--:--"}
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="text-text-faint">
          <span className="text-text-dim">Rayan</span>
        </div>
      </div>
    </header>
  );
}
