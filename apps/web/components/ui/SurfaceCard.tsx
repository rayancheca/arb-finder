import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SurfaceCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  readonly title?: ReactNode;
  readonly subtitle?: ReactNode;
  readonly action?: ReactNode;
  readonly pad?: boolean;
  readonly muted?: boolean;
}

export function SurfaceCard({
  title,
  subtitle,
  action,
  pad = true,
  muted = false,
  className,
  children,
  ...rest
}: SurfaceCardProps) {
  return (
    <section
      {...rest}
      className={cn(
        "relative rounded-[10px] border border-border bg-surface",
        muted && "bg-surface-sunken",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-border px-5 pb-3 pt-4">
          <div>
            {title && (
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-text-dim">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-text-faint">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={cn(pad && "p-5")}>{children}</div>
    </section>
  );
}
