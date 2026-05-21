import { prisma } from "@/lib/db";
import { BankrollClient } from "@/components/bankroll/BankrollClient";
import {
  PendingBetsPanel,
  type PendingBetRow,
} from "@/components/bankroll/PendingBetsPanel";

export const dynamic = "force-dynamic";

export default async function BankrollPage() {
  const [books, pendingBets] = await Promise.all([
    prisma.book.findMany({
      include: {
        bankrollEntries: {
          orderBy: { snappedAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.bet.findMany({
      where: { result: "pending" },
      orderBy: { placedAt: "desc" },
      include: { book: true, event: true },
    }),
  ]);

  const bookBalances = books.map((b) => {
    const latest = b.bankrollEntries[0];
    return {
      id: b.id,
      name: b.name,
      color: b.color,
      balance: latest?.balance ?? 0,
      exposed: latest?.exposed ?? 0,
    };
  });

  // Serialize Date → ISO so the client component receives plain JSON.
  const pending: ReadonlyArray<PendingBetRow> = pendingBets.map((b) => ({
    id: b.id,
    side: b.side,
    label: b.label,
    americanOdds: b.americanOdds,
    stake: b.stake,
    boostType: b.boostType,
    placedAt: b.placedAt.toISOString(),
    book: {
      id: b.book.id,
      name: b.book.name,
      color: b.book.color,
    },
    event: b.event
      ? {
          id: b.event.id,
          homeTeam: b.event.homeTeam,
          awayTeam: b.event.awayTeam,
        }
      : null,
  }));

  return (
    <>
      <BankrollClient books={bookBalances} />
      <div className="mx-auto max-w-[1320px] px-6 pb-10">
        <PendingBetsPanel bets={pending} />
      </div>
    </>
  );
}
