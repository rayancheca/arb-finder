"use server";

/**
 * Bet lifecycle — placement side.
 *
 * Before this Server Action existed, clicking "Place trade" in the
 * OpportunityDetail UI opened a deep link (and now also pings the Chrome
 * extension via T7) but wrote absolutely nothing to the DB. That meant the
 * entire Analytics tab was decorative — it only ever showed 120 synthetic
 * demo bets from the seed.
 *
 * `recordArbPlacement` closes the loop: at the moment the user commits to
 * placing the trade, we insert TWO `Bet` rows (one per leg) in a single
 * transaction so the analytics pipeline picks them up immediately.
 *
 * The stake split is recomputed server-side using the same `@arb/engine`
 * math the client uses on the slider — we do NOT trust client-supplied
 * leg stakes. The user only tells us their chosen Side-A stake (= slider
 * value); the server derives the hedge stake from the engine.
 *
 * Idempotency: clicking "Place both legs" twice within 10 seconds is a
 * no-op on the second call. The dedup window is intentionally short —
 * long enough to swallow accidental double-clicks, short enough that a
 * deliberate re-placement (different odds snapshot) still records.
 */

import { revalidatePath } from "next/cache";
import { arbStandard } from "@arb/engine";
import { prisma } from "@/lib/db";

interface RecordSuccess {
  readonly ok: true;
  readonly betIds: readonly [string, string];
  readonly deduped?: boolean;
}

interface RecordFailure {
  readonly ok: false;
  readonly error: string;
}

export type RecordArbPlacementResult = RecordSuccess | RecordFailure;

export interface RecordArbPlacementInput {
  readonly arbOppId: string;
  /**
   * User's chosen stake from the slider. This is the SIDE-A stake input
   * to `arbStandard()`, NOT the total cost basis. The Side-B hedge is
   * derived from the engine.
   */
  readonly totalStake: number;
}

const DEDUP_WINDOW_MS = 10_000;

export async function recordArbPlacement(
  input: RecordArbPlacementInput,
): Promise<RecordArbPlacementResult> {
  // 1. Validate input shape.
  if (!input?.arbOppId || typeof input.arbOppId !== "string") {
    return { ok: false, error: "Missing arb opportunity id" };
  }
  if (
    typeof input.totalStake !== "number" ||
    !Number.isFinite(input.totalStake) ||
    input.totalStake <= 0
  ) {
    return { ok: false, error: "Stake must be a positive number" };
  }

  try {
    // 2. Load the opp with everything we need to write Bet rows.
    const opp = await prisma.arbOpp.findUnique({
      where: { id: input.arbOppId },
      select: {
        id: true,
        eventId: true,
        marketId: true,
        bookAId: true,
        bookBId: true,
        oddsA: true,
        oddsB: true,
        sideALabel: true,
        sideBLabel: true,
        boostType: true,
        netReturnPct: true,
      },
    });

    if (!opp) {
      return { ok: false, error: "Opportunity no longer exists" };
    }

    // 3. Idempotency: if we already recorded a pair for this arbOpp in the
    //    last DEDUP_WINDOW_MS, return that pair instead of writing again.
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
    const recent = await prisma.bet.findMany({
      where: {
        eventId: opp.eventId,
        marketId: opp.marketId,
        result: "pending",
        placedAt: { gte: cutoff },
        bookId: { in: [opp.bookAId, opp.bookBId] },
      },
      orderBy: { placedAt: "desc" },
      take: 4,
    });

    // We need both legs (one bet on bookA + one on bookB) for the same
    // event+market, both pending, both inside the window. Pick the most
    // recent of each book if present.
    const recentA = recent.find((b) => b.bookId === opp.bookAId);
    const recentB = recent.find((b) => b.bookId === opp.bookBId);
    if (recentA && recentB) {
      return {
        ok: true,
        betIds: [recentA.id, recentB.id],
        deduped: true,
      };
    }

    // 4. Recompute stake split with the engine. The slider value is the
    //    Side-A stake; `arbStandard` returns the Side-B hedge.
    const split = arbStandard(opp.oddsA, opp.oddsB, input.totalStake);

    // 5. Write both Bet rows in a transaction so the analytics pipeline
    //    either sees the pair or sees neither — never a half-recorded arb.
    const placedAt = new Date();
    const betAId = crypto.randomUUID();
    const betBId = crypto.randomUUID();

    await prisma.$transaction([
      prisma.bet.create({
        data: {
          id: betAId,
          eventId: opp.eventId,
          marketId: opp.marketId,
          bookId: opp.bookAId,
          side: "A",
          label: opp.sideALabel,
          americanOdds: opp.oddsA,
          stake: round2(split.legA.stake),
          result: "pending",
          payout: 0,
          profit: 0,
          evAtPlacement: opp.netReturnPct,
          boostType: opp.boostType,
          tag: `arb:${opp.id}`,
          placedAt,
        },
      }),
      prisma.bet.create({
        data: {
          id: betBId,
          eventId: opp.eventId,
          marketId: opp.marketId,
          bookId: opp.bookBId,
          side: "B",
          label: opp.sideBLabel,
          americanOdds: opp.oddsB,
          stake: round2(split.legB.stake),
          result: "pending",
          payout: 0,
          profit: 0,
          evAtPlacement: opp.netReturnPct,
          boostType: opp.boostType,
          tag: `arb:${opp.id}`,
          placedAt,
        },
      }),
    ]);

    revalidatePath("/bankroll");
    revalidatePath("/analytics");

    return { ok: true, betIds: [betAId, betBId] };
  } catch {
    // Generic message — we don't want to leak ORM internals to the client.
    return { ok: false, error: "Failed to record placement. Please retry." };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
