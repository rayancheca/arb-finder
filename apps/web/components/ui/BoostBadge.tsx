import { Flame } from "lucide-react";
import { cn } from "@/lib/cn";

const LABELS: Record<string, string> = {
  standard: "",
  free_bet: "Free Bet",
  no_sweat: "No Sweat",
  site_credit: "Site Credit",
  profit_boost: "Profit Boost",
};

interface BoostBadgeProps {
  readonly type: string;
  readonly compact?: boolean;
}

export function BoostBadge({ type, compact = false }: BoostBadgeProps) {
  if (type === "standard") return null;
  const label = LABELS[type] ?? type;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border border-boost/40 bg-boost-bg text-boost",
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
        "font-semibold uppercase tracking-[0.08em]",
      )}
    >
      <Flame className="h-2.5 w-2.5" strokeWidth={2.5} />
      {label}
    </span>
  );
}
