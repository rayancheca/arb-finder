import { americanToDecimal } from "./odds";
import type { AmericanOdds } from "./types";

export interface RiskOfRuinParams {
  readonly bankroll: number;
  readonly stakePerBet: number;
  readonly winProb: number;
  readonly odds: AmericanOdds;
  readonly numBets: number;
  readonly numSimulations: number;
  readonly ruinThreshold?: number;
}

export interface RiskOfRuinResult {
  readonly ruinProbability: number;
  readonly medianFinalBankroll: number;
  readonly meanFinalBankroll: number;
  readonly p5: number;
  readonly p95: number;
  readonly finalBankrolls: ReadonlyArray<number>;
}

/**
 * Monte Carlo risk-of-ruin simulation.
 *
 * For each simulation: run numBets flat-stake bets at (winProb, odds),
 * track whether bankroll ever drops below ruinThreshold. Return the
 * fraction of simulations that hit ruin plus distributional stats.
 *
 * This is a simple version; real bet-by-bet bankroll simulation with
 * variable stakes lives in the Kelly calculator UI.
 */
export function simulateRiskOfRuin(
  params: RiskOfRuinParams,
): RiskOfRuinResult {
  const {
    bankroll,
    stakePerBet,
    winProb,
    odds,
    numBets,
    numSimulations,
    ruinThreshold = 0,
  } = params;

  if (numSimulations <= 0) {
    throw new RangeError("numSimulations must be positive");
  }
  if (numBets <= 0) {
    throw new RangeError("numBets must be positive");
  }

  const decimalOdds = americanToDecimal(odds);
  const profitPerWin = stakePerBet * (decimalOdds - 1);

  let ruinCount = 0;
  const finals = new Array<number>(numSimulations);
  let sumFinal = 0;

  for (let i = 0; i < numSimulations; i++) {
    let bk = bankroll;
    let hitRuin = false;
    for (let j = 0; j < numBets; j++) {
      if (bk < stakePerBet) {
        hitRuin = true;
        bk = Math.max(0, bk);
        break;
      }
      if (Math.random() < winProb) {
        bk += profitPerWin;
      } else {
        bk -= stakePerBet;
      }
      if (bk <= ruinThreshold) {
        hitRuin = true;
        break;
      }
    }
    if (hitRuin) ruinCount++;
    finals[i] = bk;
    sumFinal += bk;
  }

  const sorted = [...finals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p5 = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;

  return {
    ruinProbability: ruinCount / numSimulations,
    medianFinalBankroll: median,
    meanFinalBankroll: sumFinal / numSimulations,
    p5,
    p95,
    finalBankrolls: finals,
  };
}
