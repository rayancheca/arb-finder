import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatBlockProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly delta?: string;
  readonly deltaTone?: "profit" | "loss" | "neutral";
  readonly sparkline?: ReactNode;
  readonly accent?: boolean;
}

export function StatBlock({
  label,
  value,
  delta,
  deltaTone = "neutral",
  sparkline,
  accent = false,
}: StatBlockProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px] border border-border bg-surface p-5 transition-colors hover:bg-surface-raised",
        accent && "border-accent/30",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint">
          {label}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="mono-num text-[26px] font-semibold leading-none tracking-tight text-text">
          {value}
        </span>
      </div>
      {(delta || sparkline) && (
        <div className="mt-3 flex items-center justify-between gap-3">
          {delta && (
            <span
              className={cn(
                "mono-num text-[11px] font-medium",
                deltaTone === "profit" && "text-profit",
                deltaTone === "loss" && "text-loss",
                deltaTone === "neutral" && "text-text-dim",
              )}
            >
              {delta}
            </span>
          )}
          {sparkline && (
            <div className="ml-auto h-7 w-24 text-text-faint">{sparkline}</div>
          )}
        </div>
      )}
    </div>
  );
}
