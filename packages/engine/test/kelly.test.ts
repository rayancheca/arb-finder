import { describe, expect, it } from "vitest";
import { fractionalKellyStake, kellyFraction } from "../src/kelly.js";
import { simulateRiskOfRuin } from "../src/risk-of-ruin.js";

describe("kellyFraction", () => {
  it("60% win prob at even money (+100): f* = 0.20", () => {
    // b=1, p=0.6, q=0.4: (1*0.6 - 0.4)/1 = 0.2
    expect(kellyFraction(0.6, 100)).toBeCloseTo(0.2, 5);
  });

  it("55% at +110: small positive edge", () => {
    // decimal 2.1, b=1.1, p=0.55, q=0.45
    // f* = (1.1*0.55 - 0.45)/1.1 = (0.605-0.45)/1.1 = 0.1409
    expect(kellyFraction(0.55, 110)).toBeCloseTo(0.1409, 3);
  });

  it("50% at -110: negative edge, don't bet", () => {
    expect(kellyFraction(0.5, -110)).toBeLessThan(0);
  });

  it("clipped below 0 is handled by consumer", () => {
    // Raw Kelly can be negative; fractionalKellyStake should return 0.
    expect(fractionalKellyStake(1000, 0.5, -110, 1)).toBe(0);
  });

  it("fractional Kelly scales linearly", () => {
    const full = fractionalKellyStake(1000, 0.6, 100, 1);
    const half = fractionalKellyStake(1000, 0.6, 100, 0.5);
    const quarter = fractionalKellyStake(1000, 0.6, 100, 0.25);
    expect(half).toBeCloseTo(full / 2, 5);
    expect(quarter).toBeCloseTo(full / 4, 5);
  });

  it("throws on invalid probability", () => {
    expect(() => kellyFraction(-0.1, 100)).toThrow();
    expect(() => kellyFraction(1.1, 100)).toThrow();
  });
});

describe("simulateRiskOfRuin", () => {
  it("negative EV flat bets → high ruin probability", () => {
    const result = simulateRiskOfRuin({
      bankroll: 100,
      stakePerBet: 10,
      winProb: 0.45,
      odds: 100,
      numBets: 50,
      numSimulations: 1000,
    });
    expect(result.ruinProbability).toBeGreaterThan(0.3);
  });

  it("+EV flat bets → low ruin probability", () => {
    const result = simulateRiskOfRuin({
      bankroll: 1000,
      stakePerBet: 10,
      winProb: 0.6,
      odds: 100,
      numBets: 100,
      numSimulations: 500,
    });
    expect(result.ruinProbability).toBeLessThan(0.1);
    expect(result.meanFinalBankroll).toBeGreaterThan(1000);
  });

  it("returns p5/p95 percentiles", () => {
    const r = simulateRiskOfRuin({
      bankroll: 500,
      stakePerBet: 10,
      winProb: 0.52,
      odds: 100,
      numBets: 50,
      numSimulations: 300,
    });
    expect(r.p5).toBeLessThanOrEqual(r.medianFinalBankroll);
    expect(r.p95).toBeGreaterThanOrEqual(r.medianFinalBankroll);
  });
});
