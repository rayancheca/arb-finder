"use client";

import { useMemo, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import {
  ArrowRight,
  Clock,
  ExternalLink,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  arbFreeBet,
  arbNoSweat,
  arbSiteCredit,
  arbStandard,
} from "@arb/engine";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { OddsCell } from "@/components/ui/OddsCell";
import { BookChip } from "@/components/ui/BookChip";
import { BoostBadge } from "@/components/ui/BoostBadge";
import { Button } from "@/components/ui/Button";
import { buildDeepLink } from "@/lib/deep-links";
import { formatMoney, formatPct, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

interface BookLite {
  id: string;
  name: string;
  color: string;
  key: string;
}

interface Props {
  readonly opp: {
    id: string;
    oddsA: number;
    oddsB: number;
    sideALabel: string;
    sideBLabel: string;
    stakeA: number;
    stakeB: number;
    costBasis: number;
    guaranteedProfit: number;
    netReturnPct: number;
    boostType: string;
    event: {
      homeTeam: string;
      awayTeam: string;
      commenceTime: Date;
    };
    bookA: BookLite;
    bookB: BookLite;
    boost: {
      id: string;
      title: string;
      description: string | null;
      amount: number;
      cashRate: number | null;
      type: string;
    } | null;
  };
}

type BoostOption = "standard" | "free_bet" | "no_sweat" | "site_credit";

export function OpportunityDetail({ opp }: Props) {
  const [bankrollA, setBankrollA] = useState(opp.stakeA);
  const [boost, setBoost] = useState<BoostOption>(
    opp.boostType as BoostOption,
  );

  const result = useMemo(() => {
    switch (boost) {
      case "free_bet":
        return arbFreeBet(opp.oddsA, opp.oddsB, bankrollA, "A");
      case "no_sweat":
        return arbNoSweat(
          opp.oddsA,
          opp.oddsB,
          bankrollA,
          opp.boost?.cashRate ?? 0.65,
          "A",
        );
      case "site_credit":
        return arbSiteCredit(
          opp.oddsA,
          opp.oddsB,
          bankrollA,
          opp.boost?.amount ?? 100,
        );
      default:
        return arbStandard(opp.oddsA, opp.oddsB, bankrollA);
    }
  }, [opp, bankrollA, boost]);

  const BOOSTS: Array<{ key: BoostOption; label: string }> = [
    { key: "standard", label: "Standard" },
    { key: "free_bet", label: "Free Bet" },
    { key: "no_sweat", label: "No Sweat" },
    { key: "site_credit", label: "Site Credit" },
  ];

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[11px] text-text-faint">
          <span className="uppercase tracking-[0.1em]">NBA · Moneyline</span>
          <span className="h-1 w-1 rounded-full bg-border" />
          <Clock className="h-3 w-3" />
          <span className="mono-num">
            {formatRelativeTime(new Date(opp.event.commenceTime))}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-[32px] font-semibold tracking-tighter">
            {opp.event.awayTeam}{" "}
            <span className="text-text-faint">@</span>{" "}
            {opp.event.homeTeam}
          </h1>
          <BoostBadge type={boost} />
        </div>
      </div>

      {/* Two-sided card */}
      <div className="grid grid-cols-2 gap-4">
        <LegCard
          title={opp.sideALabel}
          book={opp.bookA}
          odds={opp.oddsA}
          stake={result.legA.stake}
          payout={result.legA.payoutIfWin}
          accent="A"
        />
        <LegCard
          title={opp.sideBLabel}
          book={opp.bookB}
          odds={opp.oddsB}
          stake={result.legB.stake}
          payout={result.legB.payoutIfWin}
          accent="B"
        />
      </div>

      {/* Summary strip */}
      <div className="mt-4 grid grid-cols-4 gap-4">
        <SummaryStat
          label="Cost basis"
          value={formatMoney(result.costBasis)}
        />
        <SummaryStat
          label="Guaranteed profit"
          value={formatMoney(result.guaranteedMinProfit, { sign: true })}
          tone={result.guaranteedMinProfit >= 0 ? "profit" : "loss"}
        />
        <SummaryStat
          label="Net return"
          value={formatPct(result.netReturnPct, 2)}
          tone={result.netReturnPct >= 0 ? "profit" : "loss"}
        />
        <SummaryStat
          label="Bookie vig"
          value={formatPct(result.bookieTake, 2)}
          tone={result.bookieTake < 0 ? "profit" : "neutral"}
        />
      </div>

      {/* Slider + boost picker */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <SurfaceCard
          title="Side A stake"
          className="col-span-2"
          subtitle="Drag to adjust — Side B hedge recalculates instantly"
        >
          <div className="flex items-center gap-4">
            <div className="mono-num w-24 shrink-0 text-[22px] font-semibold tabular-nums">
              ${Math.round(bankrollA).toLocaleString()}
            </div>
            <Slider.Root
              className="relative flex h-5 flex-1 items-center"
              value={[bankrollA]}
              max={5000}
              min={25}
              step={25}
              onValueChange={(v) => setBankrollA(v[0] ?? 25)}
            >
              <Slider.Track className="relative h-[3px] flex-1 rounded-full bg-border">
                <Slider.Range className="absolute h-full rounded-full bg-accent" />
              </Slider.Track>
              <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-accent bg-bg shadow-[0_0_0_3px_var(--accent-bg)] focus-visible:outline-none" />
            </Slider.Root>
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-text-faint">
            <span>$25</span>
            <span>$1,000</span>
            <span>$2,500</span>
            <span>$5,000</span>
          </div>
        </SurfaceCard>

        <SurfaceCard
          title="Apply boost"
          action={<Sparkles className="h-3 w-3 text-boost" />}
        >
          <div className="flex flex-col gap-1.5">
            {BOOSTS.map((b) => (
              <button
                key={b.key}
                onClick={() => setBoost(b.key)}
                className={cn(
                  "flex items-center justify-between rounded-[6px] border px-3 py-1.5 text-[12px] transition-colors",
                  boost === b.key
                    ? "border-accent/50 bg-accent-bg text-accent"
                    : "border-border bg-surface-sunken text-text-dim hover:border-border-strong hover:text-text",
                )}
              >
                <span className="font-medium">{b.label}</span>
                {boost === b.key && (
                  <span className="text-[9px] uppercase tracking-[0.1em] text-accent">
                    active
                  </span>
                )}
              </button>
            ))}
          </div>
        </SurfaceCard>
      </div>

      {/* Place trade */}
      <SurfaceCard
        className="mt-4"
        title="Place trade"
        subtitle="Deep links open the book's pre-filled slip when supported. Browser extension autofills otherwise."
      >
        <div className="grid grid-cols-2 gap-3">
          <PlaceButton
            book={opp.bookA}
            stake={result.legA.stake}
            sideLabel={opp.sideALabel}
          />
          <PlaceButton
            book={opp.bookB}
            stake={result.legB.stake}
            sideLabel={opp.sideBLabel}
          />
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-[7px] border border-border bg-surface-sunken px-3 py-2.5 text-[11px] text-text-dim">
          <Shield className="mt-0.5 h-3 w-3 shrink-0 text-text-faint" />
          Odds snapshot taken 2m ago. Recompute before placing — if a leg
          moves by more than 3¢ while you click through, this opportunity
          may vanish.
        </div>
      </SurfaceCard>
    </div>
  );
}

function LegCard({
  title,
  book,
  odds,
  stake,
  payout,
  accent,
}: {
  title: string;
  book: BookLite;
  odds: number;
  stake: number;
  payout: number;
  accent: "A" | "B";
}) {
  return (
    <SurfaceCard pad={false}>
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <span className="mono-num text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint">
            Leg {accent}
          </span>
          <BookChip name={book.name} color={book.color} />
        </div>
        <OddsCell odds={odds} size="lg" />
      </div>
      <div className="px-5 pt-3">
        <div className="text-[18px] font-semibold tracking-tight">{title}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 border-t border-border">
        <div className="border-r border-border px-5 py-3">
          <div className="text-[9px] uppercase tracking-[0.12em] text-text-faint">
            Stake
          </div>
          <div className="mono-num mt-1 text-[20px] font-semibold">
            {formatMoney(stake)}
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-[9px] uppercase tracking-[0.12em] text-text-faint">
            Payout on win
          </div>
          <div className="mono-num mt-1 text-[20px] font-semibold text-profit">
            {formatMoney(payout)}
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}

function SummaryStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss" | "neutral";
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-4">
      <div className="text-[9px] uppercase tracking-[0.12em] text-text-faint">
        {label}
      </div>
      <div
        className={cn(
          "mono-num mt-1.5 text-[20px] font-semibold tracking-tight",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function PlaceButton({
  book,
  stake,
  sideLabel,
}: {
  book: BookLite;
  stake: number;
  sideLabel: string;
}) {
  function handleClick() {
    const deepLink = buildDeepLink({
      bookKey: book.key,
      selectionId: sideLabel,
      stake,
    });
    if (!deepLink) {
      navigator.clipboard?.writeText(stake.toFixed(2));
      window.alert(
        `No deep link for ${book.name}. Stake copied to clipboard — open the bet slip manually.`,
      );
      return;
    }
    // For extension-assisted flows we still open the URL; the installed
    // Chrome extension picks up the intent via chrome.storage.session on
    // page load. For pure-URL flows (FanDuel) the URL does the work.
    window.open(deepLink.url, "_blank", "noopener");
  }
  return (
    <button
      onClick={handleClick}
      className="group flex items-center justify-between rounded-[9px] border border-border bg-surface-sunken px-4 py-3.5 transition-colors hover:border-accent/50 hover:bg-accent-bg"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{
            backgroundColor: book.color,
            boxShadow: `0 0 10px ${book.color}99`,
          }}
        />
        <div className="flex flex-col items-start">
          <span className="text-[12px] font-semibold text-text">
            Place on {book.name}
          </span>
          <span className="mono-num text-[10px] text-text-faint">
            {formatMoney(stake)}
          </span>
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-text-faint group-hover:text-accent" />
    </button>
  );
}
