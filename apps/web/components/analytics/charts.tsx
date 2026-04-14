"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMoneyShort } from "@/lib/format";

export const CHART_AXIS = {
  stroke: "var(--border)",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  tick: { fill: "var(--text-faint)" },
};

export const CHART_TOOLTIP = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

interface Sizable {
  readonly height?: number;
}

// ── Bankroll curve ──────────────────────────────────────────────────

interface BankrollRow {
  readonly t: string;
  readonly bankroll: number;
}

export function BankrollCurveChart({
  data,
  height = 256,
}: { readonly data: ReadonlyArray<BankrollRow> } & Sizable) {
  const mutable = data as BankrollRow[];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={mutable} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gBankInt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--profit)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--profit)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="t" {...CHART_AXIS} />
          <YAxis
            {...CHART_AXIS}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP}
            labelStyle={{ color: "var(--text-faint)" }}
            formatter={(v: number) => [formatMoney(v), "bankroll"]}
          />
          <Area
            type="monotone"
            dataKey="bankroll"
            stroke="var(--profit)"
            strokeWidth={2}
            fill="url(#gBankInt)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Profit by book ──────────────────────────────────────────────────

interface ProfitByBookRow {
  readonly name: string;
  readonly color: string;
  readonly profit: number;
  readonly roi: number;
  readonly count: number;
}

export function ProfitByBookChart({
  data,
  height = 256,
}: { readonly data: ReadonlyArray<ProfitByBookRow> } & Sizable) {
  const mutable = data as ProfitByBookRow[];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={mutable} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="name" {...CHART_AXIS} />
          <YAxis {...CHART_AXIS} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={CHART_TOOLTIP}
            formatter={(v: number) => [formatMoney(v), "profit"]}
          />
          <Bar dataKey="profit" radius={[3, 3, 0, 0]}>
            {data.map((b) => (
              <Cell
                key={b.name}
                fill={b.profit >= 0 ? "var(--profit)" : "var(--loss)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Bet size histogram ──────────────────────────────────────────────

interface HistogramRow {
  readonly label: string;
  readonly count: number;
}

export function HistogramChart({
  data,
  height = 224,
}: { readonly data: ReadonlyArray<HistogramRow> } & Sizable) {
  const mutable = data as HistogramRow[];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={mutable} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" {...CHART_AXIS} />
          <YAxis {...CHART_AXIS} />
          <Tooltip contentStyle={CHART_TOOLTIP} />
          <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── EV leak line ────────────────────────────────────────────────────

interface EvLeakRow {
  readonly t: string;
  readonly theoretical: number;
  readonly realized: number;
  readonly gap: number;
}

export function EvLeakChart({
  data,
  height = 256,
}: { readonly data: ReadonlyArray<EvLeakRow> } & Sizable) {
  const mutable = data as EvLeakRow[];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={mutable} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="t" {...CHART_AXIS} />
          <YAxis {...CHART_AXIS} tickFormatter={(v) => formatMoneyShort(v)} />
          <Tooltip
            contentStyle={CHART_TOOLTIP}
            formatter={(v: number, name: string) => [formatMoney(v), name]}
          />
          <Line
            type="monotone"
            dataKey="theoretical"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            name="Theoretical"
          />
          <Line
            type="monotone"
            dataKey="realized"
            stroke="var(--profit)"
            strokeWidth={2}
            dot={false}
            name="Realized"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Day × Hour heatmap ──────────────────────────────────────────────

export interface HeatCell {
  readonly profit: number;
  readonly count: number;
}

interface HeatmapProps {
  readonly heatmap: ReadonlyArray<ReadonlyArray<HeatCell>>;
  readonly maxAbs: number;
  readonly cellSize?: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function DayHourHeatmapChart({
  heatmap,
  maxAbs,
  cellSize = 20,
}: HeatmapProps) {
  return (
    <div className="flex flex-col gap-[3px]">
      <div className="flex items-center gap-1">
        <div className="w-8" aria-hidden />
        <div className="flex gap-[2px]">
          {HOURS.map((h) => (
            <div
              key={h}
              className="mono-num text-center text-[9px] text-text-faint"
              style={{ width: cellSize }}
            >
              {h % 3 === 0 ? h.toString().padStart(2, "0") : ""}
            </div>
          ))}
        </div>
      </div>
      {heatmap.map((row, day) => (
        <div key={day} className="flex items-center gap-1">
          <div className="mono-num w-8 text-[10px] uppercase tracking-wider text-text-faint">
            {DAYS[day]}
          </div>
          <div className="flex gap-[2px]">
            {row.map((cell, h) => {
              const { profit, count } = cell;
              const intensity = Math.min(1, Math.abs(profit) / maxAbs);
              const alpha = count === 0 ? 0 : 0.18 + intensity * 0.72;
              const background =
                count === 0
                  ? "var(--surface-sunken)"
                  : profit >= 0
                    ? `oklch(78% 0.17 152 / ${alpha})`
                    : `oklch(68% 0.22 25 / ${alpha})`;
              const borderColor = count === 0 ? "var(--border)" : "transparent";
              return (
                <div
                  key={h}
                  title={
                    count === 0
                      ? `${DAYS[day]} ${h}:00 — no bets`
                      : `${DAYS[day]} ${h}:00 — ${formatMoney(profit, { sign: true })} · ${count} bet${count === 1 ? "" : "s"}`
                  }
                  className="rounded-[3px] transition-transform hover:scale-[1.25]"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    background,
                    border: `1px solid ${borderColor}`,
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-3 flex items-center justify-between pl-9 text-[10px] text-text-faint">
        <span className="mono-num">{formatMoneyShort(-maxAbs)}</span>
        <div className="mx-3 flex h-1.5 flex-1 overflow-hidden rounded-full">
          <div
            className="flex-1"
            style={{
              background:
                "linear-gradient(90deg, oklch(68% 0.22 25 / 0.9), oklch(68% 0.22 25 / 0.2), var(--surface-sunken), oklch(78% 0.17 152 / 0.2), oklch(78% 0.17 152 / 0.9))",
            }}
          />
        </div>
        <span className="mono-num">{formatMoneyShort(maxAbs)}</span>
      </div>
    </div>
  );
}
