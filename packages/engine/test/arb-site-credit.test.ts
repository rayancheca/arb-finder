import { describe, expect, it } from "vitest";
import { arbSiteCredit } from "../src/arb-site-credit.js";
import { arbStandard } from "../src/arb-standard.js";

describe("arbSiteCredit — Excel `bet365 trade` sheet parity", () => {
  // Hedge calc inputs: C5=105, D5=-124.6242, C10=1000, site credit=100
  // Per Excel: D10 = C8/D8 * 1000 ≈ 1137.37
  //            C11 = 1000 * 2.05 = 2050
  //            D11 = 1137.37 * 1.8024 ≈ 2050
  //            cost basis with $100 site credit = 1000 + 1137.37 - 100 = 2037.37
  const result = arbSiteCredit(105, -124.6242, 1000, 100);

  it("hedge stake B matches Excel bet365 trade!D10", () => {
    expect(result.legB.stake).toBeCloseTo(1137.37, 1);
  });

  it("payouts equalized on both sides (approx)", () => {
    expect(result.legA.payoutIfWin).toBeCloseTo(2050, 1);
    expect(result.legB.payoutIfWin).toBeCloseTo(2050, 1);
  });

  it("cost basis reduced by site credit amount", () => {
    const withoutCredit = arbStandard(105, -124.6242, 1000);
    expect(result.costBasis).toBeCloseTo(withoutCredit.costBasis - 100, 5);
  });

  it("site credit turns a -EV standard bet into +EV", () => {
    const withoutCredit = arbStandard(105, -124.6242, 1000);
    expect(withoutCredit.guaranteedMinProfit).toBeLessThan(0);
    expect(result.guaranteedMinProfit).toBeGreaterThan(0);
  });

  it("guaranteed profit ≈ $12.63 with $100 site credit", () => {
    expect(result.guaranteedMinProfit).toBeCloseTo(12.63, 1);
  });

  it("throws on invalid inputs", () => {
    expect(() => arbSiteCredit(100, -100, 0, 50)).toThrow();
    expect(() => arbSiteCredit(100, -100, 100, -1)).toThrow();
  });
});
