import { describe, expect, it } from "vitest";
import { arbStandard } from "../src/arb-standard.js";

describe("arbStandard — Excel `calc` sheet parity", () => {
  // Excel inputs: C5=-340, D5=+520, C10=250 (hedge A stake)
  // Formulas:
  //   decA = 100/340 + 1 = 1.29411764...
  //   decB = 520/100 + 1 = 6.2
  //   stakeB = decA/decB * stakeA = 0.20872865... * 250 = 52.18216...
  //   payoutA = 250 * 1.29411764 = 323.52941...
  //   payoutB (equalized by construction) = 323.52941...
  //   costBasis = 250 + 52.18216 = 302.18216...
  //   profit = 323.52941 - 302.18216 = 21.34725...
  const result = arbStandard(-340, 520, 250);

  it("computes hedge stake B matching Excel calc!D10 formula", () => {
    expect(result.legB.stake).toBeCloseTo(52.18216, 4);
  });

  it("payout A matches Excel calc!C11", () => {
    expect(result.legA.payoutIfWin).toBeCloseTo(323.52941, 4);
  });

  it("payouts equalized by hedge construction", () => {
    expect(result.legB.payoutIfWin).toBeCloseTo(
      result.legA.payoutIfWin,
      5,
    );
  });

  it("cost basis matches Excel calc!E11", () => {
    expect(result.costBasis).toBeCloseTo(302.18216, 4);
  });

  it("detects arb (pA + pB - 1 < 0)", () => {
    expect(result.isArb).toBe(true);
    expect(result.bookieTake).toBeLessThan(0);
    expect(result.bookieTake).toBeCloseTo(-0.06598, 4);
  });

  it("guaranteed min profit is positive (true arb)", () => {
    expect(result.guaranteedMinProfit).toBeGreaterThan(0);
    expect(result.guaranteedMinProfit).toBeCloseTo(21.3473, 3);
  });

  it("net return pct ≈ 7.06% on cost basis", () => {
    expect(result.netReturnPct).toBeCloseTo(0.07064, 4);
  });

  it("throws on invalid stake", () => {
    expect(() => arbStandard(-110, 110, 0)).toThrow();
    expect(() => arbStandard(-110, 110, -50)).toThrow();
  });

  it("non-arb case: pA + pB > 1 returns isArb=false", () => {
    // Both sides have vig, no arb: -110 / -110
    const r = arbStandard(-110, -110, 100);
    expect(r.isArb).toBe(false);
    expect(r.guaranteedMinProfit).toBeLessThan(0);
  });

  it("breakeven at pA + pB == 1", () => {
    // +100 / -100 sums to exactly 1.0
    const r = arbStandard(100, -100, 100);
    expect(r.bookieTake).toBeCloseTo(0, 10);
    expect(r.guaranteedMinProfit).toBeCloseTo(0, 5);
  });
});
