"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

export function TopBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-[7px] border border-border bg-surface px-2.5 py-1.5 text-[12px] text-text-dim w-[280px]">
          <Search className="h-3.5 w-3.5" />
          <span>Search games, teams, markets…</span>
          <span className="ml-auto mono-num rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-faint">
            ⌘K
          </span>
        </div>
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
          <span className="mono-num text-text">
            {now.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
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
