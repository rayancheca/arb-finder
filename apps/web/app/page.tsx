import Link from "next/link";
import { ChevronRight, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { StatBlock } from "@/components/ui/StatBlock";
import { OddsCell } from "@/components/ui/OddsCell";
import { BookChip } from "@/components/ui/BookChip";
import { BoostBadge } from "@/components/ui/BoostBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { DashboardKeyboardNav } from "@/components/dashboard/DashboardKeyboardNav";
import {
  formatMoney,
  formatMoneyShort,
  formatPct,
  formatRelativeTime,
} from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const opps = await prisma.arbOpp.findMany({
    orderBy: { netReturnPct: "desc" },
    include: {
      event: true,
      bookA: true,
      bookB: true,
      boost: true,
    },
  });

  const bets = await prisma.bet.findMany({
    orderBy: { placedAt: "asc" },
  });

  const totalProfit = bets.reduce((acc, b) => acc + b.profit, 0);
  const winRate =
    bets.length === 0
      ? 0
      : bets.filter((b) => b.result === "won").length / bets.length;
  const totalStaked = bets.reduce((acc, b) => acc + b.stake, 0);
  const roi = totalStaked === 0 ? 0 : totalProfit / totalStaked;

  // Build a cumulative bankroll sparkline from bet history
  let running = 8000;
  const sparkData: number[] = [running];
  for (const b of bets) {
    running += b.profit;
    sparkData.push(running);
  }

  // Capacity metric: sum of guaranteed profit across all current opps
  const totalGuaranteed = opps.reduce((a, o) => a + o.guaranteedProfit, 0);
  const avgNetReturn =
    opps.length === 0
      ? 0
      : opps.reduce((a, o) => a + o.netReturnPct, 0) / opps.length;

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-6">
      <DashboardKeyboardNav />
      {/* Header row */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-none">
            Live opportunities
          </h1>
          <p className="mt-2 text-[13px] text-text-dim">
            {opps.length} ranked arbs across {new Set(opps.flatMap((o) => [o.bookAId, o.bookBId])).size} books ·{" "}
            <span className="mono-num text-text">{formatMoneyShort(totalGuaranteed)}</span>{" "}
            total guaranteed at current stakes
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-text-faint">
          <span className="flex h-1.5 w-1.5 rounded-full bg-profit" />
          <span className="mono-num">Last poll 2m ago · next in 3m</span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        <StatBlock
          label="Bankroll"
          value={formatMoney(running, { sign: false })}
          delta={`${totalProfit >= 0 ? "+" : ""}${formatMoney(totalProfit)} · 60d`}
          deltaTone={totalProfit >= 0 ? "profit" : "loss"}
          sparkline={<Sparkline data={sparkData} color="var(--profit)" />}
        />
        <StatBlock
          label="ROI 60d"
          value={formatPct(roi, 1)}
          delta={`${bets.length} bets placed`}
          deltaTone="neutral"
        />
        <StatBlock
          label="Win rate"
          value={formatPct(winRate, 1)}
          delta={`${bets.filter((b) => b.result === "won").length}w · ${bets.filter((b) => b.result === "lost").length}l`}
          deltaTone="neutral"
        />
        <StatBlock
          label="Avg net return"
          value={formatPct(avgNetReturn, 2)}
          delta={`across ${opps.length} opps`}
          deltaTone="profit"
          accent
        />
      </div>

      {/* Arb table */}
      <SurfaceCard
        pad={false}
        title={
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
            <span>Ranked by net return</span>
          </div>
        }
        action={
          <div className="flex items-center gap-3 text-[10px] text-text-faint">
            <span>Sort: return desc</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-text-faint">
                <th className="px-5 py-2.5">Matchup</th>
                <th className="px-3 py-2.5">Tip-off</th>
                <th className="px-3 py-2.5">Side A · Book</th>
                <th className="px-3 py-2.5 text-right">Odds A</th>
                <th className="px-3 py-2.5">Side B · Book</th>
                <th className="px-3 py-2.5 text-right">Odds B</th>
                <th className="px-3 py-2.5 text-right">Cost</th>
                <th className="px-3 py-2.5 text-right">Profit</th>
                <th className="px-3 py-2.5 text-right">Return</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {opps.map((opp) => (
                <tr
                  key={opp.id}
                  className={cn(
                    "group border-b border-border text-[13px] transition-colors hover:bg-surface-raised",
                    opp.boostType !== "standard" &&
                      "bg-boost-bg/20 border-l-2 border-l-boost/60",
                  )}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-text">
                          {opp.event.awayTeam}{" "}
                          <span className="text-text-faint">@</span>{" "}
                          {opp.event.homeTeam}
                        </span>
                        <span className="mt-0.5 text-[10px] text-text-faint">
                          NBA · Moneyline
                        </span>
                      </div>
                      <BoostBadge type={opp.boostType} compact />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="mono-num text-[11px] text-text-dim">
                      {formatRelativeTime(opp.event.commenceTime)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <BookChip
                        name={opp.bookA.name}
                        color={opp.bookA.color}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-text-faint">
                      {opp.sideALabel}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <OddsCell odds={opp.oddsA} />
                    <div className="mt-0.5 mono-num text-[10px] text-text-faint">
                      {formatMoney(opp.stakeA)}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <BookChip
                        name={opp.bookB.name}
                        color={opp.bookB.color}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-text-faint">
                      {opp.sideBLabel}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <OddsCell odds={opp.oddsB} />
                    <div className="mt-0.5 mono-num text-[10px] text-text-faint">
                      {formatMoney(opp.stakeB)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right mono-num text-text-dim">
                    {formatMoney(opp.costBasis)}
                  </td>
                  <td className="px-3 py-3 text-right mono-num font-semibold text-profit">
                    {formatMoney(opp.guaranteedProfit, { sign: true })}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={cn(
                        "mono-num rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        opp.netReturnPct > 0.05
                          ? "bg-profit-bg text-profit"
                          : opp.netReturnPct > 0.02
                            ? "bg-accent-bg text-accent"
                            : "text-text-dim",
                      )}
                    >
                      {formatPct(opp.netReturnPct, 2)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      data-arb-row
                      href={`/opp/${opp.id}`}
                      className="inline-flex items-center gap-0.5 rounded-sm text-[11px] text-text-dim opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      view
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </div>
  );
}
