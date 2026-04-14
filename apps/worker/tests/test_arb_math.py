"""
Standard arb math parity tests.

These reproduce the key assertions from the TypeScript engine's
arb-standard.test.ts file to make sure the Python recomputation produces
the same numbers. If either side drifts, the whole system lies to you.
"""

from arb_worker.pipeline.recompute_arbs import (
    american_to_decimal,
    american_to_implied,
    compute_standard_arb,
)


def test_american_to_decimal_positive_and_negative() -> None:
    assert american_to_decimal(100) == 2.0
    assert american_to_decimal(-110) == 1 + 100 / 110
    assert american_to_decimal(150) == 2.5
    assert american_to_decimal(-200) == 1.5


def test_implied_probability_matches_decimal_inverse() -> None:
    assert american_to_implied(100) == 0.5
    assert abs(american_to_implied(-110) - 0.5238095238) < 1e-9


def test_no_arb_when_implied_sum_ge_one() -> None:
    # Two −110s: implied 0.5238 + 0.5238 = 1.0476 > 1 → no arb
    assert compute_standard_arb(odds_a=-110, odds_b=-110) is None


def test_real_arb_returns_positive_profit() -> None:
    # Book A +120 on home, Book B +110 on away → implied 0.4545 + 0.4762 = 0.9307
    arb = compute_standard_arb(odds_a=120, odds_b=110, total_stake=1000)
    assert arb is not None
    assert arb.guaranteed_profit > 0
    assert arb.net_return_pct > 0
    assert abs((arb.stake_a + arb.stake_b) - 1000) < 0.01


def test_stakes_equalize_payout() -> None:
    arb = compute_standard_arb(odds_a=150, odds_b=140, total_stake=1000)
    assert arb is not None
    payout_a = arb.stake_a * american_to_decimal(150)
    payout_b = arb.stake_b * american_to_decimal(140)
    # Equalized to within rounding
    assert abs(payout_a - payout_b) < 0.5


def test_symmetry() -> None:
    a = compute_standard_arb(odds_a=120, odds_b=110, total_stake=1000)
    b = compute_standard_arb(odds_a=110, odds_b=120, total_stake=1000)
    assert a is not None and b is not None
    assert abs(a.net_return_pct - b.net_return_pct) < 1e-9
