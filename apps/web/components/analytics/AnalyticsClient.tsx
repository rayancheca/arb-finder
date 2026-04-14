"use client";

import { StatBlock } from "@/components/ui/StatBlock";
import { Sparkline } from "@/components/ui/Sparkline";
import {
  computeEvLeak,
  computeSlippageByBook,
} from "@/lib/analytics-derivations";
import { formatMoney, formatMoneyShort, formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { InteractiveCard } from "./InteractiveCard";
import { DrilldownTabs, CHART_ICON, TABLE_ICON, RAW_ICON } from "./DrilldownTabs";
import { DataGrid, type Column } from "./DataGrid";
import {
  BankrollCurveChart,
  DayHourHeatmapChart,
  EvLeakChart,
  HistogramChart,
  ProfitByBookChart,
  type HeatCell,
} from "./charts";

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

export function AnalyticsClient({ bets, books }: Props) {
  // ── derivations ─────────────────────────────────────────────────
  const totalProfit = bets.reduce((a, b) => a + b.profit, 0);
  const totalStaked = bets.reduce((a, b) => a + b.stake, 0);
  const won = bets.filter((b) => b.result === "won").length;
  const lost = bets.filter((b) => b.result === "lost").length;
  const winRate = bets.length > 0 ? won / bets.length : 0;
  const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;
  const avgBetSize = bets.length > 0 ? totalStaked / bets.length : 0;

  const sortedBets = [...bets].sort(
    (a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime(),
  );
  let running = 8000;
  const bankrollSeries = sortedBets.map((b) => {
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

  // Day × Hour heatmap
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
  const maxAbs = Math.max(
    Math.abs(Math.max(...heatProfits, 0)),
    Math.abs(Math.min(...heatProfits, 0)),
    1,
  );

  const evLeak = computeEvLeak(bets);
  const slippage = computeSlippageByBook(bets, books);
  const latestGap =
    evLeak.length > 0 ? (evLeak[evLeak.length - 1]?.gap ?? 0) : 0;

  // ── column defs for Table views ─────────────────────────────────
  const bankrollColumns: Column<{ t: string; bankroll: number }>[] = [
    { key: "t", header: "Date", align: "left" },
    {
      key: "bankroll",
      header: "Bankroll",
      align: "right",
      mono: true,
      render: (r) => formatMoney(r.bankroll),
      sortAccessor: (r) => r.bankroll,
    },
  ];

  const profitByBookColumns: Column<(typeof profitByBook)[number]>[] = [
    { key: "name", header: "Book", align: "left" },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      mono: true,
      render: (r) => (
        <span className={r.profit >= 0 ? "text-profit" : "text-loss"}>
          {formatMoney(r.profit, { sign: true })}
        </span>
      ),
      sortAccessor: (r) => r.profit,
    },
    {
      key: "roi",
      header: "ROI",
      align: "right",
      mono: true,
      render: (r) => formatPct(r.roi, 2),
      sortAccessor: (r) => r.roi,
    },
    {
      key: "count",
      header: "Bets",
      align: "right",
      mono: true,
      sortAccessor: (r) => r.count,
    },
  ];

  const histogramColumns: Column<(typeof histogram)[number]>[] = [
    { key: "label", header: "Bucket", align: "left" },
    {
      key: "count",
      header: "Count",
      align: "right",
      mono: true,
      sortAccessor: (r) => r.count,
    },
  ];

  const evLeakColumns: Column<(typeof evLeak)[number]>[] = [
    { key: "t", header: "Date", align: "left" },
    {
      key: "theoretical",
      header: "Theoretical",
      align: "right",
      mono: true,
      render: (r) => formatMoney(r.theoretical),
      sortAccessor: (r) => r.theoretical,
    },
    {
      key: "realized",
      header: "Realized",
      align: "right",
      mono: true,
      render: (r) => formatMoney(r.realized),
      sortAccessor: (r) => r.realized,
    },
    {
      key: "gap",
      header: "Gap",
      align: "right",
      mono: true,
      render: (r) => (
        <span className={r.gap >= 0 ? "text-loss" : "text-profit"}>
          {formatMoney(r.gap, { sign: true })}
        </span>
      ),
      sortAccessor: (r) => r.gap,
    },
  ];

  const slippageColumns: Column<(typeof slippage)[number]>[] = [
    { key: "name", header: "Book", align: "left" },
    {
      key: "avgEdgeLost",
      header: "Edge lost (per $1)",
      align: "right",
      mono: true,
      render: (r) => `${(r.avgEdgeLost * 100).toFixed(2)}¢`,
      sortAccessor: (r) => r.avgEdgeLost,
    },
    {
      key: "betCount",
      header: "Bets",
      align: "right",
      mono: true,
      sortAccessor: (r) => r.betCount,
    },
  ];

  const boostColumns: Column<(typeof profitByBoost)[number]>[] = [
    { key: "name", header: "Boost", align: "left" },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      mono: true,
      render: (r) => (
        <span className={r.profit >= 0 ? "text-profit" : "text-loss"}>
          {formatMoney(r.profit, { sign: true })}
        </span>
      ),
      sortAccessor: (r) => r.profit,
    },
    {
      key: "count",
      header: "Bets",
      align: "right",
      mono: true,
      sortAccessor: (r) => r.count,
    },
  ];

  // Raw JSON view helper
  const rawView = (data: unknown) => (
    <pre className="max-h-[540px] overflow-auto rounded-[9px] border border-border bg-surface-sunken p-4 text-[11px] leading-[1.6] text-text-dim">
      <code>{JSON.stringify(data, null, 2)}</code>
    </pre>
  );

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
          total wagered · click any card to expand
        </p>
      </div>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
            Math.max(
              ...bankrollSeries.map((d, i, arr) => {
                if (i === 0) return 0;
                return d.bankroll - (arr[i - 1]?.bankroll ?? 0);
              }),
              0,
            ),
          )}
          deltaTone="profit"
        />
        <StatBlock
          label="Worst day"
          value={formatMoney(
            Math.min(
              ...bankrollSeries.map((d, i, arr) => {
                if (i === 0) return 0;
                return d.bankroll - (arr[i - 1]?.bankroll ?? 0);
              }),
              0,
            ),
          )}
          deltaTone="loss"
        />
      </div>

      {/* Bankroll curve — full width */}
      <div className="mb-5">
        <InteractiveCard
          layoutId="bankroll"
          title="Bankroll curve"
          subtitle="60 days · starting $8,000"
          preview={<BankrollCurveChart data={bankrollSeries} height={220} />}
        >
          <DrilldownTabs
            tabs={[
              {
                value: "chart",
                label: "Chart",
                icon: CHART_ICON,
                content: <BankrollCurveChart data={bankrollSeries} height={480} />,
              },
              {
                value: "table",
                label: "Table",
                icon: TABLE_ICON,
                content: (
                  <DataGrid
                    columns={bankrollColumns}
                    rows={bankrollSeries}
                    defaultSortKey="bankroll"
                  />
                ),
              },
              {
                value: "raw",
                label: "Raw",
                icon: RAW_ICON,
                content: rawView(bankrollSeries),
              },
            ]}
          />
        </InteractiveCard>
      </div>

      {/* Row 2: profit by book + profit by boost */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InteractiveCard
            layoutId="profit-by-book"
            title="Profit by book"
            subtitle="60-day realized P&L per sportsbook"
            preview={<ProfitByBookChart data={profitByBook} height={220} />}
          >
            <DrilldownTabs
              tabs={[
                {
                  value: "chart",
                  label: "Chart",
                  icon: CHART_ICON,
                  content: <ProfitByBookChart data={profitByBook} height={480} />,
                },
                {
                  value: "table",
                  label: "Table",
                  icon: TABLE_ICON,
                  content: (
                    <DataGrid
                      columns={profitByBookColumns}
                      rows={profitByBook}
                      defaultSortKey="profit"
                    />
                  ),
                },
                {
                  value: "raw",
                  label: "Raw",
                  icon: RAW_ICON,
                  content: rawView(profitByBook),
                },
              ]}
            />
          </InteractiveCard>
        </div>

        <InteractiveCard
          layoutId="profit-by-boost"
          title="Profit by boost type"
          subtitle="Which promos pay"
          preview={<BoostBarsPreview rows={profitByBoost} />}
        >
          <DrilldownTabs
            tabs={[
              {
                value: "chart",
                label: "Chart",
                icon: CHART_ICON,
                content: <BoostBarsPreview rows={profitByBoost} limit={20} />,
              },
              {
                value: "table",
                label: "Table",
                icon: TABLE_ICON,
                content: (
                  <DataGrid
                    columns={boostColumns}
                    rows={profitByBoost}
                    defaultSortKey="profit"
                  />
                ),
              },
              {
                value: "raw",
                label: "Raw",
                icon: RAW_ICON,
                content: rawView(profitByBoost),
              },
            ]}
          />
        </InteractiveCard>
      </div>

      {/* Row 3: histogram + heatmap */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <InteractiveCard
          layoutId="histogram"
          title="Bet size distribution"
          subtitle="How much you stake"
          preview={<HistogramChart data={histogram} height={220} />}
        >
          <DrilldownTabs
            tabs={[
              {
                value: "chart",
                label: "Chart",
                icon: CHART_ICON,
                content: <HistogramChart data={histogram} height={440} />,
              },
              {
                value: "table",
                label: "Table",
                icon: TABLE_ICON,
                content: (
                  <DataGrid
                    columns={histogramColumns}
                    rows={histogram}
                    defaultSortKey="count"
                  />
                ),
              },
              {
                value: "raw",
                label: "Raw",
                icon: RAW_ICON,
                content: rawView(histogram),
              },
            ]}
          />
        </InteractiveCard>

        <div className="lg:col-span-2">
          <InteractiveCard
            layoutId="heatmap"
            title="Day × Hour heatmap"
            subtitle="Profit by day of week × hour"
            preview={<DayHourHeatmapChart heatmap={heatmap} maxAbs={maxAbs} />}
          >
            <DrilldownTabs
              tabs={[
                {
                  value: "chart",
                  label: "Chart",
                  icon: CHART_ICON,
                  content: (
                    <DayHourHeatmapChart
                      heatmap={heatmap}
                      maxAbs={maxAbs}
                      cellSize={32}
                    />
                  ),
                },
                {
                  value: "raw",
                  label: "Raw",
                  icon: RAW_ICON,
                  content: rawView(heatmap),
                },
              ]}
            />
          </InteractiveCard>
        </div>
      </div>

      {/* Row 4: EV leak + slippage */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InteractiveCard
            layoutId="ev-leak"
            title="EV leak"
            subtitle={`Theoretical vs realized · gap ${formatMoney(latestGap, { sign: true })}`}
            preview={<EvLeakChart data={evLeak} height={220} />}
          >
            <DrilldownTabs
              tabs={[
                {
                  value: "chart",
                  label: "Chart",
                  icon: CHART_ICON,
                  content: <EvLeakChart data={evLeak} height={480} />,
                },
                {
                  value: "table",
                  label: "Table",
                  icon: TABLE_ICON,
                  content: (
                    <DataGrid
                      columns={evLeakColumns}
                      rows={evLeak}
                      defaultSortKey="gap"
                    />
                  ),
                },
                {
                  value: "raw",
                  label: "Raw",
                  icon: RAW_ICON,
                  content: rawView(evLeak),
                },
              ]}
            />
          </InteractiveCard>
        </div>

        <InteractiveCard
          layoutId="slippage"
          title="Slippage per book"
          subtitle="Edge lost per $1 staked"
          preview={<SlippageBars rows={slippage} />}
        >
          <DrilldownTabs
            tabs={[
              {
                value: "chart",
                label: "Chart",
                icon: CHART_ICON,
                content: <SlippageBars rows={slippage} limit={20} />,
              },
              {
                value: "table",
                label: "Table",
                icon: TABLE_ICON,
                content: (
                  <DataGrid
                    columns={slippageColumns}
                    rows={slippage}
                    defaultSortKey="avgEdgeLost"
                  />
                ),
              },
              {
                value: "raw",
                label: "Raw",
                icon: RAW_ICON,
                content: rawView(slippage),
              },
            ]}
          />
        </InteractiveCard>
      </div>
    </div>
  );
}

// ── inline preview components ────────────────────────────────────────

function BoostBarsPreview({
  rows,
  limit = 4,
}: {
  readonly rows: ReadonlyArray<{ name: string; profit: number; count: number }>;
  readonly limit?: number;
}) {
  const max = Math.max(...rows.map((x) => Math.abs(x.profit)), 1);
  const visible = rows.slice(0, limit);
  return (
    <div className="flex flex-col gap-3">
      {visible.map((b) => {
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
                  "h-full rounded-full transition-[width] duration-500",
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
  );
}

function SlippageBars({
  rows,
  limit = 4,
}: {
  readonly rows: ReadonlyArray<{
    bookId: string;
    name: string;
    color: string;
    avgEdgeLost: number;
    betCount: number;
  }>;
  readonly limit?: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-[12px] text-text-faint">
        No bets yet
      </div>
    );
  }
  const max = Math.max(...rows.map((x) => Math.abs(x.avgEdgeLost)), 0.01);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.slice(0, limit).map((s) => {
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
                  "h-full rounded-full transition-[width] duration-500",
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
  );
}
