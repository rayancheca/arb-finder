import Link from "next/link";
import { Search as SearchIcon, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { BookChip } from "@/components/ui/BookChip";
import { OddsCell } from "@/components/ui/OddsCell";
import { formatPct, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function americanToImplied(odds: number): number {
  if (odds >= 100) return 100 / (odds + 100);
  if (odds <= -100) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 0.5;
}

interface BookRow {
  bookId: string;
  bookName: string;
  bookColor: string;
  home: number | null;
  away: number | null;
}

interface BestBet {
  homeBook: BookRow | null;
  homeOdds: number | null;
  awayBook: BookRow | null;
  awayOdds: number | null;
  /** Implied probability sum — <1 means true arb, >1 means vig exists */
  impliedSum: number | null;
  /** Edge in %. Positive means arb; negative means vig you'd eat. */
  edgePct: number | null;
}

function computeBestBet(rows: BookRow[]): BestBet {
  let homeBook: BookRow | null = null;
  let homeOdds: number | null = null;
  let awayBook: BookRow | null = null;
  let awayOdds: number | null = null;

  for (const r of rows) {
    // "Best" home odds = highest positive American (or least-negative) —
    // which is the lowest implied probability for the home side.
    if (r.home !== null) {
      if (homeOdds === null || americanToImplied(r.home) < americanToImplied(homeOdds)) {
        homeBook = r;
        homeOdds = r.home;
      }
    }
    if (r.away !== null) {
      if (awayOdds === null || americanToImplied(r.away) < americanToImplied(awayOdds)) {
        awayBook = r;
        awayOdds = r.away;
      }
    }
  }

  let impliedSum: number | null = null;
  let edgePct: number | null = null;
  if (homeOdds !== null && awayOdds !== null) {
    impliedSum =
      americanToImplied(homeOdds) + americanToImplied(awayOdds);
    // A hedge costs `impliedSum` to guarantee 1 unit — edge = 1/impliedSum - 1
    edgePct = 1 / impliedSum - 1;
  }

  return { homeBook, homeOdds, awayBook, awayOdds, impliedSum, edgePct };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  const events = await prisma.event.findMany({
    where: q
      ? {
          OR: [
            { homeTeam: { contains: q } },
            { awayTeam: { contains: q } },
          ],
        }
      : undefined,
    include: {
      markets: {
        include: {
          selections: {
            include: { book: true },
          },
        },
      },
      arbOpps: {
        orderBy: { netReturnPct: "desc" },
        take: 1,
      },
    },
    take: 20,
    orderBy: { commenceTime: "asc" },
  });

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <div className="mb-5">
        <h1 className="text-[28px] font-semibold tracking-tighter">Search</h1>
        <p className="mt-2 text-[13px] text-text-dim">
          Query any team or matchup to see every 2-way market across every
          book. Best line on each side is highlighted, and the combined edge
          tells you instantly whether an arb exists.
        </p>
      </div>

      <form className="mb-5" action="/search" method="get">
        <div className="flex items-center gap-2 rounded-[9px] border border-border bg-surface px-3.5 py-2.5 focus-within:border-accent/50">
          <SearchIcon className="h-4 w-4 text-text-faint" />
          <input
            autoFocus
            name="q"
            defaultValue={q}
            placeholder="Try: Lakers, Celtics, Warriors…"
            className="flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-faint"
          />
          <span className="mono-num rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-faint">
            ↵
          </span>
        </div>
      </form>

      <div className="flex flex-col gap-4">
        {events.length === 0 && (
          <div className="py-12 text-center text-[13px] text-text-faint">
            {q
              ? `No events match "${q}". Try a different team name.`
              : "Start typing a team name to search."}
          </div>
        )}

        {events.map((event) => {
          const moneyline = event.markets.find((m) => m.type === "moneyline");
          if (!moneyline) return null;

          const rows = moneyline.selections
            .sort((a, b) => a.book.name.localeCompare(b.book.name))
            .reduce<BookRow[]>((acc, sel) => {
              let row = acc.find((r) => r.bookId === sel.bookId);
              if (!row) {
                row = {
                  bookId: sel.bookId,
                  bookName: sel.book.name,
                  bookColor: sel.book.color,
                  home: null,
                  away: null,
                };
                acc.push(row);
              }
              if (sel.side === "home") row.home = sel.americanOdds;
              if (sel.side === "away") row.away = sel.americanOdds;
              return acc;
            }, []);

          const bestBet = computeBestBet(rows);
          const bestArb = event.arbOpps[0];
          const isArb = bestBet.edgePct !== null && bestBet.edgePct > 0;

          return (
            <SurfaceCard key={event.id} pad={false}>
              {/* Header row */}
              <div className="flex items-start justify-between px-5 pt-4">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight text-text">
                    {event.awayTeam}{" "}
                    <span className="text-text-faint">@</span>{" "}
                    {event.homeTeam}
                  </h3>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-text-faint">
                    NBA · Moneyline ·{" "}
                    <span className="normal-case tracking-normal">
                      {formatRelativeTime(event.commenceTime)}
                    </span>
                    <span className="mx-1.5">·</span>
                    {rows.length} books
                  </div>
                </div>
                {bestArb && (
                  <Link
                    href={`/opp/${bestArb.id}`}
                    className="inline-flex items-center gap-1.5 rounded-[6px] border border-profit/40 bg-profit-bg px-2.5 py-1.5 text-[10px] font-semibold text-profit transition-colors hover:bg-profit/20"
                  >
                    <span className="mono-num">
                      {formatPct(bestArb.netReturnPct, 2)}
                    </span>
                    <span className="uppercase tracking-[0.08em]">
                      open opp →
                    </span>
                  </Link>
                )}
              </div>

              {/* Best-bet summary strip */}
              {bestBet.homeBook && bestBet.awayBook && (
                <div
                  className={cn(
                    "mt-3 mx-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[9px] border px-4 py-2.5 text-[11px]",
                    isArb
                      ? "border-profit/35 bg-profit-bg"
                      : "border-border bg-surface-sunken",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase tracking-[0.08em] text-text-faint">
                      Best {event.awayTeam}
                    </span>
                    <BookChip
                      name={bestBet.awayBook.bookName}
                      color={bestBet.awayBook.bookColor}
                    />
                    <span className="mono-num text-text">
                      {bestBet.awayOdds !== null && (
                        <OddsCell odds={bestBet.awayOdds} />
                      )}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase tracking-[0.08em] text-text-faint">
                      Best {event.homeTeam}
                    </span>
                    <BookChip
                      name={bestBet.homeBook.bookName}
                      color={bestBet.homeBook.bookColor}
                    />
                    <span className="mono-num text-text">
                      {bestBet.homeOdds !== null && (
                        <OddsCell odds={bestBet.homeOdds} />
                      )}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <TrendingUp
                      className={cn(
                        "h-3 w-3",
                        isArb ? "text-profit" : "text-text-faint",
                      )}
                    />
                    <span className="text-[9px] uppercase tracking-[0.08em] text-text-faint">
                      Combined edge
                    </span>
                    <span
                      className={cn(
                        "mono-num font-semibold",
                        isArb ? "text-profit" : "text-loss",
                      )}
                    >
                      {bestBet.edgePct !== null &&
                        formatPct(bestBet.edgePct, 2)}
                    </span>
                    <span className="text-[9px] text-text-faint">
                      ({(bestBet.impliedSum! * 100).toFixed(1)}% implied)
                    </span>
                  </div>
                </div>
              )}

              {/* Per-book odds grid */}
              <div className="mt-3 border-t border-border">
                <div className="grid grid-cols-8 gap-3 px-5 py-3 text-[10px] uppercase tracking-[0.1em] text-text-faint">
                  <div className="col-span-2">Book</div>
                  <div className="col-span-3 text-right">{event.awayTeam}</div>
                  <div className="col-span-3 text-right">{event.homeTeam}</div>
                </div>
                {rows.map((row) => {
                  const awayBest = row.bookId === bestBet.awayBook?.bookId;
                  const homeBest = row.bookId === bestBet.homeBook?.bookId;
                  return (
                    <div
                      key={row.bookId}
                      className="grid grid-cols-8 items-center gap-3 border-t border-border px-5 py-2.5 text-[13px] hover:bg-surface-raised"
                    >
                      <div className="col-span-2">
                        <BookChip name={row.bookName} color={row.bookColor} />
                      </div>
                      <div
                        className={cn(
                          "col-span-3 flex items-center justify-end gap-1.5",
                          awayBest &&
                            "rounded-md bg-profit-bg/40 px-2 ring-1 ring-profit/30",
                        )}
                      >
                        {awayBest && (
                          <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-profit">
                            best
                          </span>
                        )}
                        {row.away !== null && <OddsCell odds={row.away} />}
                      </div>
                      <div
                        className={cn(
                          "col-span-3 flex items-center justify-end gap-1.5",
                          homeBest &&
                            "rounded-md bg-profit-bg/40 px-2 ring-1 ring-profit/30",
                        )}
                      >
                        {homeBest && (
                          <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-profit">
                            best
                          </span>
                        )}
                        {row.home !== null && <OddsCell odds={row.home} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </div>
  );
}
