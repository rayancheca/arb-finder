"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Flame,
  Search,
  Settings,
  Upload,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Route {
  readonly label: string;
  readonly href: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly hint: string;
}

const ROUTES: ReadonlyArray<Route> = [
  { label: "Dashboard", href: "/", icon: Activity, hint: "Live arb ranking" },
  { label: "Search", href: "/search", icon: Search, hint: "Team / event lookup" },
  { label: "Boosts", href: "/boosts", icon: Flame, hint: "Active promos" },
  { label: "Bankroll", href: "/bankroll", icon: Wallet, hint: "Kelly + risk-of-ruin" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, hint: "60-day P&L" },
  { label: "Import", href: "/import", icon: Upload, hint: "Upload Excel history" },
  { label: "Settings", href: "/settings", icon: Settings, hint: "Scraper health + preferences" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-bg/70 pt-[15vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[min(560px,92vw)] overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Command palette" className="flex flex-col">
              <Command.Input
                placeholder="Jump to…"
                className="w-full border-b border-border bg-transparent px-5 py-4 text-[14px] outline-none placeholder:text-text-faint"
              />
              <Command.List className="max-h-[400px] overflow-y-auto p-2">
                <Command.Empty className="px-4 py-6 text-center text-[12px] text-text-faint">
                  No matches
                </Command.Empty>
                <Command.Group heading="Routes">
                  {ROUTES.map((r) => {
                    const Icon = r.icon;
                    return (
                      <Command.Item
                        key={r.href}
                        value={`${r.label} ${r.hint}`}
                        onSelect={() => {
                          router.push(r.href);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5",
                          "data-[selected=true]:bg-surface-raised",
                        )}
                      >
                        <Icon className="h-4 w-4 text-text-dim" />
                        <div className="flex-1">
                          <div className="text-[13px] text-text">{r.label}</div>
                          <div className="text-[10px] text-text-faint">
                            {r.hint}
                          </div>
                        </div>
                        <span className="mono-num text-[9px] text-text-faint">
                          {r.href}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              </Command.List>
              <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-text-faint">
                <span>↵ to open · esc to close</span>
                <span className="mono-num">⌘K</span>
              </div>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
