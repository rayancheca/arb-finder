"""
Team-name normalization + canonical event key hashing.

Every book names teams slightly differently — "NY Knicks" vs "New York
Knicks" vs "Knicks". We normalize to a lowercase canonical form, optionally
looking up a manual alias first, then build a deterministic event key:

    {sport_key}|{yyyy-mm-dd-of-commence-utc}|{teams_sorted}

Two games on the same day with the same two teams collapse to the same
canonical key even if commence_time disagrees by a few minutes across books.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime

from rapidfuzz import fuzz

# Canonical NBA dictionary. Source of truth — anything not in here that a
# book reports gets resolved via TeamAlias rows (loaded at runtime) or, if
# that fails, written to EventMatchReview for manual resolution.
NBA_CANONICAL_TEAMS: dict[str, set[str]] = {
    "atlanta hawks": {"atlanta", "atl", "hawks", "atlanta hawks"},
    "boston celtics": {"boston", "bos", "celtics", "boston celtics"},
    "brooklyn nets": {"brooklyn", "bkn", "nets", "brooklyn nets"},
    "charlotte hornets": {"charlotte", "cha", "hornets", "charlotte hornets"},
    "chicago bulls": {"chicago", "chi", "bulls", "chicago bulls"},
    "cleveland cavaliers": {
        "cleveland",
        "cle",
        "cavs",
        "cavaliers",
        "cleveland cavaliers",
    },
    "dallas mavericks": {"dallas", "dal", "mavs", "mavericks", "dallas mavericks"},
    "denver nuggets": {"denver", "den", "nuggets", "denver nuggets"},
    "detroit pistons": {"detroit", "det", "pistons", "detroit pistons"},
    "golden state warriors": {
        "golden state",
        "gsw",
        "warriors",
        "golden state warriors",
    },
    "houston rockets": {"houston", "hou", "rockets", "houston rockets"},
    "indiana pacers": {"indiana", "ind", "pacers", "indiana pacers"},
    "los angeles clippers": {
        "la clippers",
        "lac",
        "clippers",
        "los angeles clippers",
    },
    "los angeles lakers": {"la lakers", "lal", "lakers", "los angeles lakers"},
    "memphis grizzlies": {"memphis", "mem", "grizzlies", "memphis grizzlies"},
    "miami heat": {"miami", "mia", "heat", "miami heat"},
    "milwaukee bucks": {"milwaukee", "mil", "bucks", "milwaukee bucks"},
    "minnesota timberwolves": {
        "minnesota",
        "min",
        "wolves",
        "timberwolves",
        "minnesota timberwolves",
    },
    "new orleans pelicans": {
        "new orleans",
        "nop",
        "pelicans",
        "new orleans pelicans",
    },
    "new york knicks": {
        "ny knicks",
        "nyk",
        "knicks",
        "new york knicks",
        "new york knickerbockers",
    },
    "oklahoma city thunder": {
        "oklahoma city",
        "okc",
        "thunder",
        "oklahoma city thunder",
    },
    "orlando magic": {"orlando", "orl", "magic", "orlando magic"},
    "philadelphia 76ers": {
        "philadelphia",
        "phi",
        "sixers",
        "76ers",
        "philadelphia 76ers",
    },
    "phoenix suns": {"phoenix", "phx", "suns", "phoenix suns"},
    "portland trail blazers": {
        "portland",
        "por",
        "blazers",
        "trail blazers",
        "portland trail blazers",
    },
    "sacramento kings": {"sacramento", "sac", "kings", "sacramento kings"},
    "san antonio spurs": {"san antonio", "sas", "spurs", "san antonio spurs"},
    "toronto raptors": {"toronto", "tor", "raptors", "toronto raptors"},
    "utah jazz": {"utah", "uta", "jazz", "utah jazz"},
    "washington wizards": {"washington", "was", "wizards", "washington wizards"},
}

# Build a reverse index: any known alias → canonical.
_ALIAS_INDEX: dict[str, str] = {}
for canonical, aliases in NBA_CANONICAL_TEAMS.items():
    _ALIAS_INDEX[canonical] = canonical
    for a in aliases:
        _ALIAS_INDEX[a] = canonical


def normalize(name: str) -> str:
    """Lowercase, strip punctuation/accents, collapse whitespace."""
    folded = unicodedata.normalize("NFKD", name)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_only.lower().strip()
    no_punct = re.sub(r"[^\w\s]", " ", lowered)
    return re.sub(r"\s+", " ", no_punct).strip()


def resolve_team(
    raw: str, *, dynamic_aliases: dict[str, str] | None = None
) -> str | None:
    """
    Return the canonical NBA team name for `raw`, or None if no match.
    Matching is: exact → alias table (static + dynamic) → rapidfuzz ≥ 90.
    """
    key = normalize(raw)
    if not key:
        return None
    if key in _ALIAS_INDEX:
        return _ALIAS_INDEX[key]
    if dynamic_aliases and key in dynamic_aliases:
        return dynamic_aliases[key]

    # Fuzzy fallback — only accept high-confidence matches.
    best: tuple[str, int] | None = None
    for canonical in NBA_CANONICAL_TEAMS:
        score = fuzz.token_set_ratio(key, canonical)
        if score >= 90 and (best is None or score > best[1]):
            best = (canonical, score)
    return best[0] if best else None


def build_canonical_key(
    home_canonical: str, away_canonical: str, commence: datetime
) -> str:
    """Deterministic event key used as Event.canonicalKey."""
    a, b = sorted([home_canonical, away_canonical])
    day = commence.strftime("%Y-%m-%d")
    return f"nba|{day}|{a}|{b}"


@dataclass(frozen=True)
class Resolution:
    home_canonical: str | None
    away_canonical: str | None
    canonical_key: str | None
    reason: str | None  # set when either team cannot be resolved

    @property
    def matched(self) -> bool:
        return self.canonical_key is not None


def resolve(
    raw_home: str,
    raw_away: str,
    commence: datetime,
    *,
    dynamic_aliases: dict[str, str] | None = None,
) -> Resolution:
    home = resolve_team(raw_home, dynamic_aliases=dynamic_aliases)
    away = resolve_team(raw_away, dynamic_aliases=dynamic_aliases)
    if home and away:
        return Resolution(
            home_canonical=home,
            away_canonical=away,
            canonical_key=build_canonical_key(home, away, commence),
            reason=None,
        )
    missing = []
    if not home:
        missing.append(f"home='{raw_home}'")
    if not away:
        missing.append(f"away='{raw_away}'")
    return Resolution(
        home_canonical=home,
        away_canonical=away,
        canonical_key=None,
        reason=f"unresolved: {', '.join(missing)}",
    )
