/**
 * Derivations that pull signal out of the raw Bet history.
 *
 *  - ev-leak: cumulative theoretical EV vs cumulative realized P&L.
 *    A widening gap means your actual placements are worse than what the
 *    engine told you to place, usually because of slippage between
 *    quote time and click time.
 *
 *  - slippage-per-book: median delta between the odds you intended to bet
 *    (stored in Bet.label/evAtPlacement) and the odds you actually got.
 *    For the seed/early data this is a monotone stand-in until real
 *    intended-odds tracking lands via the Chrome extension.
 *
 *  - learned cash conversion rate per book: for no-sweat and free-bet
 *    offers, the ratio of realized profit to the nominal boost amount.
 *    Replaces the hardcoded 0.65 default when we have ≥10 settled bets
 *    for that book.
 */

export interface BetRow {
  readonly id: string;
  readonly bookId: string;
  readonly stake: number;
  readonly profit: number;
  readonly result: string;
  readonly boostType: string;
  readonly placedAt: string;
  readonly evAtPlacement?: number | null;
  readonly americanOdds?: number | null;
}

export interface EvLeakPoint {
  readonly t: string;
  readonly theoretical: number;
  readonly realized: number;
  readonly gap: number;
}

function americanToDecimal(odds: number): number {
  if (odds >= 100) return 1 + odds / 100;
  if (odds <= -100) return 1 + 100 / Math.abs(odds);
  return 1;
}

function theoreticalEv(
  stake: number,
  americanOdds: number | null | undefined,
  evAtPlacement: number | null | undefined,
): number {
  // Prefer the explicitly stored EV snapshot if we have it.
  if (evAtPlacement != null) return evAtPlacement;
  // Fallback: treat the midline fair probability as 1/decimal
  // and approximate EV as stake × edge over true fair. Without a
  // ground-truth fair line we approximate a 3% market edge so the
  // curve at least trends in the right direction for seed data.
  if (americanOdds == null) return 0;
  const dec = americanToDecimal(americanOdds);
  const fairDec = dec * 0.97;
  return stake * (dec - fairDec);
}

export function computeEvLeak(bets: ReadonlyArray<BetRow>): EvLeakPoint[] {
  const sorted = [...bets].sort(
    (a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime(),
  );
  let theoretical = 0;
  let realized = 0;
  const points: EvLeakPoint[] = [];
  for (const bet of sorted) {
    theoretical += theoreticalEv(bet.stake, bet.americanOdds, bet.evAtPlacement);
    realized += bet.profit;
    points.push({
      t: new Date(bet.placedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      theoretical: Number(theoretical.toFixed(2)),
      realized: Number(realized.toFixed(2)),
      gap: Number((theoretical - realized).toFixed(2)),
    });
  }
  return points;
}

export interface SlippageRow {
  readonly bookId: string;
  readonly name: string;
  readonly color: string;
  readonly avgEdgeLost: number;
  readonly betCount: number;
}

export function computeSlippageByBook(
  bets: ReadonlyArray<BetRow>,
  books: ReadonlyArray<{ id: string; name: string; color: string }>,
): SlippageRow[] {
  return books
    .map((b) => {
      const bookBets = bets.filter((x) => x.bookId === b.id);
      if (bookBets.length === 0) return null;
      // For every bet, compare the realized profit to the theoretical EV.
      // A negative delta per $100 staked is "edge lost" — how much worse
      // we did than the engine's projection.
      let totalEdgeLost = 0;
      let totalStake = 0;
      for (const bet of bookBets) {
        const ev = theoreticalEv(bet.stake, bet.americanOdds, bet.evAtPlacement);
        totalEdgeLost += ev - bet.profit;
        totalStake += bet.stake;
      }
      const avgEdgeLost = totalStake > 0 ? totalEdgeLost / totalStake : 0;
      return {
        bookId: b.id,
        name: b.name,
        color: b.color,
        avgEdgeLost,
        betCount: bookBets.length,
      };
    })
    .filter((x): x is SlippageRow => x !== null)
    .sort((a, b) => b.avgEdgeLost - a.avgEdgeLost);
}

export interface LearnedCashRate {
  readonly bookId: string;
  readonly rate: number;
  readonly sampleSize: number;
  readonly confident: boolean;
}

/**
 * For a given boost type (usually no_sweat / free_bet), compute the actual
 * realized-profit-per-boost-dollar observed on a book. Requires ≥10
 * settled bets for that book; falls back to the default 0.65 otherwise.
 */
export function computeLearnedCashRates(
  bets: ReadonlyArray<BetRow>,
  books: ReadonlyArray<{ id: string }>,
  boostType: "no_sweat" | "free_bet" = "no_sweat",
  fallback = 0.65,
): LearnedCashRate[] {
  return books.map((b) => {
    const relevant = bets.filter(
      (x) =>
        x.bookId === b.id &&
        x.boostType === boostType &&
        (x.result === "won" || x.result === "lost"),
    );
    if (relevant.length < 10) {
      return {
        bookId: b.id,
        rate: fallback,
        sampleSize: relevant.length,
        confident: false,
      };
    }
    const totalStake = relevant.reduce((a, x) => a + x.stake, 0);
    const totalProfit = relevant.reduce((a, x) => a + x.profit, 0);
    const rate = totalStake > 0 ? Math.max(0, totalProfit / totalStake + 1) : fallback;
    return {
      bookId: b.id,
      rate: Math.min(1, rate),
      sampleSize: relevant.length,
      confident: true,
    };
  });
}
