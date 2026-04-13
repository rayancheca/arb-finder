import { americanToDecimal } from "./odds.js";
import type { AmericanOdds } from "./types.js";

/**
 * Kelly criterion for a single bet.
 *
 *   f* = (bp - q) / b
 *
 * where:
 *   b = decimal_odds - 1  (net profit per unit wagered on a win)
 *   p = true probability of winning
 *   q = 1 - p
 *
 * Returns the fraction of bankroll to stake. Negative means don't bet.
 */
export function kellyFraction(
  trueWinProb: number,
  odds: AmericanOdds,
): number {
  if (trueWinProb < 0 || trueWinProb > 1) {
    throw new RangeError("trueWinProb must be in [0, 1]");
  }
  const b = americanToDecimal(odds) - 1;
  if (b <= 0) {
    return 0;
  }
  const p = trueWinProb;
  const q = 1 - p;
  return (b * p - q) / b;
}

/**
 * Fractional Kelly (e.g. half-Kelly, quarter-Kelly). The most common
 * recommendation in practice is 1/4 Kelly — full Kelly has enormous
 * variance and real-world edges are almost always overestimated.
 */
export function fractionalKellyStake(
  bankroll: number,
  trueWinProb: number,
  odds: AmericanOdds,
  fraction: number,
): number {
  if (bankroll < 0) {
    throw new RangeError("bankroll cannot be negative");
  }
  if (fraction < 0 || fraction > 1) {
    throw new RangeError("fraction must be in [0, 1]");
  }
  const f = kellyFraction(trueWinProb, odds);
  if (f <= 0) {
    return 0;
  }
  return bankroll * f * fraction;
}
