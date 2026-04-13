import {
  americanToDecimal,
  americanToImpliedProb,
  freeBetProfit,
  payoutWithStake,
} from "./odds";
import type { AmericanOdds, ArbResult, Side } from "./types";

/**
 * Free-bet conversion arb. Matches the `free bet` sheet with a generalized
 * free-bet payout formula (the Excel version only worked correctly for
 * positive odds on the free-bet side).
 *
 * A free bet is a token: if it loses, you lose nothing. If it wins, you
 * receive only the profit (stake is NOT returned).
 *
 * Strategy: place the free bet on the HIGH-ODDS side (side with +odds),
 * then cash-hedge on the other side. Cost basis = only the cash hedge.
 *
 * The user places the free bet on `onSide`. We compute the optimal cash
 * hedge on the opposite side such that the two possible outcomes (free bet
 * wins vs cash hedge wins) yield equal net profit.
 *
 *   Let F = free bet stake (paid by the book, not by us)
 *   Let H = cash hedge stake (paid by us, this is our cost basis)
 *   If free bet wins:  profit = F * (decF - 1) - H
 *   If hedge wins:     profit = H * (decH - 1)     ... we lost F which was free
 *
 * Equalize:  F * (decF - 1) - H = H * (decH - 1)
 *            F * (decF - 1) = H * decH
 *            H = F * (decF - 1) / decH
 */
export function arbFreeBet(
  oddsFreeBetSide: AmericanOdds,
  oddsCashSide: AmericanOdds,
  freeBetStake: number,
  onSide: Side = "A",
): ArbResult {
  if (freeBetStake <= 0) {
    throw new RangeError("freeBetStake must be positive");
  }

  const decFreeBet = americanToDecimal(oddsFreeBetSide);
  const decCash = americanToDecimal(oddsCashSide);

  const freeBetProfitIfWin = freeBetProfit(freeBetStake, oddsFreeBetSide);
  const cashHedgeStake = freeBetProfitIfWin / decCash;

  const freeBetPayout = freeBetStake + freeBetProfitIfWin;
  const cashHedgePayout = payoutWithStake(cashHedgeStake, oddsCashSide);

  const costBasis = cashHedgeStake;

  // Worst-case guaranteed profit:
  //  - free bet wins: freeBetProfitIfWin - cashHedgeStake
  //  - cash wins:     cashHedgePayout - cashHedgeStake  =  cashHedgeStake * (decCash - 1)
  const profitIfFreeBetWins = freeBetProfitIfWin - cashHedgeStake;
  const profitIfCashWins = cashHedgePayout - cashHedgeStake;
  const guaranteedMinProfit = Math.min(profitIfFreeBetWins, profitIfCashWins);

  const pFree = americanToImpliedProb(oddsFreeBetSide);
  const pCash = americanToImpliedProb(oddsCashSide);
  const expectedProfit =
    pFree * profitIfFreeBetWins + pCash * profitIfCashWins;

  const bookieTake = pFree + pCash - 1;
  const isArb = guaranteedMinProfit > 0;
  const netReturnPct = guaranteedMinProfit / freeBetStake;

  const legFree = {
    side: onSide,
    odds: oddsFreeBetSide,
    stake: freeBetStake,
    payoutIfWin: freeBetPayout,
  };
  const legCash = {
    side: (onSide === "A" ? "B" : "A") as Side,
    odds: oddsCashSide,
    stake: cashHedgeStake,
    payoutIfWin: cashHedgePayout,
  };

  return {
    legA: onSide === "A" ? legFree : legCash,
    legB: onSide === "A" ? legCash : legFree,
    costBasis,
    guaranteedMinProfit,
    expectedProfit,
    netReturnPct,
    isArb,
    bookieTake,
  };
}
