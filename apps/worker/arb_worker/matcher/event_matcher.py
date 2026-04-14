"""
Event matcher — reconciles a raw scraped event with a canonical Event row.

Strategy:
1. If we've seen this (book_id, book_event_id) before, reuse the BookEventRef.
2. Resolve teams → canonical names → canonical_key.
3. If an Event with that canonical_key exists, link the BookEventRef to it.
4. If not, widen the search to any Event for the same team pair whose
   commence_time is within ±15 min of this one (handles the case where books
   round differently). If found, link; if not, create a fresh Event.
5. If team resolution fails, write to EventMatchReview and skip.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta

from .. import db
from ..config import FUZZY_MATCH_WINDOW_MINUTES
from ..logging_setup import get_logger
from .canonical import (
    build_canonical_key,
    normalize,
    resolve,
)

log = get_logger("event_matcher")


@dataclass(frozen=True)
class MatchResult:
    event_id: str | None
    created: bool
    skipped_reason: str | None = None


def _load_dynamic_aliases(conn: sqlite3.Connection) -> dict[str, str]:
    rows = conn.execute(
        "SELECT alias, canonical FROM TeamAlias WHERE sportKey = 'basketball_nba'"
    ).fetchall()
    return {normalize(r["alias"]): r["canonical"] for r in rows}


def match_or_create_event(
    conn: sqlite3.Connection,
    *,
    book_id: str,
    book_key: str,
    book_event_id: str,
    raw_home: str,
    raw_away: str,
    commence_time: datetime,
    raw_payload: dict,
) -> MatchResult:
    # 1. Fast path — already-seen external id.
    existing = db.get_book_event_ref(conn, book_id, book_event_id)
    if existing:
        return MatchResult(event_id=existing, created=False)

    # 2. Resolve teams.
    dyn = _load_dynamic_aliases(conn)
    resolution = resolve(raw_home, raw_away, commence_time, dynamic_aliases=dyn)
    if not resolution.matched:
        db.insert_match_review(
            conn,
            book_id=book_id,
            book_event_id=book_event_id,
            raw_home=raw_home,
            raw_away=raw_away,
            commence_time=commence_time,
            reason=resolution.reason or "unresolved",
            payload_json=json.dumps(raw_payload, default=str),
        )
        log.warning(
            "event_match_unresolved",
            book=book_key,
            home=raw_home,
            away=raw_away,
            reason=resolution.reason,
        )
        return MatchResult(
            event_id=None, created=False, skipped_reason=resolution.reason
        )

    assert resolution.home_canonical is not None
    assert resolution.away_canonical is not None
    canonical_key = resolution.canonical_key
    assert canonical_key is not None

    # 3. Direct canonical_key lookup.
    row = db.get_event_by_canonical_key(conn, canonical_key)
    if row:
        event_id = row["id"]
        db.upsert_book_event_ref(
            conn,
            book_id=book_id,
            book_event_id=book_event_id,
            event_id=event_id,
        )
        return MatchResult(event_id=event_id, created=False)

    # 4. Fuzzy ±15 min window in case two books disagree on commence_time
    #    enough to push the canonical day label over midnight UTC.
    window = timedelta(minutes=FUZZY_MATCH_WINDOW_MINUTES)
    sport_id = db.ensure_nba_sport(conn)
    nearby = db.find_events_by_time_window(
        conn,
        sport_id=sport_id,
        window_start_iso=(commence_time - window).isoformat(),
        window_end_iso=(commence_time + window).isoformat(),
    )
    for ev in nearby:
        ev_home = resolve(ev["homeTeam"], ev["awayTeam"], commence_time)
        if (
            ev_home.home_canonical == resolution.home_canonical
            and ev_home.away_canonical == resolution.away_canonical
        ):
            event_id = ev["id"]
            db.upsert_book_event_ref(
                conn,
                book_id=book_id,
                book_event_id=book_event_id,
                event_id=event_id,
            )
            log.info(
                "event_match_fuzzy_time",
                book=book_key,
                matched_event=event_id,
            )
            return MatchResult(event_id=event_id, created=False)

    # 5. Brand new event — create it.
    event_id = db.upsert_event(
        conn,
        sport_id=sport_id,
        home_team=resolution.home_canonical.title(),
        away_team=resolution.away_canonical.title(),
        commence_time=commence_time,
        canonical_key=canonical_key,
    )
    db.upsert_book_event_ref(
        conn,
        book_id=book_id,
        book_event_id=book_event_id,
        event_id=event_id,
    )
    log.info(
        "event_created",
        event_id=event_id,
        home=resolution.home_canonical,
        away=resolution.away_canonical,
    )
    return MatchResult(event_id=event_id, created=True)
