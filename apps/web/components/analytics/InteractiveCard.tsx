"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  /**
   * Stable identifier — no longer used for framer-motion layoutId (which
   * was producing broken animations in grid-cell children) but still kept
   * on the API so callers don't have to change. Could be removed later.
   */
  readonly layoutId?: string;
  readonly preview: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly previewClassName?: string;
  readonly previewHeight?: number;
}

/**
 * Clickable card that opens a full-screen drill-down modal.
 *
 * Previous iteration used framer-motion `layoutId` to FLIP-morph the tile
 * into the modal. That was broken in grid cells: the target modal was
 * `position: fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`,
 * and framer-motion's layout math produced a wrong bounding box during
 * the morph, landing the modal in the bottom-right corner with a weird
 * scale. The layoutId on the inner preview compounded the problem.
 *
 * This version:
 *  - No shared layoutId, no FLIP.
 *  - Card has its own hover/press micro-animation.
 *  - Modal opens with a clean scale-from-center + pirouette.
 *  - Proper radix Dialog.Title for accessibility (no more DialogContent
 *    requires DialogTitle console warnings).
 */
export function InteractiveCard({
  title,
  subtitle,
  preview,
  children,
  className,
  previewClassName,
  previewHeight = 260,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <motion.button
          type="button"
          whileHover={{ y: -2, scale: 1.005 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={cn(
            "group relative flex w-full flex-col overflow-hidden rounded-[12px] border border-border bg-surface text-left",
            "shadow-[0_0_0_0_rgba(0,0,0,0)] hover:shadow-[0_8px_30px_-15px_rgba(0,0,0,0.6)] hover:border-border-strong",
            "transition-colors",
            className,
          )}
        >
          <div className="flex items-start justify-between border-b border-border px-5 py-3">
            <div className="flex-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-dim">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-0.5 text-[10px] text-text-faint">
                  {subtitle}
                </p>
              )}
            </div>
            <Maximize2 className="h-3.5 w-3.5 text-text-faint opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div
            style={{ height: previewHeight }}
            className={cn(
              "flex flex-col justify-center overflow-hidden p-5",
              previewClassName,
            )}
          >
            {preview}
          </div>
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
            {/*
              Wrap the Dialog.Content in a centered flex container. This
              avoids the positioning bug where `fixed left-1/2 top-1/2 +
              translate` interacts poorly with framer-motion transforms.
            */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <Dialog.Content asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    rotate: [0, 1.5, -1.5, 0],
                  }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{
                    opacity: { duration: 0.2 },
                    scale: { type: "spring", stiffness: 260, damping: 26 },
                    rotate: { duration: 0.6, delay: 0.1 },
                  }}
                  className={cn(
                    "relative w-[min(1100px,94vw)] max-h-[90vh]",
                    "overflow-hidden rounded-[16px] border border-border-strong bg-surface",
                    "shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]",
                  )}
                >
                  <div className="flex items-start justify-between border-b border-border px-7 py-5">
                    <div>
                      <Dialog.Title className="text-[20px] font-semibold tracking-tighter text-text">
                        {title}
                      </Dialog.Title>
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
                    className="max-h-[calc(90vh-92px)] overflow-y-auto p-6"
                  >
                    {children}
                  </motion.div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
