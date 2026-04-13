import {
  americanToDecimal,
  americanToImpliedProb,
  payoutWithStake,
} from "./odds";
import type { AmericanOdds, ArbResult, Side } from "./types";

/**
 * No-sweat / first-bet-safety-net arb. Matches the `no sweat` sheet.
 *
 * A "no sweat" promo refunds your first bet as bonus credit if it loses.
 * The bonus credit converts back to real money at some rate (cashRate),
 * typically 60–80% depending on how you redeem it (selling a prop, using
 * on a -400 favorite, etc.).
 *
 * Strategy: place the no-sweat bet on one side (cash), hedge with cash
 * on the other side. The losing no-sweat outcome is softened by the
 * expected refund value = noSweatStake * cashRate.
 *
 * Effective worst-case payouts:
 *   If side A wins:  payoutA (real) + 0 (no refund, bet won)
 *   If side B wins:  payoutB (real) + noSweatStake * cashRate (refund value)
 *
 * We equalize these so guaranteed profit is the same either way.
 */
export function arbNoSweat(
  oddsNoSweatSide: AmericanOdds,
  oddsHedgeSide: AmericanOdds,
  noSweatStake: number,
  cashRate: number,
  onSide: Side = "A",
): ArbResult {
  if (noSweatStake <= 0) {
    throw new RangeError("noSweatStake must be positive");
  }
  if (cashRate < 0 || cashRate > 1) {
    throw new RangeError("cashRate must be in [0, 1]");
  }

  const decNS = americanToDecimal(oddsNoSweatSide);
  const decHedge = americanToDecimal(oddsHedgeSide);

  const noSweatPayout = payoutWithStake(noSweatStake, oddsNoSweatSide);
  const refundValue = noSweatStake * cashRate;

  // Effective payout on the no-sweat side INCLUDING the refund value that
  // materializes when that side loses. We want to solve for hedge stake H
  // such that profit(NS wins) == profit(hedge wins).
  //
  //   If NS wins:    noSweatPayout - noSweatStake - H + 0       (refund doesn't trigger)
  //   If hedge wins: H * decHedge - noSweatStake - H + refundValue
  //                = H * (decHedge - 1) - noSweatStake + refundValue
  //
  // Setting equal and solving for H:
  //   noSweatPayout - noSweatStake - H = H * (decHedge - 1) - noSweatStake + refundValue
  //   noSweatPayout - H = H * (decHedge - 1) + refundValue
  //   noSweatPayout - refundValue = H * (decHedge - 1) + H
  //   noSweatPayout - refundValue = H * decHedge
  //   H = (noSweatPayout - refundValue) / decHedge
  const hedgeStake = (noSweatPayout - refundValue) / decHedge;
  const hedgePayout = payoutWithStake(hedgeStake, oddsHedgeSide);

  const costBasis = noSweatStake + hedgeStake;

  const profitIfNoSweatWins = noSweatPayout - costBasis;
  const profitIfHedgeWins = hedgePayout + refundValue - costBasis;
  const guaranteedMinProfit = Math.min(
    profitIfNoSweatWins,
    profitIfHedgeWins,
  );

  const pNS = americanToImpliedProb(oddsNoSweatSide);
  const pHedge = americanToImpliedProb(oddsHedgeSide);
  const expectedProfit =
    pNS * profitIfNoSweatWins + pHedge * profitIfHedgeWins;

  const bookieTake = pNS + pHedge - 1;
  const isArb = guaranteedMinProfit > 0;
  const netReturnPct = guaranteedMinProfit / costBasis;

  const legNS = {
    side: onSide,
    odds: oddsNoSweatSide,
    stake: noSweatStake,
    payoutIfWin: noSweatPayout,
  };
  const legHedge = {
    side: (onSide === "A" ? "B" : "A") as Side,
    odds: oddsHedgeSide,
    stake: hedgeStake,
    payoutIfWin: hedgePayout,
  };

  return {
    legA: onSide === "A" ? legNS : legHedge,
    legB: onSide === "A" ? legHedge : legNS,
    costBasis,
    guaranteedMinProfit,
    expectedProfit,
    netReturnPct,
    isArb,
    bookieTake,
  };
}
