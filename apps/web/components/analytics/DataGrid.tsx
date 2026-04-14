"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  readonly key: keyof T | string;
  readonly header: string;
  readonly align?: "left" | "right" | "center";
  readonly width?: string;
  readonly render?: (row: T) => React.ReactNode;
  readonly sortAccessor?: (row: T) => number | string;
  readonly mono?: boolean;
}

interface Props<T> {
  readonly columns: ReadonlyArray<Column<T>>;
  readonly rows: ReadonlyArray<T>;
  readonly defaultSortKey?: string;
  readonly defaultSortDir?: "asc" | "desc";
  readonly emptyText?: string;
}

export function DataGrid<T>({
  columns,
  rows,
  defaultSortKey,
  defaultSortDir = "desc",
  emptyText = "No data",
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => String(c.key) === sortKey);
    if (!col) return rows;
    const accessor =
      col.sortAccessor ??
      ((row: T) => (row as Record<string, unknown>)[String(col.key)] as number | string);
    return [...rows].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [rows, columns, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[9px] border border-border bg-surface-sunken py-12 text-center text-[12px] text-text-faint">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[9px] border border-border bg-surface-sunken">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface">
            {columns.map((col) => {
              const keyStr = String(col.key);
              const active = sortKey === keyStr;
              return (
                <th
                  key={keyStr}
                  onClick={() => handleSort(keyStr)}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "cursor-pointer select-none px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-dim transition-colors hover:text-text",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {active &&
                      (sortDir === "desc" ? (
                        <ArrowDown className="h-2.5 w-2.5" />
                      ) : (
                        <ArrowUp className="h-2.5 w-2.5" />
                      ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr
              // Stable row key: combine every column value so the row
              // maintains identity across re-sorts. Falls back to idx
              // only if all columns render to empty strings.
              key={
                columns
                  .map((c) =>
                    String((row as Record<string, unknown>)[String(c.key)] ?? ""),
                  )
                  .join("|") || String(idx)
              }
              className="border-b border-border last:border-b-0 hover:bg-surface/60"
            >
              {columns.map((col) => {
                const keyStr = String(col.key);
                const raw = col.render
                  ? col.render(row)
                  : String(
                      (row as Record<string, unknown>)[String(col.key)] ?? "",
                    );
                return (
                  <td
                    key={keyStr}
                    className={cn(
                      "px-4 py-2.5 text-[12px] text-text",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.mono && "mono-num",
                    )}
                  >
                    {raw}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
