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
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { StatBlock } from "@/components/ui/StatBlock";
import { Sparkline } from "@/components/ui/Sparkline";
import {
  computeEvLeak,
  computeSlippageByBook,
} from "@/lib/analytics-derivations";
import { formatMoney, formatMoneyShort, formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";

interface BetRow {
  id: string;
  bookId: string;
  stake: number;
  profit: number;
  result: string;
  boostType: string;
  placedAt: string; // ISO
  americanOdds?: number | null;
  evAtPlacement?: number | null;
}

interface BookLite {
  id: string;
  name: string;
  color: string;
}

interface Props {
  readonly bets: ReadonlyArray<BetRow>;
  readonly books: ReadonlyArray<BookLite>;
}

const AXIS = {
  stroke: "var(--border)",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  tick: { fill: "var(--text-faint)" },
};

export function AnalyticsClient({ bets, books }: Props) {
  const bookById = new Map(books.map((b) => [b.id, b]));

  const totalProfit = bets.reduce((a, b) => a + b.profit, 0);
  const totalStaked = bets.reduce((a, b) => a + b.stake, 0);
  const won = bets.filter((b) => b.result === "won").length;
  const lost = bets.filter((b) => b.result === "lost").length;
  const winRate = bets.length > 0 ? won / bets.length : 0;
  const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;
  const avgBetSize = bets.length > 0 ? totalStaked / bets.length : 0;

  // Bankroll curve
  const sorted = [...bets].sort(
    (a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime(),
  );
  let running = 8000;
  const bankrollSeries = sorted.map((b) => {
    running += b.profit;
    return {
      t: new Date(b.placedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      bankroll: running,
    };
  });
  if (bankrollSeries.length > 0) {
    bankrollSeries.unshift({ t: "start", bankroll: 8000 });
  }

  // Profit by book
  const profitByBook = books
    .map((b) => {
      const bookBets = bets.filter((x) => x.bookId === b.id);
      const p = bookBets.reduce((a, x) => a + x.profit, 0);
      const s = bookBets.reduce((a, x) => a + x.stake, 0);
      return {
        name: b.name,
        color: b.color,
        profit: Number(p.toFixed(2)),
        roi: s > 0 ? p / s : 0,
        count: bookBets.length,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  // Profit by boost type
  const boostTypes = ["standard", "free_bet", "no_sweat", "site_credit"];
  const profitByBoost = boostTypes.map((t) => {
    const sub = bets.filter((b) => b.boostType === t);
    const profit = sub.reduce((a, b) => a + b.profit, 0);
    return {
      name:
        t === "standard"
          ? "Standard"
          : t === "free_bet"
            ? "Free Bet"
            : t === "no_sweat"
              ? "No Sweat"
              : "Site Credit",
      profit: Number(profit.toFixed(2)),
      count: sub.length,
    };
  });

  // Bet size histogram
  const sizeBuckets = [
    { label: "<$50", min: 0, max: 49 },
    { label: "$50", min: 50, max: 99 },
    { label: "$100", min: 100, max: 149 },
    { label: "$150", min: 150, max: 249 },
    { label: "$250", min: 250, max: 499 },
    { label: "$500", min: 500, max: 749 },
    { label: "$750", min: 750, max: 999 },
    { label: "$1k+", min: 1000, max: Infinity },
  ];
  const histogram = sizeBuckets.map((b) => ({
    label: b.label,
    count: bets.filter((x) => x.stake >= b.min && x.stake <= b.max).length,
  }));

  // Day × Hour heatmap — profit summed per cell, count tracked for tooltip
  interface HeatCell {
    readonly profit: number;
    readonly count: number;
  }
  const heatmap: HeatCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ profit: 0, count: 0 })),
  );
  for (const b of bets) {
    const d = new Date(b.placedAt);
    const day = d.getDay();
    const hour = d.getHours();
    const row = heatmap[day];
    if (!row) continue;
    const prev = row[hour] ?? { profit: 0, count: 0 };
    row[hour] = { profit: prev.profit + b.profit, count: prev.count + 1 };
  }
  const heatProfits = heatmap.flat().map((c) => c.profit);
  const maxProfit = Math.max(...heatProfits, 0);
  const minProfit = Math.min(...heatProfits, 0);
  const maxAbs = Math.max(Math.abs(maxProfit), Math.abs(minProfit), 1);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const HOURS = Array.from({ length: 24 }, (_, h) => h);
  const HOUR_CELL = 20; // px — must match body cell width

  // Derived analytics (Phase D)
  const evLeak = computeEvLeak(bets);
  const slippage = computeSlippageByBook(bets, books);
  const latestGap =
    evLeak.length > 0 ? (evLeak[evLeak.length - 1]?.gap ?? 0) : 0;

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-6">
      <div className="mb-5">
        <h1 className="text-[28px] font-semibold tracking-tighter">
          Analytics
        </h1>
        <p className="mt-2 text-[13px] text-text-dim">
          Your last 60 days · {bets.length} bets placed ·{" "}
          <span className="mono-num text-text">
            {formatMoneyShort(totalStaked)}
          </span>{" "}
          total wagered
        </p>
      </div>

      {/* KPI grid */}
      <div className="mb-5 grid grid-cols-6 gap-4">
        <StatBlock
          label="Profit"
          value={formatMoney(totalProfit, { sign: true })}
          deltaTone={totalProfit >= 0 ? "profit" : "loss"}
          sparkline={
            <Sparkline
              data={bankrollSeries.map((d) => d.bankroll)}
              color={totalProfit >= 0 ? "var(--profit)" : "var(--loss)"}
            />
          }
        />
        <StatBlock
          label="ROI"
          value={formatPct(roi, 1)}
          deltaTone={roi >= 0 ? "profit" : "loss"}
          delta={`${formatMoneyShort(totalStaked)} staked`}
        />
        <StatBlock
          label="Win rate"
          value={formatPct(winRate, 1)}
          delta={`${won}w · ${lost}l`}
          deltaTone="neutral"
        />
        <StatBlock
          label="Bets"
          value={bets.length.toString()}
          delta={`${formatMoney(avgBetSize, { sign: false })} avg`}
          deltaTone="neutral"
        />
        <StatBlock
          label="Best day"
          value={formatMoney(
            Math.max(...bankrollSeries.map((d, i, arr) => {
              if (i === 0) return 0;
              return d.bankroll - (arr[i - 1]?.bankroll ?? 0);
            })),
          )}
          deltaTone="profit"
        />
        <StatBlock
          label="Worst day"
          value={formatMoney(
            Math.min(...bankrollSeries.map((d, i, arr) => {
              if (i === 0) return 0;
              return d.bankroll - (arr[i - 1]?.bankroll ?? 0);
            })),
          )}
          deltaTone="loss"
        />
      </div>

      {/* Bankroll curve — full width */}
      <SurfaceCard
        title="Bankroll curve"
        subtitle="60 days · starting $8,000"
        className="mb-5"
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={bankrollSeries}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gBank" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--profit)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--profit)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis dataKey="t" {...AXIS} />
              <YAxis
                {...AXIS}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
                labelStyle={{ color: "var(--text-faint)" }}
                formatter={(v: number) => [formatMoney(v), "bankroll"]}
              />
              <Area
                type="monotone"
                dataKey="bankroll"
                stroke="var(--profit)"
                strokeWidth={2}
                fill="url(#gBank)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SurfaceCard>

      {/* 2/3 + 1/3 row */}
      <div className="mb-5 grid grid-cols-3 gap-5">
        <SurfaceCard
          title="Profit by book"
          subtitle="60-day realized P&L"
          className="col-span-2"
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={profitByBook}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis dataKey="name" {...AXIS} />
                <YAxis
                  {...AXIS}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  formatter={(v: number) => [formatMoney(v), "profit"]}
                />
                <Bar dataKey="profit" radius={[3, 3, 0, 0]}>
                  {profitByBook.map((b) => (
                    <Cell
                      key={b.name}
                      fill={
                        b.profit >= 0 ? "var(--profit)" : "var(--loss)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SurfaceCard>

        <SurfaceCard title="Profit by boost type">
          <div className="flex flex-col gap-3">
            {profitByBoost.map((b) => {
              const max = Math.max(
                ...profitByBoost.map((x) => Math.abs(x.profit)),
                1,
              );
              const width = (Math.abs(b.profit) / max) * 100;
              return (
                <div key={b.name}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-text-dim">{b.name}</span>
                    <span
                      className={cn(
                        "mono-num font-semibold",
                        b.profit >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {formatMoney(b.profit, { sign: true })}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        b.profit >= 0 ? "bg-profit" : "bg-loss",
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-[10px] text-text-faint">
                    {b.count} bets
                  </div>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-5">
        <SurfaceCard
          title="Bet size distribution"
          className="col-span-1"
        >
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={histogram}
                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SurfaceCard>

        <SurfaceCard
          title="Day × Hour heatmap"
          subtitle="Profit by day of week × hour — 60 days"
          className="col-span-2"
        >
          <div className="flex flex-col gap-[3px]">
            {/* Hour header — flex so it aligns perfectly with body cells */}
            <div className="flex items-center gap-1">
              <div className="w-8" aria-hidden />
              <div className="flex gap-[2px]">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="mono-num text-center text-[9px] text-text-faint"
                    style={{ width: HOUR_CELL }}
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
                    const intensity = Math.min(
                      1,
                      Math.abs(profit) / maxAbs,
                    );
                    const alpha =
                      count === 0 ? 0 : 0.18 + intensity * 0.72;
                    const background =
                      count === 0
                        ? "var(--surface-sunken)"
                        : profit >= 0
                          ? `oklch(78% 0.17 152 / ${alpha})`
                          : `oklch(68% 0.22 25 / ${alpha})`;
                    const borderColor =
                      count === 0
                        ? "var(--border)"
                        : "transparent";
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
                          width: HOUR_CELL,
                          height: HOUR_CELL,
                          background,
                          border: `1px solid ${borderColor}`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            {/* Legend */}
            <div className="mt-3 flex items-center justify-between pl-9 text-[10px] text-text-faint">
              <span className="mono-num">
                {formatMoneyShort(-maxAbs)}
              </span>
              <div className="flex h-1.5 flex-1 overflow-hidden rounded-full mx-3">
                <div
                  className="flex-1"
                  style={{
                    background:
                      "linear-gradient(90deg, oklch(68% 0.22 25 / 0.9), oklch(68% 0.22 25 / 0.2), var(--surface-sunken), oklch(78% 0.17 152 / 0.2), oklch(78% 0.17 152 / 0.9))",
                  }}
                />
              </div>
              <span className="mono-num">
                {formatMoneyShort(maxAbs)}
              </span>
            </div>
          </div>
        </SurfaceCard>
      </div>

      {/* EV leak + slippage — Phase D */}
      <div className="mb-5 grid grid-cols-3 gap-5">
        <SurfaceCard
          title="EV leak"
          subtitle={`Theoretical vs realized · current gap ${formatMoney(latestGap, { sign: true })}`}
          className="col-span-2"
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={evLeak}
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis dataKey="t" {...AXIS} />
                <YAxis
                  {...AXIS}
                  tickFormatter={(v) => formatMoneyShort(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  formatter={(v: number, name: string) => [
                    formatMoney(v),
                    name,
                  ]}
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
          <div className="mt-3 flex items-center justify-center gap-6 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-[1px] bg-accent" />
              <span className="text-text-dim">Theoretical EV</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-[1px] bg-profit" />
              <span className="text-text-dim">Realized P&amp;L</span>
            </span>
          </div>
        </SurfaceCard>

        <SurfaceCard
          title="Slippage per book"
          subtitle="Edge lost per $1 staked"
        >
          {slippage.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-text-faint">
              No bets yet
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {slippage.slice(0, 8).map((s) => {
                const max = Math.max(
                  ...slippage.map((x) => Math.abs(x.avgEdgeLost)),
                  0.01,
                );
                const width = (Math.abs(s.avgEdgeLost) / max) * 100;
                return (
                  <div key={s.bookId}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-text-dim">{s.name}</span>
                      <span
                        className={cn(
                          "mono-num font-semibold",
                          s.avgEdgeLost >= 0 ? "text-loss" : "text-profit",
                        )}
                      >
                        {(s.avgEdgeLost * 100).toFixed(2)}¢
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          s.avgEdgeLost >= 0 ? "bg-loss" : "bg-profit",
                        )}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-text-faint">
                      {s.betCount} bets
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
