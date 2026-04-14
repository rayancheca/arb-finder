import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { BookChip } from "@/components/ui/BookChip";
import { OddsCell } from "@/components/ui/OddsCell";
import { formatMoney, formatPct, formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

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
          book.
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

      <div className="flex flex-col gap-3">
        {events.length === 0 && (
          <div className="py-12 text-center text-[13px] text-text-faint">
            No events match "{q}". Try a different team name.
          </div>
        )}
        {events.map((event) => {
          const moneyline = event.markets.find((m) => m.type === "moneyline");
          if (!moneyline) return null;
          const bestArb = event.arbOpps[0];
          return (
            <SurfaceCard key={event.id} pad={false}>
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
                      arb available →
                    </span>
                  </Link>
                )}
              </div>
              <div className="mt-3 border-t border-border">
                <div className="grid grid-cols-8 gap-3 px-5 py-3 text-[10px] uppercase tracking-[0.1em] text-text-faint">
                  <div className="col-span-2">Book</div>
                  <div className="col-span-3 text-right">{event.awayTeam}</div>
                  <div className="col-span-3 text-right">{event.homeTeam}</div>
                </div>
                {moneyline.selections
                  .sort((a, b) => a.book.name.localeCompare(b.book.name))
                  .reduce<
                    Array<{
                      bookId: string;
                      bookName: string;
                      bookColor: string;
                      home: number | null;
                      away: number | null;
                    }>
                  >((acc, sel) => {
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
                  }, [])
                  .map((row) => (
                    <div
                      key={row.bookId}
                      className="grid grid-cols-8 items-center gap-3 border-t border-border px-5 py-2.5 text-[13px] hover:bg-surface-raised"
                    >
                      <div className="col-span-2">
                        <BookChip name={row.bookName} color={row.bookColor} />
                      </div>
                      <div className="col-span-3 text-right">
                        {row.away !== null && <OddsCell odds={row.away} />}
                      </div>
                      <div className="col-span-3 text-right">
                        {row.home !== null && <OddsCell odds={row.home} />}
                      </div>
                    </div>
                  ))}
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </div>
  );
}
