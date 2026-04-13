import { describe, expect, it } from "vitest";
import {
  americanToDecimal,
  americanToImpliedProb,
  freeBetProfit,
  payoutWithStake,
} from "../src/odds.js";

describe("americanToDecimal", () => {
  it("positive odds +100 → 2.0", () => {
    expect(americanToDecimal(100)).toBeCloseTo(2.0, 10);
  });

  it("positive odds +520 → 6.2 (Excel calc!D8 with D5=520)", () => {
    expect(americanToDecimal(520)).toBeCloseTo(6.2, 10);
  });

  it("negative odds -340 → 1.2941 (Excel calc!C8 with C5=-340)", () => {
    expect(americanToDecimal(-340)).toBeCloseTo(1.2941176470588, 10);
  });

  it("negative odds -600 → 1.1667 (Excel free bet!C8 with C5=-600)", () => {
    expect(americanToDecimal(-600)).toBeCloseTo(1.1666666666667, 10);
  });

  it("throws on 0", () => {
    expect(() => americanToDecimal(0)).toThrow();
  });
});

describe("americanToImpliedProb", () => {
  it("+100 → 0.5", () => {
    expect(americanToImpliedProb(100)).toBeCloseTo(0.5, 10);
  });

  it("-340 → 0.7727 (Excel calc!C7 with C5=-340)", () => {
    expect(americanToImpliedProb(-340)).toBeCloseTo(340 / 440, 10);
  });

  it("+520 → 0.1613 (Excel calc!D7 with D5=520)", () => {
    expect(americanToImpliedProb(520)).toBeCloseTo(100 / 620, 10);
  });

  it("probabilities on two sides of an arb sum to < 1", () => {
    const p1 = americanToImpliedProb(-340);
    const p2 = americanToImpliedProb(520);
    expect(p1 + p2).toBeLessThan(1);
    expect(p1 + p2 - 1).toBeCloseTo(-0.06598, 4);
  });
});

describe("payoutWithStake", () => {
  it("Excel calc!C6 for -340 stake 120 → 155.29", () => {
    expect(payoutWithStake(120, -340)).toBeCloseTo(155.2941, 3);
  });

  it("Excel calc!D6 for +520 stake 25 → 155.00", () => {
    expect(payoutWithStake(25, 520)).toBeCloseTo(155, 5);
  });
});

describe("freeBetProfit", () => {
  it("$25 free bet at +520 → $130 profit", () => {
    expect(freeBetProfit(25, 520)).toBeCloseTo(130, 5);
  });

  it("$25 free bet at +460 → $115 profit (Excel free bet!D6)", () => {
    expect(freeBetProfit(25, 460)).toBeCloseTo(115, 5);
  });

  it("generalized: $100 free bet at -200 → $50 profit", () => {
    // Excel version couldn't handle this; ours can.
    // decimal = 1.5, profit = 100 * 0.5 = 50
    expect(freeBetProfit(100, -200)).toBeCloseTo(50, 5);
  });
});
