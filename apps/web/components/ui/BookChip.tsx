import { cn } from "@/lib/cn";

interface BookChipProps {
  readonly name: string;
  readonly color: string;
  readonly size?: "sm" | "md";
}

export function BookChip({ name, color, size = "sm" }: BookChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-surface-sunken px-2 py-0.5 font-medium text-text-dim",
        size === "sm" ? "text-[10px]" : "text-[12px]",
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}aa` }}
      />
      {name}
    </span>
  );
}
