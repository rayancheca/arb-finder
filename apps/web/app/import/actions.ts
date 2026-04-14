"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { importExcelHistory, type BetInput } from "@/lib/excel-import";

export interface ImportResult {
  readonly ok: boolean;
  readonly imported: number;
  readonly skipped: number;
  readonly warnings: ReadonlyArray<string>;
  readonly sheetsSeen: ReadonlyArray<string>;
  readonly error?: string;
}

function newBetId(): string {
  return `bet_${Math.random().toString(36).slice(2, 14)}`;
}

export async function importHistoryFromFormData(
  formData: FormData,
): Promise<ImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      warnings: [],
      sheetsSeen: [],
      error: "No file uploaded",
    };
  }
  if (file.size > 10 * 1024 * 1024) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      warnings: [],
      sheetsSeen: [],
      error: "File too large (>10MB)",
    };
  }

  let summary;
  try {
    const buffer = await file.arrayBuffer();
    summary = await importExcelHistory(buffer);
  } catch (err) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      warnings: [],
      sheetsSeen: [],
      error: err instanceof Error ? err.message : "Parse failed",
    };
  }

  const books = await prisma.book.findMany({
    select: { id: true, key: true },
  });
  const bookByKey = new Map(books.map((b) => [b.key, b.id]));

  let imported = 0;
  let skipped = 0;

  for (const bet of summary.bets) {
    const bookId = bookByKey.get(bet.bookKey);
    if (!bookId) {
      skipped++;
      continue;
    }
    try {
      await prisma.bet.create({
        data: {
          id: newBetId(),
          bookId,
          side: bet.side ?? "home",
          label: bet.eventLabel ?? "",
          americanOdds: bet.americanOdds,
          stake: bet.stake,
          result: bet.result,
          payout: bet.profit > 0 ? bet.stake + bet.profit : 0,
          profit: bet.profit,
          boostType: bet.boostType,
          placedAt: bet.placedAt,
          settledAt: bet.result === "pending" ? null : bet.placedAt,
        },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/analytics");
  revalidatePath("/");

  return {
    ok: true,
    imported,
    skipped,
    warnings: summary.warnings,
    sheetsSeen: summary.sheetsSeen,
  };
}
