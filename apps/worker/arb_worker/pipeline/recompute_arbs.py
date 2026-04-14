"""
Arb recomputation — mirrors packages/engine/src/arb-standard.ts exactly.

For every Market with ≥2 sides across ≥2 books, we look at every 2-way
combination (home on book A × away on book B) and compute the standard
arb formula. Anything with netReturnPct > 0 is written to ArbOpp.

We keep this in Python rather than shelling out to the TS engine because:
  - The cycle runs every 5 minutes and touches thousands of (market, book)
    pairs — forking a Node subprocess would dominate the latency
  - Standard arb math is ~20 lines; the TS tests in packages/engine already
    pin the exact numerical outputs, so Python parity is cheap to verify
  - Boost arbs (free bet / no sweat / site credit) still live in the TS
    engine for the UI slider — the worker only recomputes the baseline
    `standard` type, which is the vast majority of ArbOpp rows
"""

from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from ..logging_setup import get_logger

log = get_logger("pipeline.arbs")


def american_to_decimal(american: float) -> float:
    if american >= 100:
        return 1 + american / 100
    if american <= -100:
        return 1 + 100 / abs(american)
    raise ValueError(f"invalid american odds: {american}")


def american_to_implied(american: float) -> float:
    d = american_to_decimal(american)
    return 1 / d


@dataclass(frozen=True)
class StandardArb:
    stake_a: float
    stake_b: float
    cost_basis: float
    guaranteed_profit: float
    net_return_pct: float


def compute_standard_arb(
    *,
    odds_a: float,
    odds_b: float,
    total_stake: float = 1000.0,
) -> StandardArb | None:
    """
    Standard 2-way arb hedge — equalizes the payout on both outcomes.

    Returns None if no arbitrage exists (implied prob sum ≥ 1).
    """
    imp_a = american_to_implied(odds_a)
    imp_b = american_to_implied(odds_b)
    imp_sum = imp_a + imp_b
    if imp_sum >= 1.0:
        return None

    dec_a = american_to_decimal(odds_a)
    dec_b = american_to_decimal(odds_b)

    stake_a = total_stake * (imp_a / imp_sum)
    stake_b = total_stake * (imp_b / imp_sum)
    payout_a = stake_a * dec_a
    payout_b = stake_b * dec_b
    cost_basis = stake_a + stake_b
    guaranteed = min(payout_a, payout_b) - cost_basis
    net_return_pct = guaranteed / cost_basis
    return StandardArb(
        stake_a=round(stake_a, 2),
        stake_b=round(stake_b, 2),
        cost_basis=round(cost_basis, 2),
        guaranteed_profit=round(guaranteed, 2),
        net_return_pct=round(net_return_pct, 6),
    )


def _new_id() -> str:
    return f"arb_{uuid.uuid4().hex[:12]}"


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def recompute_arb_opps(conn: sqlite3.Connection) -> int:
    """Recompute the ArbOpp table. Returns the number of rows inserted."""
    conn.execute("DELETE FROM ArbOpp")

    # Group selections by (marketId, side) so we can pair them across books.
    rows = list(
        conn.execute(
            """
            SELECT s.marketId, s.bookId, s.side, s.label, s.americanOdds, m.eventId
              FROM Selection s
              JOIN Market m ON m.id = s.marketId
              JOIN Event e ON e.id = m.eventId
             WHERE e.commenceTime > datetime('now')
            """
        ).fetchall()
    )

    by_market: dict[str, dict[str, list[sqlite3.Row]]] = {}
    for r in rows:
        by_market.setdefault(r["marketId"], {}).setdefault(r["side"], []).append(r)

    inserted = 0
    now_iso = _iso(datetime.now(timezone.utc))

    for market_id, sides in by_market.items():
        # A 2-way arb needs two opposing sides. We pair home×away or over×under.
        opposing_pairs = []
        if "home" in sides and "away" in sides:
            opposing_pairs.append(("home", "away"))
        if "over" in sides and "under" in sides:
            opposing_pairs.append(("over", "under"))

        for side_a_name, side_b_name in opposing_pairs:
            for a in sides[side_a_name]:
                for b in sides[side_b_name]:
                    if a["bookId"] == b["bookId"]:
                        continue
                    arb = compute_standard_arb(
                        odds_a=a["americanOdds"],
                        odds_b=b["americanOdds"],
                    )
                    if arb is None or arb.net_return_pct <= 0:
                        continue
                    conn.execute(
                        """
                        INSERT INTO ArbOpp
                            (id, eventId, marketId, bookAId, bookBId, boostId, boostType,
                             oddsA, oddsB, sideALabel, sideBLabel, stakeA, stakeB,
                             costBasis, guaranteedProfit, netReturnPct, computedAt)
                        VALUES (?, ?, ?, ?, ?, NULL, 'standard',
                                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            _new_id(),
                            a["eventId"],
                            market_id,
                            a["bookId"],
                            b["bookId"],
                            a["americanOdds"],
                            b["americanOdds"],
                            a["label"],
                            b["label"],
                            arb.stake_a,
                            arb.stake_b,
                            arb.cost_basis,
                            arb.guaranteed_profit,
                            arb.net_return_pct,
                            now_iso,
                        ),
                    )
                    inserted += 1

    return inserted
