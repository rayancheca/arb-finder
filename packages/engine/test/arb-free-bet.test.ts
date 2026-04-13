import { describe, expect, it } from "vitest";
import { arbFreeBet } from "../src/arb-free-bet.js";

describe("arbFreeBet — improved over Excel `free bet` sheet", () => {
  // Free bet of $25 on +460, cash hedge on -600.
  // Excel used fixed stakes (115 cash, 25 free) and reported worst-case $0.
  // Our engine solves for the optimal cash hedge that equalizes both outcomes.
  //
  // Optimal H satisfies:  F*(decF - 1) - H = H*(decH - 1)
  //                       25*4.6 - H = H*0.1667
  //                       115 = 1.1667*H
  //                       H ≈ 98.57
  // Worst-case profit: 25*4.6 - 98.57 = 16.43 (both outcomes equal)
  const result = arbFreeBet(460, -600, 25, "A");

  it("solves optimal cash hedge stake", () => {
    expect(result.legB.stake).toBeCloseTo(98.57, 1);
  });

  it("cost basis = only the cash hedge (free bet is free)", () => {
    expect(result.costBasis).toBeCloseTo(98.57, 1);
  });

  it("guaranteed min profit ≈ $16.43 (beats Excel's $0 worst case)", () => {
    expect(result.guaranteedMinProfit).toBeCloseTo(16.43, 1);
    expect(result.isArb).toBe(true);
  });

  it("converts free bet at ~65% efficiency (16.43/25)", () => {
    const conversionRate = result.guaranteedMinProfit / 25;
    expect(conversionRate).toBeGreaterThan(0.6);
    expect(conversionRate).toBeLessThan(0.7);
  });

  it("handles free bet on negative odds (Excel couldn't)", () => {
    // $100 free bet at -200, hedge on +200.
    //   decFree = 1.5, decCash = 3.0
    //   Free bet profit if win = 100 * 0.5 = 50
    //   Equalize: 50 - H = H * (3 - 1) = 2H  →  H = 50/3 ≈ 16.67
    //   Profit either way = 2H = 33.33
    const r = arbFreeBet(-200, 200, 100, "A");
    expect(r.legB.stake).toBeCloseTo(16.67, 1);
    expect(r.guaranteedMinProfit).toBeCloseTo(33.33, 1);
    expect(r.isArb).toBe(true);
  });

  it("throws on invalid inputs", () => {
    expect(() => arbFreeBet(100, -100, 0)).toThrow();
    expect(() => arbFreeBet(100, -100, -10)).toThrow();
  });
});
