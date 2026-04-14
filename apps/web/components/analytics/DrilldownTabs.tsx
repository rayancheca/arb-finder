"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { BarChart3, Database, Table as TableIcon } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Tab {
  readonly value: string;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly content: ReactNode;
}

interface Props {
  readonly tabs: ReadonlyArray<Tab>;
  readonly defaultValue?: string;
}

export const CHART_ICON = BarChart3;
export const TABLE_ICON = TableIcon;
export const RAW_ICON = Database;

export function DrilldownTabs({ tabs, defaultValue }: Props) {
  const first = tabs[0]?.value ?? "chart";
  return (
    <TabsPrimitive.Root
      defaultValue={defaultValue ?? first}
      className="flex flex-col gap-5"
    >
      <TabsPrimitive.List className="flex gap-1 rounded-[8px] border border-border bg-surface-sunken p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <TabsPrimitive.Trigger
              key={t.value}
              value={t.value}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-[6px] px-4 py-2 text-[12px] font-medium transition-colors",
                "text-text-dim hover:text-text",
                "data-[state=active]:bg-surface-raised data-[state=active]:text-text",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </TabsPrimitive.Trigger>
          );
        })}
      </TabsPrimitive.List>
      {tabs.map((t) => (
        <TabsPrimitive.Content
          key={t.value}
          value={t.value}
          className="focus:outline-none"
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {t.content}
          </motion.div>
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
