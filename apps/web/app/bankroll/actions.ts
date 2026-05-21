"use server";

/**
 * Bet lifecycle — settlement side.
 *
 * Pairs with `apps/web/app/opp/actions.ts#recordArbPlacement`. Once a game
 * finishes the user marks each leg Won / Lost / Void from the Pending bets
 * panel on /bankroll. The math is intentionally trivial — payout from
 * American odds, profit = payout − stake — so the analytics tab can
 * derive everything else (ROI, EV-leak, bankroll curve) without any
 * special-case logic.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { americanToDecimal } from "@arb/engine";

interface SettleSuccess {
  readonly ok: true;
  readonly bet: {
    readonly id: string;
    readonly result: "won" | "lost" | "void";
    readonly payout: number;
    readonly profit: number;
  };
}

interface SettleFailure {
  readonly ok: false;
  readonly error: string;
}

export type SettleBetResult = SettleSuccess | SettleFailure;

export type SettleOutcome = "won" | "lost" | "void";

const VALID_OUTCOMES: ReadonlySet<SettleOutcome> = new Set([
  "won",
  "lost",
  "void",
]);

export async function settleBet(
  betId: string,
  outcome: SettleOutcome,
): Promise<SettleBetResult> {
  if (!betId || typeof betId !== "string") {
    return { ok: false, error: "Missing bet id" };
  }
  if (!VALID_OUTCOMES.has(outcome)) {
    return { ok: false, error: "Invalid outcome" };
  }

  try {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      select: { id: true, result: true, stake: true, americanOdds: true },
    });
    if (!bet) return { ok: false, error: "Bet not found" };
    if (bet.result !== "pending") {
      return {
        ok: false,
        error: `Bet already settled as ${bet.result}`,
      };
    }

    const { payout, profit } = computePayoutAndProfit(
      bet.stake,
      bet.americanOdds,
      outcome,
    );

    const updated = await prisma.bet.update({
      where: { id: betId },
      data: {
        result: outcome,
        payout,
        profit,
        settledAt: new Date(),
      },
      select: { id: true, result: true, payout: true, profit: true },
    });

    revalidatePath("/bankroll");
    revalidatePath("/analytics");

    return {
      ok: true,
      bet: {
        id: updated.id,
        result: outcome,
        payout: updated.payout,
        profit: updated.profit,
      },
    };
  } catch {
    return { ok: false, error: "Failed to settle bet. Please retry." };
  }
}

function computePayoutAndProfit(
  stake: number,
  americanOdds: number,
  outcome: SettleOutcome,
): { payout: number; profit: number } {
  switch (outcome) {
    case "won": {
      const decimal = americanToDecimal(americanOdds);
      const payout = round2(stake * decimal);
      return { payout, profit: round2(payout - stake) };
    }
    case "lost":
      return { payout: 0, profit: round2(-stake) };
    case "void":
      return { payout: round2(stake), profit: 0 };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
