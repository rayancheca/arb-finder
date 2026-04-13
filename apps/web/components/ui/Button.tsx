import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "primary" | "ghost" | "danger" | "profit";
  readonly size?: "sm" | "md" | "lg";
  readonly icon?: ReactNode;
}

export function Button({
  variant = "ghost",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[7px] border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-accent/40 bg-accent-bg text-accent hover:bg-accent/20 hover:border-accent/60",
        variant === "ghost" &&
          "border-border bg-surface text-text-dim hover:border-border-strong hover:text-text hover:bg-surface-raised",
        variant === "danger" &&
          "border-loss/30 bg-loss-bg text-loss hover:bg-loss/15",
        variant === "profit" &&
          "border-profit/40 bg-profit-bg text-profit hover:bg-profit/15",
        size === "sm" && "px-2.5 py-1 text-[11px]",
        size === "md" && "px-3.5 py-1.5 text-[12px]",
        size === "lg" && "px-5 py-2.5 text-[13px]",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
