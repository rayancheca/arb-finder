import { describe, expect, it } from "vitest";
import { arbNoSweat } from "../src/arb-no-sweat.js";

describe("arbNoSweat — improved over Excel `no sweat` sheet", () => {
  // $500 no-sweat bet on +130, hedge on -154, cash rate 0.65.
  //
  // If no-sweat wins:  collect $500*2.30 = $1150, refund doesn't trigger
  // If hedge wins:     collect H*decH, plus refund of 500*0.65 = $325
  //
  // Equalize:  1150 - 500 - H = H*(decH - 1) - 500 + 325
  //   which simplifies to: H = (1150 - 325) / decH = 825 / 1.6494 ≈ 500.18
  //
  // Profit (both outcomes equal): 1150 - 500 - 500.18 ≈ 149.82
  // This BEATS the Excel sheet which hedges using the wrong formula.
  const result = arbNoSweat(130, -154, 500, 0.65, "A");

  it("hedge stake computed optimally", () => {
    expect(result.legB.stake).toBeCloseTo(500.18, 1);
  });

  it("cost basis is sum of both cash stakes", () => {
    expect(result.costBasis).toBeCloseTo(1000.18, 1);
  });

  it("guaranteed profit ≈ $149.82 either outcome", () => {
    expect(result.guaranteedMinProfit).toBeCloseTo(149.82, 1);
    expect(result.isArb).toBe(true);
  });

  it("converts no-sweat at ~30% of stake (149.82/500)", () => {
    const conversionRate = result.guaranteedMinProfit / 500;
    expect(conversionRate).toBeGreaterThan(0.25);
    expect(conversionRate).toBeLessThan(0.35);
  });

  it("higher cash rate → higher profit", () => {
    const low = arbNoSweat(130, -154, 500, 0.5, "A");
    const high = arbNoSweat(130, -154, 500, 0.8, "A");
    expect(high.guaranteedMinProfit).toBeGreaterThan(
      low.guaranteedMinProfit,
    );
  });

  it("zero cash rate degenerates toward a -EV bet", () => {
    const r = arbNoSweat(130, -154, 500, 0, "A");
    // With no refund value, this is worse than a normal hedge because
    // -154 has vig. Guaranteed profit should be negative or near zero.
    expect(r.guaranteedMinProfit).toBeLessThan(1);
  });

  it("throws on invalid cashRate", () => {
    expect(() => arbNoSweat(130, -154, 500, -0.1)).toThrow();
    expect(() => arbNoSweat(130, -154, 500, 1.5)).toThrow();
  });
});
