"""
Team-name normalization + canonical event key hashing.

Every book names teams slightly differently — "NY Knicks" vs "New York
Knicks" vs "Knicks". We normalize to a lowercase canonical form, optionally
looking up a manual alias first, then build a deterministic event key:

    {sport_key}|{yyyy-mm-dd-of-commence-utc}|{teams_sorted}

Two games on the same day with the same two teams collapse to the same
canonical key even if commence_time disagrees by a few minutes across books.

The module is multi-sport: callers pass a `sport_key` (e.g. "basketball_nba"
or "football_nfl") and the resolver consults that sport's alias table so
"jets" maps to "new york jets" rather than colliding with an unrelated team.
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

# Canonical NFL dictionary. Same shape as NBA — keyed on the full lowercased
# name; values are the alias set (city, abbreviation, nickname, full name).
# Standard 3-letter NFL abbreviations are included for every team.
NFL_CANONICAL_TEAMS: dict[str, set[str]] = {
    "arizona cardinals": {"arizona", "ari", "cardinals", "arizona cardinals"},
    "atlanta falcons": {"atlanta", "atl", "falcons", "atlanta falcons"},
    "baltimore ravens": {"baltimore", "bal", "ravens", "baltimore ravens"},
    "buffalo bills": {"buffalo", "buf", "bills", "buffalo bills"},
    "carolina panthers": {"carolina", "car", "panthers", "carolina panthers"},
    "chicago bears": {"chicago", "chi", "bears", "chicago bears"},
    "cincinnati bengals": {"cincinnati", "cin", "bengals", "cincinnati bengals"},
    "cleveland browns": {"cleveland", "cle", "browns", "cleveland browns"},
    "dallas cowboys": {"dallas", "dal", "cowboys", "dallas cowboys"},
    "denver broncos": {"denver", "den", "broncos", "denver broncos"},
    "detroit lions": {"detroit", "det", "lions", "detroit lions"},
    "green bay packers": {"green bay", "gb", "gbp", "packers", "green bay packers"},
    "houston texans": {"houston", "hou", "texans", "houston texans"},
    "indianapolis colts": {"indianapolis", "ind", "colts", "indianapolis colts"},
    "jacksonville jaguars": {
        "jacksonville",
        "jax",
        "jags",
        "jaguars",
        "jacksonville jaguars",
    },
    "kansas city chiefs": {
        "kansas city",
        "kc",
        "chiefs",
        "kansas city chiefs",
    },
    "las vegas raiders": {
        "las vegas",
        "lv",
        "lvr",
        "raiders",
        "las vegas raiders",
        # Pre-2020 Oakland branding still surfaces from some books.
        "oakland",
        "oakland raiders",
    },
    "los angeles chargers": {
        "la chargers",
        "lac",
        "chargers",
        "los angeles chargers",
    },
    "los angeles rams": {
        "la rams",
        "lar",
        "rams",
        "los angeles rams",
    },
    "miami dolphins": {"miami", "mia", "dolphins", "miami dolphins"},
    "minnesota vikings": {"minnesota", "min", "vikings", "minnesota vikings"},
    "new england patriots": {
        "new england",
        "ne",
        "patriots",
        "pats",
        "new england patriots",
    },
    "new orleans saints": {"new orleans", "no", "saints", "new orleans saints"},
    "new york giants": {
        "ny giants",
        "nyg",
        "giants",
        "new york giants",
    },
    "new york jets": {
        "ny jets",
        "nyj",
        "jets",
        "new york jets",
    },
    "philadelphia eagles": {"philadelphia", "phi", "eagles", "philadelphia eagles"},
    "pittsburgh steelers": {"pittsburgh", "pit", "steelers", "pittsburgh steelers"},
    "san francisco 49ers": {
        "san francisco",
        "sf",
        "niners",
        "49ers",
        "san francisco 49ers",
    },
    "seattle seahawks": {"seattle", "sea", "seahawks", "seattle seahawks"},
    "tampa bay buccaneers": {
        "tampa bay",
        "tb",
        "bucs",
        "buccaneers",
        "tampa bay buccaneers",
    },
    "tennessee titans": {"tennessee", "ten", "titans", "tennessee titans"},
    "washington commanders": {
        "washington",
        "was",
        "wsh",
        "commanders",
        "washington commanders",
        # Pre-2022 branding occasionally still appears on stale board feeds.
        "washington football team",
    },
}


# Per-sport registry. Add a new sport by appending to this map plus a
# matching CANONICAL_TEAMS dict above.
CANONICAL_TEAMS_BY_SPORT: dict[str, dict[str, set[str]]] = {
    "basketball_nba": NBA_CANONICAL_TEAMS,
    "football_nfl": NFL_CANONICAL_TEAMS,
}


def _build_alias_index(
    table: dict[str, set[str]],
) -> dict[str, str]:
    """Reverse-index a canonical→aliases table to alias→canonical."""
    index: dict[str, str] = {}
    for canonical, aliases in table.items():
        index[canonical] = canonical
        for a in aliases:
            index[a] = canonical
    return index


# Build a reverse index per sport: any known alias → canonical.
_ALIAS_INDEX_BY_SPORT: dict[str, dict[str, str]] = {
    sport_key: _build_alias_index(table)
    for sport_key, table in CANONICAL_TEAMS_BY_SPORT.items()
}


DEFAULT_SPORT_KEY = "basketball_nba"


def normalize(name: str) -> str:
    """Lowercase, strip punctuation/accents, collapse whitespace."""
    folded = unicodedata.normalize("NFKD", name)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_only.lower().strip()
    no_punct = re.sub(r"[^\w\s]", " ", lowered)
    return re.sub(r"\s+", " ", no_punct).strip()


def resolve_team(
    raw: str,
    *,
    sport_key: str = DEFAULT_SPORT_KEY,
    dynamic_aliases: dict[str, str] | None = None,
) -> str | None:
    """
    Return the canonical team name for `raw`, or None if no match, scoped to
    the requested sport.

    Matching order: exact → static alias table for sport → dynamic aliases →
    rapidfuzz token_set_ratio ≥ 90 against the sport's canonical names.
    """
    table = CANONICAL_TEAMS_BY_SPORT.get(sport_key)
    index = _ALIAS_INDEX_BY_SPORT.get(sport_key)
    if table is None or index is None:
        return None

    key = normalize(raw)
    if not key:
        return None
    if key in index:
        return index[key]
    if dynamic_aliases and key in dynamic_aliases:
        return dynamic_aliases[key]

    # Fuzzy fallback — only accept high-confidence matches against the
    # current sport's canonical names so we don't accidentally map a
    # mis-tagged NFL team into an NBA team or vice versa.
    best: tuple[str, int] | None = None
    for canonical in table:
        score = fuzz.token_set_ratio(key, canonical)
        if score >= 90 and (best is None or score > best[1]):
            best = (canonical, score)
    return best[0] if best else None


def build_canonical_key(
    home_canonical: str,
    away_canonical: str,
    commence: datetime,
    *,
    sport_key: str = DEFAULT_SPORT_KEY,
) -> str:
    """
    Deterministic event key used as Event.canonicalKey.

    The sport prefix is the full sport key (e.g. "basketball_nba",
    "football_nfl") so cross-sport keys can never collide even if the same
    city nickname appears in two leagues.
    """
    a, b = sorted([home_canonical, away_canonical])
    day = commence.strftime("%Y-%m-%d")
    return f"{sport_key}|{day}|{a}|{b}"


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
    sport_key: str = DEFAULT_SPORT_KEY,
    dynamic_aliases: dict[str, str] | None = None,
) -> Resolution:
    home = resolve_team(
        raw_home, sport_key=sport_key, dynamic_aliases=dynamic_aliases
    )
    away = resolve_team(
        raw_away, sport_key=sport_key, dynamic_aliases=dynamic_aliases
    )
    if home and away:
        return Resolution(
            home_canonical=home,
            away_canonical=away,
            canonical_key=build_canonical_key(
                home, away, commence, sport_key=sport_key
            ),
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
