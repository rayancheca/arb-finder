"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Flame,
  Search,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";

const PRIMARY = [
  { href: "/", label: "Dash", icon: Activity },
  { href: "/search", label: "Search", icon: Search },
  { href: "/boosts", label: "Boosts", icon: Flame },
  { href: "/bankroll", label: "Bank", icon: Wallet },
  { href: "/analytics", label: "Stats", icon: BarChart3 },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-surface-sunken/95 backdrop-blur md:hidden">
      {PRIMARY.map((item) => {
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
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[9px] font-medium",
              active ? "text-accent" : "text-text-dim",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
            <span className="uppercase tracking-[0.06em]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
