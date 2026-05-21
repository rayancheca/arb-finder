"use client";

import { useState, useTransition } from "react";
import { Check, Slash, X } from "lucide-react";
import { settleBet, type SettleOutcome } from "@/app/bankroll/actions";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { BookChip } from "@/components/ui/BookChip";
import { OddsCell } from "@/components/ui/OddsCell";
import { Button } from "@/components/ui/Button";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface PendingBetRow {
  readonly id: string;
  readonly side: string;
  readonly label: string;
  readonly americanOdds: number;
  readonly stake: number;
  readonly boostType: string;
  readonly placedAt: string; // serialized ISO from server
  readonly book: {
    readonly id: string;
    readonly name: string;
    readonly color: string;
  };
  readonly event: {
    readonly id: string;
    readonly homeTeam: string;
    readonly awayTeam: string;
  } | null;
}

interface Props {
  readonly bets: ReadonlyArray<PendingBetRow>;
}

export function PendingBetsPanel({ bets }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pendingCount = bets.length;
  const totalStake = bets.reduce((a, b) => a + b.stake, 0);
  // Expected return if every leg hits at its current decimal odds. Useful
  // upper-bound exposure number for the KPI strip — real outcome will be
  // bounded by the arb (one leg wins, one loses) but this matches the
  // existing "Bankroll" mental model of "what could come back to me".
  const expectedReturn = bets.reduce(
    (a, b) => a + b.stake * americanToDecimal(b.americanOdds),
    0,
  );

  function handleSettle(betId: string, outcome: SettleOutcome) {
    setBusyId(betId);
    setError(null);
    startTransition(async () => {
      const res = await settleBet(betId, outcome);
      setBusyId(null);
      if (!res.ok) {
        setError(res.error);
      }
    });
  }

  return (
    <SurfaceCard
      className="mt-5"
      title="Pending bets"
      subtitle="Settle each leg once the game finishes — payout and P&L are derived from American odds."
      pad={false}
    >
      <div className="grid grid-cols-4 gap-4 border-b border-border p-5">
        <KpiTile label="Pending" value={String(pendingCount)} />
        <KpiTile
          label="Total stake"
          value={formatMoney(totalStake)}
          tone="boost"
        />
        <KpiTile
          label="Exposure"
          value={formatMoney(totalStake)}
          tone="boost"
        />
        <KpiTile
          label="Max return"
          value={formatMoney(expectedReturn)}
          tone="profit"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="border-b border-loss/30 bg-loss-bg px-5 py-2.5 text-[11px] text-loss"
        >
          {error}
        </div>
      )}

      {bets.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12px] text-text-faint">
          No pending bets. Place an arb from the dashboard and the legs will
          appear here for settlement.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[9px] uppercase tracking-[0.12em] text-text-faint">
                <th className="px-5 py-2.5 text-left font-semibold">Event</th>
                <th className="px-3 py-2.5 text-left font-semibold">Book</th>
                <th className="px-3 py-2.5 text-left font-semibold">Side</th>
                <th className="px-3 py-2.5 text-right font-semibold">Odds</th>
                <th className="px-3 py-2.5 text-right font-semibold">Stake</th>
                <th className="px-3 py-2.5 text-right font-semibold">Placed</th>
                <th className="px-5 py-2.5 text-right font-semibold">Settle</th>
              </tr>
            </thead>
            <tbody>
              {bets.map((bet) => {
                const isRowBusy = busyId === bet.id && isPending;
                return (
                  <tr
                    key={bet.id}
                    className={cn(
                      "border-b border-border last:border-b-0 transition-opacity",
                      isRowBusy && "opacity-50",
                    )}
                  >
                    <td className="px-5 py-2.5">
                      {bet.event ? (
                        <span className="text-text">
                          {bet.event.awayTeam}{" "}
                          <span className="text-text-faint">@</span>{" "}
                          {bet.event.homeTeam}
                        </span>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <BookChip
                        name={bet.book.name}
                        color={bet.book.color}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-text-dim">{bet.label}</td>
                    <td className="px-3 py-2.5 text-right">
                      <OddsCell odds={bet.americanOdds} size="sm" />
                    </td>
                    <td className="mono-num px-3 py-2.5 text-right font-semibold">
                      {formatMoney(bet.stake)}
                    </td>
                    <td className="mono-num px-3 py-2.5 text-right text-text-faint">
                      {formatRelativeTime(new Date(bet.placedAt))}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="profit"
                          icon={<Check className="h-3 w-3" />}
                          disabled={busyId !== null}
                          onClick={() => handleSettle(bet.id, "won")}
                        >
                          Won
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<X className="h-3 w-3" />}
                          disabled={busyId !== null}
                          onClick={() => handleSettle(bet.id, "lost")}
                        >
                          Lost
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Slash className="h-3 w-3" />}
                          disabled={busyId !== null}
                          onClick={() => handleSettle(bet.id, "void")}
                        >
                          Void
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SurfaceCard>
  );
}

function KpiTile({
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

// Local copy of the engine helper to avoid pulling the full engine bundle
// into a client component just for one constant-time arithmetic call.
function americanToDecimal(odds: number): number {
  return odds >= 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}
