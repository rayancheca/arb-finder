import type { AmericanOdds } from "./types.js";

/**
 * American odds → decimal payout multiplier.
 * A $1 stake at +150 returns $2.50 total (profit $1.50 + stake $1).
 * A $1 stake at -200 returns $1.50 total (profit $0.50 + stake $1).
 *
 * Excel parity: matches `calc!C8 = if(C5>0, C5/100+1, 100/(-1*C5)+1)`
 */
export function americanToDecimal(odds: AmericanOdds): number {
  if (odds === 0) {
    throw new RangeError("American odds cannot be 0");
  }
  return odds > 0 ? odds / 100 + 1 : 100 / -odds + 1;
}

/**
 * American odds → implied probability (0..1), ignoring vig.
 *
 * Excel parity: matches `calc!C7 = if(C5>0, 100/(C5+100), (-1*C5)/((-1*C5)+100))`
 */
export function americanToImpliedProb(odds: AmericanOdds): number {
  if (odds === 0) {
    throw new RangeError("American odds cannot be 0");
  }
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

/**
 * Payout on a standard stake bet (winning bet returns stake + profit).
 *
 * Excel parity: matches `calc!C6 = if(C5>0, C4*(C5/100+1), C4/(-1*C5)*100+C4)`
 */
export function payoutWithStake(stake: number, odds: AmericanOdds): number {
  if (stake < 0) {
    throw new RangeError("Stake cannot be negative");
  }
  return stake * americanToDecimal(odds);
}

/**
 * Profit on a free bet: stake is NOT returned, only the profit portion.
 * Generalized to work for both positive and negative odds (Excel version
 * only handled positive odds correctly).
 *
 * For +odds: profit = stake * (odds / 100)
 * For -odds: profit = stake * (100 / -odds)
 * Either way: profit = stake * (decimal - 1)
 */
export function freeBetProfit(stake: number, odds: AmericanOdds): number {
  if (stake < 0) {
    throw new RangeError("Free bet stake cannot be negative");
  }
  return stake * (americanToDecimal(odds) - 1);
}

/** Round to 2 decimals for display only — never feed this back into further math. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
