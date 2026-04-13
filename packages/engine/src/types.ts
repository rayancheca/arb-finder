export type AmericanOdds = number;

export type Side = "A" | "B";

export interface ArbLeg {
  readonly side: Side;
  readonly odds: AmericanOdds;
  readonly stake: number;
  readonly payoutIfWin: number;
}

export interface ArbResult {
  readonly legA: ArbLeg;
  readonly legB: ArbLeg;
  readonly costBasis: number;
  readonly guaranteedMinProfit: number;
  readonly expectedProfit: number;
  readonly netReturnPct: number;
  readonly isArb: boolean;
  readonly bookieTake: number;
}

export type BoostType = "standard" | "free_bet" | "no_sweat" | "site_credit";

export interface FreeBetParams {
  readonly stake: number;
  readonly onSide: Side;
}

export interface NoSweatParams {
  readonly refundAmount: number;
  readonly cashRate: number;
  readonly onSide: Side;
}

export interface SiteCreditParams {
  readonly creditAmount: number;
}
