import { Flame, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { BookChip } from "@/components/ui/BookChip";
import { Button } from "@/components/ui/Button";
import { BoostFormDialog } from "@/components/boosts/BoostFormDialog";
import { BoostRowActions } from "@/components/boosts/BoostRowActions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

const BOOST_LABELS: Record<string, string> = {
  free_bet: "Free Bet",
  no_sweat: "No Sweat",
  site_credit: "Site Credit",
  profit_boost: "Profit Boost",
  standard: "Standard",
};

function expiryLabel(activeTo: Date | null): string {
  if (!activeTo) return "No expiration";
  const ms = activeTo.getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `Expires in ${hours}h`;
  }
  return `Expires in ${days}d`;
}

export const dynamic = "force-dynamic";

export default async function BoostsPage() {
  const boosts = await prisma.boost.findMany({
    orderBy: [{ active: "desc" }, { type: "asc" }],
    include: { book: true },
  });
  const books = await prisma.book.findMany({ orderBy: { name: "asc" } });
  const bookLite = books.map((b) => ({ id: b.id, name: b.name, color: b.color }));

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tighter">
            Active boosts
          </h1>
          <p className="mt-2 text-[13px] text-text-dim">
            Promos you currently hold across books. Apply any of these to an
            opportunity to see the amplified return.
          </p>
        </div>
        <BoostFormDialog
          mode="create"
          books={bookLite}
          trigger={
            <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />}>
              Add boost
            </Button>
          }
        />
      </div>

      {boosts.length === 0 ? (
        <SurfaceCard muted className="py-12 text-center">
          <div className="text-[14px] text-text-dim">
            No boosts yet. Add one to amplify your arbs.
          </div>
        </SurfaceCard>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {boosts.map((b) => (
            <SurfaceCard
              key={b.id}
              pad={false}
              className={cn(!b.active && "opacity-60")}
            >
              <div className="flex items-start justify-between p-5">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] bg-boost-bg text-boost">
                      <Flame className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                    <BookChip name={b.book.name} color={b.book.color} />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-boost">
                      {BOOST_LABELS[b.type] ?? b.type}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[15px] font-semibold tracking-tight">
                    {b.title}
                  </h3>
                  {b.description && (
                    <p className="mt-1 text-[12px] text-text-dim">
                      {b.description}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-[0.1em] text-text-faint">
                    Amount
                  </div>
                  <div className="mono-num mt-0.5 text-[18px] font-semibold">
                    {formatMoney(b.amount)}
                  </div>
                  {b.cashRate !== null && (
                    <div className="mt-0.5 mono-num text-[10px] text-text-faint">
                      conv rate {(b.cashRate * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
                <span className="text-[10px] text-text-faint">
                  {b.active ? "Active" : "Disabled"} · {expiryLabel(b.activeTo)}
                </span>
                <div className="flex gap-2">
                  <BoostFormDialog
                    mode="edit"
                    books={bookLite}
                    initial={{
                      id: b.id,
                      bookId: b.bookId,
                      type: b.type,
                      title: b.title,
                      description: b.description,
                      amount: b.amount,
                      cashRate: b.cashRate,
                      activeTo: b.activeTo ? b.activeTo.toISOString() : null,
                    }}
                    trigger={
                      <Button size="sm" variant="ghost">
                        Edit
                      </Button>
                    }
                  />
                  <BoostRowActions id={b.id} active={b.active} />
                </div>
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}

      <SurfaceCard
        className="mt-6"
        muted
        title="All books"
        subtitle={`${books.length} NY sportsbooks tracked`}
      >
        <div className="flex flex-wrap gap-2">
          {books.map((b) => (
            <BookChip key={b.id} name={b.name} color={b.color} size="md" />
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}
