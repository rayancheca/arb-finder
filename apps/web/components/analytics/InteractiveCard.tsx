"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly layoutId: string;
  readonly preview: ReactNode;
  readonly children: ReactNode; // the drill-down content
  readonly className?: string;
  readonly previewClassName?: string;
  /**
   * Fixed pixel height for the preview area so every card in the analytics
   * grid aligns to a single baseline. Defaults to 260 — matches the chart
   * sizes used across all Phase H cards.
   */
  readonly previewHeight?: number;
}

/**
 * Wraps a preview card + a full-screen drill-down modal with a shared
 * layoutId so framer-motion does a FLIP animation from the small tile
 * into a center-of-screen expanded view. Includes a tiny pirouette
 * rotation on entry, soft spring physics, and proper accessibility via
 * radix Dialog.
 */
export function InteractiveCard({
  title,
  subtitle,
  layoutId,
  preview,
  children,
  className,
  previewClassName,
  previewHeight = 260,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <motion.button
            layoutId={`card-${layoutId}`}
            whileHover={{ y: -2, scale: 1.005 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              // `w-full` is critical — <button> is inline-block by default,
              // so without this every card collapses to content width in
              // grid cells and the analytics page looks like broken tiles.
              "group relative flex w-full flex-col overflow-hidden rounded-[12px] border border-border bg-surface text-left",
              "shadow-[0_0_0_0_rgba(0,0,0,0)] hover:shadow-[0_8px_30px_-15px_rgba(0,0,0,0.6)] hover:border-border-strong",
              "transition-colors",
              className,
            )}
          >
            <div className="flex items-start justify-between border-b border-border px-5 py-3">
              <div className="flex-1">
                <motion.h3
                  layoutId={`title-${layoutId}`}
                  className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-dim"
                >
                  {title}
                </motion.h3>
                {subtitle && (
                  <p className="mt-0.5 text-[10px] text-text-faint">
                    {subtitle}
                  </p>
                )}
              </div>
              <Maximize2 className="h-3.5 w-3.5 text-text-faint opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <motion.div
              layoutId={`preview-${layoutId}`}
              style={{ height: previewHeight }}
              className={cn(
                "flex flex-col justify-center overflow-hidden p-5",
                previewClassName,
              )}
            >
              {preview}
            </motion.div>
          </motion.button>
        </Dialog.Trigger>

        <AnimatePresence>
          {open && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-md"
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div
                  layoutId={`card-${layoutId}`}
                  initial={{ rotate: 0 }}
                  animate={{ rotate: [0, 2, -2, 0] }}
                  transition={{
                    layout: { type: "spring", stiffness: 260, damping: 28 },
                    rotate: { duration: 0.6, delay: 0.05 },
                  }}
                  className={cn(
                    "fixed left-1/2 top-1/2 z-50 w-[min(1100px,94vw)]",
                    "max-h-[90vh] -translate-x-1/2 -translate-y-1/2",
                    "overflow-hidden rounded-[16px] border border-border-strong bg-surface",
                    "shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]",
                  )}
                >
                  <div className="flex items-start justify-between border-b border-border px-7 py-5">
                    <div>
                      <motion.h2
                        layoutId={`title-${layoutId}`}
                        className="text-[20px] font-semibold tracking-tighter text-text"
                      >
                        {title}
                      </motion.h2>
                      {subtitle && (
                        <Dialog.Description className="mt-1 text-[12px] text-text-dim">
                          {subtitle}
                        </Dialog.Description>
                      )}
                    </div>
                    <Dialog.Close asChild>
                      <button
                        aria-label="Close"
                        className="rounded-md p-1.5 text-text-faint hover:bg-surface-raised hover:text-text"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.3 }}
                    className="max-h-[calc(90vh-80px)] overflow-y-auto p-6"
                  >
                    {children}
                  </motion.div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </>
  );
}
