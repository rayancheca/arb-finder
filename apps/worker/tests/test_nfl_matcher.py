"""
NFL matcher tests — mirror the NBA suite but exercise the multi-sport entry
points so we know the sport-scoped alias index and canonical-key prefix work
end to end.

These assertions also lock in the breaking change to `build_canonical_key`:
the prefix is now the full sport key ("basketball_nba" / "football_nfl") so
NBA and NFL keys can never collide.
"""

from __future__ import annotations

from datetime import datetime, timezone

from arb_worker.matcher.canonical import (
    CANONICAL_TEAMS_BY_SPORT,
    NFL_CANONICAL_TEAMS,
    build_canonical_key,
    resolve,
    resolve_team,
)


def test_nfl_registry_lists_all_thirty_two_teams() -> None:
    assert len(NFL_CANONICAL_TEAMS) == 32
    assert "football_nfl" in CANONICAL_TEAMS_BY_SPORT


def test_resolve_team_nfl_exact_and_alias() -> None:
    assert (
        resolve_team("Kansas City Chiefs", sport_key="football_nfl")
        == "kansas city chiefs"
    )
    assert resolve_team("KC", sport_key="football_nfl") == "kansas city chiefs"
    assert resolve_team("Chiefs", sport_key="football_nfl") == "kansas city chiefs"
    assert (
        resolve_team("New England Patriots", sport_key="football_nfl")
        == "new england patriots"
    )
    assert resolve_team("Pats", sport_key="football_nfl") == "new england patriots"
    assert resolve_team("Eagles", sport_key="football_nfl") == "philadelphia eagles"
    assert resolve_team("Cowboys", sport_key="football_nfl") == "dallas cowboys"


def test_resolve_team_nfl_fuzzy_fallback() -> None:
    # Single-char typos still land on the canonical name via rapidfuzz.
    assert (
        resolve_team("Kansas Cty Chiefs", sport_key="football_nfl")
        == "kansas city chiefs"
    )


def test_resolve_team_unknown_in_nfl() -> None:
    assert resolve_team("Definitely Not An NFL Team", sport_key="football_nfl") is None


def test_resolve_team_does_not_leak_between_sports() -> None:
    # "Knicks" only exists in NBA; resolving in NFL must miss.
    assert resolve_team("Knicks", sport_key="football_nfl") is None
    # "Patriots" only exists in NFL; resolving in NBA must miss.
    assert resolve_team("Patriots", sport_key="basketball_nba") is None
    # NFL Giants vs MLB Giants would be ambiguous if we ever add MLB; for
    # now the NFL Giants alias must resolve cleanly to the NFL team.
    assert resolve_team("Giants", sport_key="football_nfl") == "new york giants"


def test_canonical_key_nfl_prefix() -> None:
    commence = datetime(2026, 9, 14, 23, 0, tzinfo=timezone.utc)
    key = build_canonical_key(
        "kansas city chiefs",
        "new england patriots",
        commence,
        sport_key="football_nfl",
    )
    assert key == "football_nfl|2026-09-14|kansas city chiefs|new england patriots"


def test_canonical_key_is_order_independent_nfl() -> None:
    commence = datetime(2026, 9, 14, 23, 0, tzinfo=timezone.utc)
    k1 = build_canonical_key(
        "kansas city chiefs",
        "new england patriots",
        commence,
        sport_key="football_nfl",
    )
    k2 = build_canonical_key(
        "new england patriots",
        "kansas city chiefs",
        commence,
        sport_key="football_nfl",
    )
    assert k1 == k2


def test_canonical_key_does_not_collide_across_sports() -> None:
    """
    Even when an NBA matchup and an NFL matchup are on the same date and
    share city names in their canonical strings, the sport-key prefix
    keeps them in separate keyspaces.
    """
    commence = datetime(2026, 9, 14, 23, 0, tzinfo=timezone.utc)
    nba_key = build_canonical_key(
        "los angeles lakers",
        "boston celtics",
        commence,
        sport_key="basketball_nba",
    )
    nfl_key = build_canonical_key(
        "los angeles rams",
        "new england patriots",
        commence,
        sport_key="football_nfl",
    )
    assert nba_key != nfl_key
    assert nba_key.startswith("basketball_nba|")
    assert nfl_key.startswith("football_nfl|")


def test_resolve_round_trip_nfl() -> None:
    commence = datetime(2026, 9, 14, 23, 0, tzinfo=timezone.utc)
    r = resolve("Chiefs", "Patriots", commence, sport_key="football_nfl")
    assert r.matched
    assert r.canonical_key is not None
    assert r.canonical_key.startswith("football_nfl|")
    assert r.home_canonical == "kansas city chiefs"
    assert r.away_canonical == "new england patriots"


def test_resolve_default_sport_key_still_nba() -> None:
    """Backward-compat: omitting sport_key falls through to NBA."""
    commence = datetime(2026, 4, 15, 23, 0, tzinfo=timezone.utc)
    r = resolve("Knicks", "Celtics", commence)
    assert r.matched
    assert r.canonical_key is not None
    assert r.canonical_key.startswith("basketball_nba|")
