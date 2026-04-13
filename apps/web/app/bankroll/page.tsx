import { prisma } from "@/lib/db";
import { BankrollClient } from "@/components/bankroll/BankrollClient";

export const dynamic = "force-dynamic";

export default async function BankrollPage() {
  const books = await prisma.book.findMany({
    include: {
      bankrollEntries: {
        orderBy: { snappedAt: "desc" },
        take: 1,
      },
    },
  });

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

  return <BankrollClient books={bookBalances} />;
}
