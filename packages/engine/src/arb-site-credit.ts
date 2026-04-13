import {
  americanToDecimal,
  americanToImpliedProb,
  payoutWithStake,
} from "./odds.js";
import type { AmericanOdds, ArbResult } from "./types.js";

/**
 * Site-credit / bonus-cash arb. Matches the `bet365 trade` sheet.
 *
 * A site credit is real cash given by the book that must be wagered. It
 * effectively reduces your cost basis by the credit amount — you're
 * playing with house money on top of your own stakes.
 *
 * Strategy: place standard 2-way hedge bets, then subtract the site
 * credit from the cost basis. Guaranteed profit increases by the credit
 * amount vs a pure arb at the same odds.
 *
 * Excel parity: matches `bet365 trade!E4 = C4+D4-100`
 */
export function arbSiteCredit(
  oddsA: AmericanOdds,
  oddsB: AmericanOdds,
  stakeA: number,
  creditAmount: number,
): ArbResult {
  if (stakeA <= 0) {
    throw new RangeError("stakeA must be positive");
  }
  if (creditAmount < 0) {
    throw new RangeError("creditAmount cannot be negative");
  }

  const decA = americanToDecimal(oddsA);
  const decB = americanToDecimal(oddsB);
  const pA = americanToImpliedProb(oddsA);
  const pB = americanToImpliedProb(oddsB);

  const stakeB = (decA / decB) * stakeA;

  const payoutA = payoutWithStake(stakeA, oddsA);
  const payoutB = payoutWithStake(stakeB, oddsB);

  const costBasis = stakeA + stakeB - creditAmount;
  const guaranteedMinProfit = Math.min(payoutA, payoutB) - costBasis;
  const expectedProfit =
    pA * (payoutA - costBasis) + pB * (payoutB - costBasis);
  const bookieTake = pA + pB - 1;
  const isArb = guaranteedMinProfit > 0;
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
