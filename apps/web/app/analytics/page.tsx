import { prisma } from "@/lib/db";
import { AnalyticsClient } from "@/components/analytics/AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [bets, books] = await Promise.all([
    prisma.bet.findMany({ orderBy: { placedAt: "asc" } }),
    prisma.book.findMany(),
  ]);

  return (
    <AnalyticsClient
      bets={bets.map((b) => ({
        id: b.id,
        bookId: b.bookId,
        stake: b.stake,
        profit: b.profit,
        result: b.result,
        boostType: b.boostType,
        placedAt: b.placedAt.toISOString(),
        americanOdds: b.americanOdds,
        evAtPlacement: b.evAtPlacement,
      }))}
      books={books.map((b) => ({
        id: b.id,
        name: b.name,
        color: b.color,
      }))}
    />
  );
}
