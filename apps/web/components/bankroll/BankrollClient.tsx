"use client";

import { useMemo, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { AlertTriangle, Calculator, TrendingDown } from "lucide-react";
import {
  fractionalKellyStake,
  kellyFraction,
  simulateRiskOfRuin,
} from "@arb/engine";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { Button } from "@/components/ui/Button";
import { BookChip } from "@/components/ui/BookChip";
import { formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";

interface BookBalance {
  id: string;
  name: string;
  color: string;
  balance: number;
  exposed: number;
}

interface Props {
  readonly books: ReadonlyArray<BookBalance>;
}

export function BankrollClient({ books }: Props) {
  const [winProb, setWinProb] = useState(0.58);
  const [odds, setOdds] = useState(-110);
  const [kellyFraction_, setKellyFraction_] = useState(0.25);

  const totalBankroll = books.reduce((a, b) => a + b.balance, 0);
  const totalExposed = books.reduce((a, b) => a + b.exposed, 0);
  const totalIdle = totalBankroll - totalExposed;

  const rawKelly = kellyFraction(winProb, odds);
  const recommendedStake = fractionalKellyStake(
    totalBankroll,
    winProb,
    odds,
    kellyFraction_,
  );

  const ruin = useMemo(
    () =>
      simulateRiskOfRuin({
        bankroll: totalBankroll,
        stakePerBet: Math.max(50, recommendedStake),
        winProb,
        odds,
        numBets: 200,
        numSimulations: 2000,
      }),
    [totalBankroll, recommendedStake, winProb, odds],
  );

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-6">
      {/* Header */}
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tighter">
            Bankroll
          </h1>
          <p className="mt-2 text-[13px] text-text-dim">
            Kelly-optimized stake sizing across your entire book portfolio
            with risk-of-ruin simulation.
          </p>
        </div>
        <div className="rounded-[10px] border border-border bg-surface px-4 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.1em] text-text-faint">
            Total bankroll
          </div>
          <div className="mono-num text-[24px] font-semibold tracking-tight">
            {formatMoney(totalBankroll)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* KELLY CALCULATOR (2/3) */}
        <SurfaceCard
          title={
            <span className="flex items-center gap-2">
              <Calculator className="h-3 w-3" />
              Kelly calculator
            </span>
          }
          subtitle="Input your estimated edge and odds — we return the stake you should size each bet at."
          className="col-span-2"
        >
          <div className="grid grid-cols-2 gap-6">
            <div>
              <KnobRow label="True win probability">
                <div className="mono-num w-14 text-right text-[15px] font-semibold">
                  {(winProb * 100).toFixed(1)}%
                </div>
              </KnobRow>
              <Slider.Root
                className="relative flex h-5 w-full items-center"
                value={[winProb * 100]}
                max={85}
                min={30}
                step={0.5}
                onValueChange={(v) => setWinProb((v[0] ?? 50) / 100)}
              >
                <Slider.Track className="relative h-[3px] flex-1 rounded-full bg-border">
                  <Slider.Range className="absolute h-full rounded-full bg-accent" />
                </Slider.Track>
                <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-accent bg-bg shadow-[0_0_0_3px_var(--accent-bg)]" />
              </Slider.Root>

              <KnobRow label="American odds" className="mt-6">
                <div className="mono-num w-14 text-right text-[15px] font-semibold">
                  {odds > 0 ? `+${odds}` : odds}
                </div>
              </KnobRow>
              <Slider.Root
                className="relative flex h-5 w-full items-center"
                value={[odds]}
                max={500}
                min={-500}
                step={5}
                onValueChange={(v) => setOdds(v[0] ?? -110)}
              >
                <Slider.Track className="relative h-[3px] flex-1 rounded-full bg-border">
                  <Slider.Range className="absolute h-full rounded-full bg-accent" />
                </Slider.Track>
                <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-accent bg-bg shadow-[0_0_0_3px_var(--accent-bg)]" />
              </Slider.Root>

              <KnobRow label="Kelly fraction" className="mt-6">
                <div className="flex gap-1">
                  {[1, 0.5, 0.25, 0.1].map((f) => (
                    <button
                      key={f}
                      onClick={() => setKellyFraction_(f)}
                      className={cn(
                        "mono-num rounded-[5px] border px-2 py-1 text-[10px] font-semibold",
                        kellyFraction_ === f
                          ? "border-accent/50 bg-accent-bg text-accent"
                          : "border-border bg-surface-sunken text-text-dim hover:text-text",
                      )}
                    >
                      {f === 1 ? "full" : `${f * 100}%`}
                    </button>
                  ))}
                </div>
              </KnobRow>
            </div>

            <div className="rounded-[9px] border border-border bg-surface-sunken p-4">
              <div className="text-[9px] uppercase tracking-[0.12em] text-text-faint">
                Recommended stake
              </div>
              <div className="mono-num mt-2 text-[34px] font-semibold tracking-tight">
                {formatMoney(recommendedStake)}
              </div>
              <div className="mono-num mt-1 text-[11px] text-text-dim">
                {rawKelly <= 0
                  ? "Raw Kelly ≤ 0 — don't bet"
                  : `Raw Kelly = ${formatPct(rawKelly, 2)} · using ${kellyFraction_ * 100}% = ${formatPct(rawKelly * kellyFraction_, 2)} of bankroll`}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.1em] text-text-faint">
                    Edge
                  </div>
                  <div
                    className={cn(
                      "mono-num mt-0.5 text-[15px] font-semibold",
                      rawKelly > 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {rawKelly > 0 ? "+" : ""}
                    {formatPct(rawKelly, 2)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.1em] text-text-faint">
                    EV per $100
                  </div>
                  <div
                    className={cn(
                      "mono-num mt-0.5 text-[15px] font-semibold",
                      rawKelly > 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatMoney(
                      100 *
                        (winProb * (odds > 0 ? odds / 100 : 100 / -odds) -
                          (1 - winProb)),
                      { sign: true },
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SurfaceCard>

        {/* RISK OF RUIN (1/3) */}
        <SurfaceCard
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-loss" />
              Risk of ruin
            </span>
          }
          subtitle="200 bets · 2,000 simulations"
        >
          <div className="text-[9px] uppercase tracking-[0.1em] text-text-faint">
            Ruin probability
          </div>
          <div
            className={cn(
              "mono-num mt-2 text-[44px] font-semibold tracking-tight",
              ruin.ruinProbability > 0.2
                ? "text-loss"
                : ruin.ruinProbability > 0.05
                  ? "text-boost"
                  : "text-profit",
            )}
          >
            {(ruin.ruinProbability * 100).toFixed(1)}%
          </div>

          <div className="mt-5 space-y-3">
            <MiniRow
              label="Median final"
              value={formatMoney(ruin.medianFinalBankroll)}
            />
            <MiniRow
              label="5th pct"
              value={formatMoney(ruin.p5)}
              tone="loss"
            />
            <MiniRow
              label="95th pct"
              value={formatMoney(ruin.p95)}
              tone="profit"
            />
          </div>
        </SurfaceCard>
      </div>

      {/* Book balances */}
      <SurfaceCard
        className="mt-5"
        title="Per-book balances"
        subtitle="Idle vs exposed capital right now"
        pad={false}
      >
        <div className="grid grid-cols-4 gap-4 p-5">
          <MiniStat label="Total bankroll" value={formatMoney(totalBankroll)} />
          <MiniStat label="Idle" value={formatMoney(totalIdle)} tone="profit" />
          <MiniStat
            label="Exposed"
            value={formatMoney(totalExposed)}
            tone="boost"
          />
          <MiniStat
            label="Exposure %"
            value={formatPct(totalExposed / totalBankroll, 1)}
            tone="neutral"
          />
        </div>
        <div className="border-t border-border">
          {books.map((b) => {
            const idle = b.balance - b.exposed;
            const idlePct = b.balance > 0 ? idle / b.balance : 0;
            return (
              <div
                key={b.id}
                className="flex items-center gap-4 border-t border-border px-5 py-3 first:border-t-0"
              >
                <div className="w-28 shrink-0">
                  <BookChip name={b.name} color={b.color} size="md" />
                </div>
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${idlePct * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-24 text-right">
                  <div className="mono-num text-[13px] font-semibold">
                    {formatMoney(b.balance)}
                  </div>
                  <div className="mono-num text-[10px] text-text-faint">
                    {formatMoney(idle)} idle
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SurfaceCard>

      {/* Rebalance suggestions */}
      <SurfaceCard className="mt-5" title="Rebalance suggestions">
        <div className="flex items-start gap-3 rounded-[7px] border border-border bg-surface-sunken p-4">
          <TrendingDown className="mt-0.5 h-4 w-4 text-accent" />
          <div className="flex-1 text-[12px] text-text-dim">
            Your BetMGM balance ({formatMoney(books.find((b) => b.id === "mgm")?.balance ?? 0)}) is
            29% of total bankroll. The top 3 arbs from the last 60 days
            required BetMGM liquidity. Consider moving{" "}
            <span className="text-text">
              {formatMoney(500)}
            </span>{" "}
            from Caesars or ESPN BET to rebalance exposure.
          </div>
          <Button size="sm" variant="primary">
            Apply
          </Button>
        </div>
      </SurfaceCard>
    </div>
  );
}

function KnobRow({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-text-faint",
        className,
      )}
    >
      <span>{label}</span>
      {children}
    </div>
  );
}

function MiniRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-[0.1em] text-text-faint">
        {label}
      </span>
      <span
        className={cn(
          "mono-num text-[13px] font-semibold",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss" | "boost" | "neutral";
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.12em] text-text-faint">
        {label}
      </div>
      <div
        className={cn(
          "mono-num mt-1 text-[18px] font-semibold tracking-tight",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
          tone === "boost" && "text-boost",
        )}
      >
        {value}
      </div>
    </div>
  );
}
