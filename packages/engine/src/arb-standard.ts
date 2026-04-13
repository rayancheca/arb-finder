import {
  americanToDecimal,
  americanToImpliedProb,
  payoutWithStake,
} from "./odds.js";
import type { AmericanOdds, ArbResult } from "./types.js";

/**
 * Standard 2-way arbitrage. Matches the `calc` sheet.
 *
 * Given odds on both sides and a stake on side A, compute the optimal
 * stake on side B such that payouts are equalized (minimum-variance
 * hedge that locks guaranteed profit when an arb exists).
 *
 * Hedge formula: stakeB = (decA / decB) * stakeA
 * — Excel parity: matches `calc!D10 = ROUNDDOWN(C8/D8*C10, 2)`
 *
 * An arb exists when implied_prob(A) + implied_prob(B) < 1.
 * guaranteedMinProfit = min(payoutA, payoutB) - (stakeA + stakeB)
 */
export function arbStandard(
  oddsA: AmericanOdds,
  oddsB: AmericanOdds,
  stakeA: number,
): ArbResult {
  if (stakeA <= 0) {
    throw new RangeError("stakeA must be positive");
  }

  const decA = americanToDecimal(oddsA);
  const decB = americanToDecimal(oddsB);
  const pA = americanToImpliedProb(oddsA);
  const pB = americanToImpliedProb(oddsB);

  const stakeB = (decA / decB) * stakeA;

  const payoutA = payoutWithStake(stakeA, oddsA);
  const payoutB = payoutWithStake(stakeB, oddsB);

  const costBasis = stakeA + stakeB;
  const guaranteedMinProfit = Math.min(payoutA, payoutB) - costBasis;
  const expectedProfit = pA * (payoutA - costBasis) + pB * (payoutB - costBasis);
  const bookieTake = pA + pB - 1;
  const isArb = bookieTake < 0;
  const netReturnPct = guaranteedMinProfit / costBasis;

  return {
    legA: {
      side: "A",
      odds: oddsA,
      stake: stakeA,
      payoutIfWin: payoutA,
    },
    legB: {
      side: "B",
      odds: oddsB,
      stake: stakeB,
      payoutIfWin: payoutB,
    },
    costBasis,
    guaranteedMinProfit,
    expectedProfit,
    netReturnPct,
    isArb,
    bookieTake,
  };
}
