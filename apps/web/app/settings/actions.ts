"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  arbFreeBet,
  arbNoSweat,
  arbStandard,
} from "@arb/engine";
import { importExcelHistory } from "@/lib/excel-import";

interface ActionResult {
  readonly ok: boolean;
  readonly message: string;
}

interface ImportResult {
  readonly ok: boolean;
  readonly message: string;
  readonly imported?: number;
  readonly firstPlacedAt?: string;
  readonly lastPlacedAt?: string;
  readonly warnings?: ReadonlyArray<string>;
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

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — workbook ceiling

/**
 * Import historical bets from Rayan's "sportbook calculator" Excel workbook.
 *
 * Reads the uploaded file via `importExcelHistory` (apps/web/lib/excel-import.ts),
 * maps each parsed `BetInput` to a `Bet` row, and persists them in a single
 * transaction so partial failures roll back cleanly. Bets are matched to
 * books by the parser's normalized `bookKey` against `Book.key`; rows whose
 * book cannot be resolved are skipped and reported in the warning list.
 *
 * Note: imported bets are NOT linked to Event / Market because the workbook
 * is leg-level only — it has no canonical event ID. The analytics tab still
 * shows them via Book / boost / placedAt aggregations.
 */
export async function importExcelBets(
  formData: FormData,
): Promise<ImportResult> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, message: "No file uploaded" };
    }
    if (file.size === 0) {
      return { ok: false, message: "Uploaded file is empty" };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        message: `File exceeds ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit`,
      };
    }

    const buffer = await file.arrayBuffer();
    const summary = await importExcelHistory(buffer);
    if (summary.bets.length === 0) {
      return {
        ok: false,
        message:
          summary.warnings[0] ??
          "No bet rows parsed from the workbook. Check that a profit-tracker sheet exists.",
        warnings: summary.warnings,
      };
    }

    // Resolve bookKey → bookId once up-front.
    const books = await prisma.book.findMany({
      select: { id: true, key: true },
    });
    const bookKeyToId = new Map(books.map((b) => [b.key, b.id]));

    const warnings: string[] = [...summary.warnings];
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
      boostType: string;
      placedAt: Date;
      settledAt: Date | null;
    }[] = [];

    let skippedNoBook = 0;
    for (const bet of summary.bets) {
      const bookId = bookKeyToId.get(bet.bookKey);
      if (!bookId) {
        skippedNoBook++;
        continue;
      }

      // Derive payout from result + odds + stake when the workbook only
      // recorded profit. Keeps analytics-tab math consistent with bets
      // that came in via recordArbPlacement.
      const decimal = americanToDecimal(bet.americanOdds);
      let payout = 0;
      if (bet.result === "won") payout = round2(bet.stake * decimal);
      else if (bet.result === "void" || bet.result === "cashed")
        payout = round2(bet.stake + bet.profit);

      rows.push({
        id: crypto.randomUUID(),
        bookId,
        side: bet.side ?? "imported",
        label: bet.eventLabel ?? "Imported from workbook",
        americanOdds: bet.americanOdds,
        stake: bet.stake,
        result: bet.result,
        payout,
        profit: round2(bet.profit),
        boostType: bet.boostType,
        placedAt: bet.placedAt,
        // Imported bets are historical → already settled. Pending rows
        // are skipped from settling automatically.
        settledAt: bet.result === "pending" ? null : bet.placedAt,
      });
    }

    if (skippedNoBook > 0) {
      warnings.push(
        `Skipped ${skippedNoBook} row(s) with unrecognized book name.`,
      );
    }

    if (rows.length === 0) {
      return {
        ok: false,
        message: "No bets could be matched to a known book.",
        warnings,
      };
    }

    // Single transaction so a mid-import error leaves the DB untouched.
    await prisma.$transaction([prisma.bet.createMany({ data: rows })]);

    const placedDates = rows
      .map((r) => r.placedAt.getTime())
      .sort((a, b) => a - b);
    const first = new Date(placedDates[0]!);
    const last = new Date(placedDates[placedDates.length - 1]!);

    revalidatePath("/analytics");
    revalidatePath("/bankroll");

    return {
      ok: true,
      imported: rows.length,
      firstPlacedAt: first.toISOString(),
      lastPlacedAt: last.toISOString(),
      message: `Imported ${rows.length} bet(s) spanning ${first.toLocaleDateString()} → ${last.toLocaleDateString()}.`,
      warnings,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Unknown import error",
    };
  }
}

function americanToDecimal(odds: number): number {
  return odds >= 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
