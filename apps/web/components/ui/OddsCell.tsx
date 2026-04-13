import { formatOdds } from "@/lib/format";
import { cn } from "@/lib/cn";

interface OddsCellProps {
  readonly odds: number;
  readonly size?: "sm" | "md" | "lg";
  readonly tone?: "auto" | "neutral";
}

export function OddsCell({ odds, size = "md", tone = "auto" }: OddsCellProps) {
  const positive = odds > 0;
  const textClass =
    tone === "neutral"
      ? "text-text"
      : positive
        ? "text-profit"
        : "text-text";
  const sizeClass =
    size === "sm"
      ? "text-[12px]"
      : size === "lg"
        ? "text-[22px] font-semibold tracking-tight"
        : "text-[14px] font-medium";

  return (
    <span className={cn("mono-num", sizeClass, textClass)}>
      {formatOdds(odds)}
    </span>
  );
}
