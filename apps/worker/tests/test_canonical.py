"""Tests for the team-name normalizer + canonical-key hasher."""

from datetime import datetime, timezone

from arb_worker.matcher.canonical import (
    build_canonical_key,
    normalize,
    resolve,
    resolve_team,
)


def test_normalize_strips_punctuation_and_accents() -> None:
    assert normalize("  New York Knicks!  ") == "new york knicks"
    assert normalize("Atlético-Madrid") == "atletico madrid"


def test_resolve_team_exact_and_alias() -> None:
    assert resolve_team("Lakers") == "los angeles lakers"
    assert resolve_team("NY Knicks") == "new york knicks"
    assert resolve_team("Golden State Warriors") == "golden state warriors"
    assert resolve_team("GSW") == "golden state warriors"


def test_resolve_team_fuzzy_fallback() -> None:
    # Real-world drift: "Nw York Knicks" (single char typo) should still land
    # on the canonical name via the rapidfuzz token_set_ratio fallback.
    assert resolve_team("Nw York Knicks") == "new york knicks"


def test_resolve_team_unknown() -> None:
    assert resolve_team("Definitely Not An NBA Team") is None


def test_canonical_key_is_order_independent() -> None:
    commence = datetime(2026, 4, 15, 23, 0, tzinfo=timezone.utc)
    k1 = build_canonical_key("new york knicks", "boston celtics", commence)
    k2 = build_canonical_key("boston celtics", "new york knicks", commence)
    assert k1 == k2
    assert k1 == "nba|2026-04-15|boston celtics|new york knicks"


def test_resolve_round_trip() -> None:
    commence = datetime(2026, 4, 15, 23, 0, tzinfo=timezone.utc)
    r = resolve("Knicks", "Celtics", commence)
    assert r.matched
    assert r.canonical_key == "nba|2026-04-15|boston celtics|new york knicks"


def test_resolve_reports_failure() -> None:
    commence = datetime(2026, 4, 15, tzinfo=timezone.utc)
    r = resolve("Nonexistent FC", "Another Fake", commence)
    assert not r.matched
    assert r.reason is not None
    assert "unresolved" in r.reason
