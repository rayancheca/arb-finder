"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Flame,
  LineChart,
  Search,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/search", label: "Search", icon: Search },
  { href: "/boosts", label: "Boosts", icon: Flame },
  { href: "/bankroll", label: "Bankroll", icon: Wallet },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[228px] shrink-0 flex-col border-r border-border bg-surface-sunken">
      <div className="px-6 pt-7 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="relative h-7 w-7 rounded-[6px] bg-gradient-to-br from-accent to-profit">
            <LineChart className="absolute inset-0 m-auto h-4 w-4 text-bg" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tighter text-text">
              arb-finder
            </span>
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-faint">
              terminal v0.1
            </span>
          </div>
        </div>
      </div>

      <nav className="flex flex-col px-3 pb-3">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-[7px] px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-surface-raised text-text"
                  : "text-text-dim hover:bg-surface hover:text-text",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-accent" />
              )}
              <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-6 pb-6">
        <div className="rounded-[8px] border border-border bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-text-faint">
              Bankroll
            </span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-profit shadow-[0_0_6px_1px_var(--profit)]" />
          </div>
          <div className="mt-1.5 mono-num text-[18px] font-semibold tracking-tight text-text">
            $10,950
          </div>
          <div className="mt-0.5 mono-num text-[11px] text-profit">
            +$218.45 · today
          </div>
        </div>
      </div>
    </aside>
  );
}
