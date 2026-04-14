/**
 * Excel history import.
 *
 * Rayan's existing "sportbook calculator" workbook has three history-bearing
 * sheets:
 *   - profit tracker — every bet, one row per leg
 *   - daily tracker — one row per day, net P&L
 *   - bet365 trade  — specific bet365 trade sheet
 *
 * This module accepts an ArrayBuffer (uploaded file), detects which sheets
 * are present, and emits typed BetInput rows that a Server Action can
 * persist. Header detection is fuzzy — we look for column names that
 * contain "book", "stake", "odds", "profit", etc. — so minor workbook
 * drift doesn't break the importer.
 */

import ExcelJS from "exceljs";

export interface BetInput {
  readonly bookKey: string;
  readonly eventLabel?: string;
  readonly side?: string;
  readonly americanOdds: number;
  readonly stake: number;
  readonly profit: number;
  readonly result: "won" | "lost" | "void" | "pending" | "cashed";
  readonly boostType: string;
  readonly placedAt: Date;
}

export interface ImportSummary {
  readonly bets: ReadonlyArray<BetInput>;
  readonly warnings: ReadonlyArray<string>;
  readonly sheetsSeen: ReadonlyArray<string>;
}

type HeaderMap = Map<string, number>;

function normalizeHeader(h: unknown): string {
  if (h == null) return "";
  return String(h).toLowerCase().replace(/[_\s]+/g, " ").trim();
}

function indexHeaders(row: ExcelJS.Row): HeaderMap {
  const map: HeaderMap = new Map();
  row.eachCell((cell, col) => {
    const key = normalizeHeader(cell.value);
    if (key) map.set(key, col);
  });
  return map;
}

function findCol(headers: HeaderMap, candidates: string[]): number | null {
  for (const c of candidates) {
    for (const [key, col] of headers) {
      if (key === c || key.includes(c)) return col;
    }
  }
  return null;
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,+\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && v && "result" in v && typeof (v as { result: unknown }).result === "number") {
    return (v as { result: number }).result;
  }
  return null;
}

function asDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "number") {
    // Excel serial date
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  return null;
}

function normalizeBook(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return "";
  if (s.includes("fanduel")) return "fanduel";
  if (s.includes("draftking") || s === "dk") return "draftkings";
  if (s.includes("mgm")) return "betmgm";
  if (s.includes("caesar") || s === "czr") return "caesars";
  if (s.includes("bet365") || s === "b365") return "bet365";
  if (s.includes("betriver") || s === "br") return "betrivers";
  if (s.includes("fanatic")) return "fanatics";
  if (s.includes("espn")) return "espnbet";
  return "";
}

function normalizeResult(raw: unknown): BetInput["result"] {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s.startsWith("w")) return "won";
  if (s.startsWith("l")) return "lost";
  if (s.startsWith("v") || s.includes("push")) return "void";
  if (s.startsWith("c") || s.includes("cash")) return "cashed";
  return "pending";
}

function normalizeBoost(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s || s === "standard") return "standard";
  if (s.includes("free")) return "free_bet";
  if (s.includes("no sweat") || s.includes("nosweat")) return "no_sweat";
  if (s.includes("site") || s.includes("credit")) return "site_credit";
  if (s.includes("profit") || s.includes("boost")) return "profit_boost";
  return "standard";
}

/** Extract bets from the profit tracker sheet. */
function parseProfitTracker(
  sheet: ExcelJS.Worksheet,
  warnings: string[],
): BetInput[] {
  if (sheet.rowCount < 2) return [];
  const headerRow = sheet.getRow(1);
  const headers = indexHeaders(headerRow);

  const cols = {
    book: findCol(headers, ["book", "sportsbook"]),
    event: findCol(headers, ["event", "game", "match"]),
    side: findCol(headers, ["side", "selection", "team"]),
    odds: findCol(headers, ["odds", "american", "price"]),
    stake: findCol(headers, ["stake", "wager", "bet amount", "amount"]),
    profit: findCol(headers, ["profit", "p&l", "pnl", "net"]),
    result: findCol(headers, ["result", "status", "outcome"]),
    date: findCol(headers, ["date", "placed", "time"]),
    boost: findCol(headers, ["boost", "promo", "type"]),
  };

  if (!cols.book || !cols.stake || !cols.odds) {
    warnings.push(
      `Profit tracker sheet missing required columns (book/stake/odds) — skipping`,
    );
    return [];
  }

  const out: BetInput[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const book = normalizeBook(row.getCell(cols.book).value);
    if (!book) continue;
    const stake = asNumber(row.getCell(cols.stake).value);
    const odds = asNumber(row.getCell(cols.odds).value);
    if (stake == null || odds == null) continue;
    const profit =
      (cols.profit && asNumber(row.getCell(cols.profit).value)) ?? 0;
    const placedAtRaw = cols.date
      ? asDate(row.getCell(cols.date).value)
      : null;
    const placedAt: Date = placedAtRaw ?? new Date();
    const result = cols.result
      ? normalizeResult(row.getCell(cols.result).value)
      : "settled" as never;
    out.push({
      bookKey: book,
      eventLabel:
        cols.event != null
          ? String(row.getCell(cols.event).value ?? "")
          : undefined,
      side:
        cols.side != null
          ? String(row.getCell(cols.side).value ?? "")
          : undefined,
      americanOdds: odds,
      stake,
      profit,
      result: result === ("settled" as never) ? "won" : result,
      boostType: cols.boost
        ? normalizeBoost(row.getCell(cols.boost).value)
        : "standard",
      placedAt,
    });
  }
  return out;
}

export async function importExcelHistory(
  buffer: ArrayBuffer,
): Promise<ImportSummary> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const warnings: string[] = [];
  const sheetsSeen: string[] = [];
  const bets: BetInput[] = [];

  workbook.eachSheet((sheet) => {
    const name = sheet.name.toLowerCase();
    sheetsSeen.push(sheet.name);
    if (name.includes("profit tracker") || name.includes("profittracker")) {
      bets.push(...parseProfitTracker(sheet, warnings));
    }
    // The daily tracker rolls up per-day P&L and isn't per-bet; we skip it
    // for the persistence path since we'd lose the leg-level detail that
    // Analytics needs. bet365 trade sheet is handled identically to profit
    // tracker via the same column detector.
    if (name.includes("bet365") || name.includes("trade")) {
      bets.push(...parseProfitTracker(sheet, warnings));
    }
  });

  if (bets.length === 0) {
    warnings.push(
      `No bet rows were parsed. Double-check that your workbook has a sheet ` +
        `with columns for book, stake, and odds (column names are matched ` +
        `case-insensitively).`,
    );
  }

  return { bets, warnings, sheetsSeen };
}
