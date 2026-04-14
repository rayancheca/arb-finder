"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  arbFreeBet,
  arbNoSweat,
  arbStandard,
} from "@arb/engine";

interface ActionResult {
  readonly ok: boolean;
  readonly message: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Wipe the demo analytics bets (not the schema, not the books, not the
 * engine) and generate a fresh batch of randomized 120 bets over the last
 * 60 days. Use this when you want a new demo scenario without running the
 * full prisma seed.
 */
export async function regenerateDemoBets(): Promise<ActionResult> {
  try {
    const books = await prisma.book.findMany();
    if (books.length === 0) {
      return { ok: false, message: "No books in DB — run seed first" };
    }

    await prisma.bet.deleteMany();

    const BOOST_TYPES = [
      "standard",
      "standard",
      "standard",
      "standard",
      "free_bet",
      "no_sweat",
      "site_credit",
    ];
    const RESULTS = ["won", "lost", "won", "lost", "won", "void"];

    const now = Date.now();
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

    const rows: {
      id: string;
      bookId: string;
      side: string;
      label: string;
      americanOdds: number;
      stake: number;
      result: string;
      payout: number;
      profit: number;
      evAtPlacement: number;
      boostType: string;
      placedAt: Date;
      settledAt: Date;
    }[] = [];

    for (let i = 0; i < 120; i++) {
      const book = books[Math.floor(Math.random() * books.length)]!;
      const boostType =
        BOOST_TYPES[Math.floor(Math.random() * BOOST_TYPES.length)]!;
      const result = RESULTS[Math.floor(Math.random() * RESULTS.length)]!;
      const stake = [50, 100, 150, 250, 500, 750, 1000][
        Math.floor(Math.random() * 7)
      ]!;
      const odds =
        Math.random() > 0.5
          ? 100 + Math.floor(Math.random() * 250)
          : -110 - Math.floor(Math.random() * 200);

      // Rough payout sim — positive EV of 1.5%, realized random.
      const decimal =
        odds >= 100 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
      const payout = result === "won" ? Number((stake * decimal).toFixed(2)) : 0;
      const profit =
        result === "won"
          ? Number((payout - stake).toFixed(2))
          : result === "void"
            ? 0
            : -stake;

      const daysAgo = Math.random() * 60;
      const placedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);

      rows.push({
        id: newId("bet"),
        bookId: book.id,
        side: Math.random() > 0.5 ? "home" : "away",
        label: `${book.name} · market snapshot`,
        americanOdds: odds,
        stake,
        result,
        payout,
        profit,
        evAtPlacement: Number((stake * 0.02).toFixed(2)),
        boostType,
        placedAt,
        settledAt: placedAt,
      });
    }

    await prisma.bet.createMany({ data: rows });

    revalidatePath("/analytics");
    revalidatePath("/bankroll");
    revalidatePath("/");

    return {
      ok: true,
      message: `Regenerated ${rows.length} demo bets across ${books.length} books.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Nuke every seeded demo bet without generating new ones. Leaves the rest
 * of the schema intact (books, events, arbs, boosts). Use when you want
 * to start hand-importing real history.
 */
export async function clearDemoBets(): Promise<ActionResult> {
  try {
    const { count } = await prisma.bet.deleteMany();
    revalidatePath("/analytics");
    revalidatePath("/bankroll");
    revalidatePath("/");
    return {
      ok: true,
      message: `Cleared ${count} demo bets. Analytics is now empty.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Recompute ArbOpp rows from the current Selection table. Useful after
 * changing book boosts or when the Python worker isn't running. This is
 * a light Python-port of the arb-standard math — picks two-way markets
 * with ≥2 books on opposite sides and writes best-pair ArbOpp rows.
 */
export async function recomputeArbs(): Promise<ActionResult> {
  try {
    const selections = await prisma.selection.findMany({
      include: { market: { include: { event: true } } },
    });

    await prisma.arbOpp.deleteMany();

    interface SideGroup {
      marketId: string;
      eventId: string;
      home: typeof selections;
      away: typeof selections;
    }
    const byMarket = new Map<string, SideGroup>();
    for (const sel of selections) {
      const g = byMarket.get(sel.marketId) ?? {
        marketId: sel.marketId,
        eventId: sel.market.eventId,
        home: [],
        away: [],
      };
      if (sel.side === "home") g.home.push(sel);
      if (sel.side === "away") g.away.push(sel);
      byMarket.set(sel.marketId, g);
    }

    const inserts: {
      id: string;
      eventId: string;
      marketId: string;
      bookAId: string;
      bookBId: string;
      boostType: string;
      oddsA: number;
      oddsB: number;
      sideALabel: string;
      sideBLabel: string;
      stakeA: number;
      stakeB: number;
      costBasis: number;
      guaranteedProfit: number;
      netReturnPct: number;
    }[] = [];

    for (const g of byMarket.values()) {
      for (const a of g.home) {
        for (const b of g.away) {
          if (a.bookId === b.bookId) continue;
          const result = arbStandard(a.americanOdds, b.americanOdds, 1000);
          if (!result || result.netReturnPct <= 0) continue;
          inserts.push({
            id: newId("arb"),
            eventId: g.eventId,
            marketId: g.marketId,
            bookAId: a.bookId,
            bookBId: b.bookId,
            boostType: "standard",
            oddsA: a.americanOdds,
            oddsB: b.americanOdds,
            sideALabel: a.label,
            sideBLabel: b.label,
            stakeA: result.legA.stake,
            stakeB: result.legB.stake,
            costBasis: result.costBasis,
            guaranteedProfit: result.guaranteedMinProfit,
            netReturnPct: result.netReturnPct,
          });
        }
      }
    }

    if (inserts.length > 0) {
      await prisma.arbOpp.createMany({ data: inserts });
    }

    revalidatePath("/");
    revalidatePath("/search");
    return {
      ok: true,
      message: `Recomputed ${inserts.length} arb opportunities from ${selections.length} selections.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
