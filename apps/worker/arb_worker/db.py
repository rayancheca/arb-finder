"""
Raw SQL data-access layer for the worker.

Prisma owns the schema (see db/schema.prisma). The worker talks to the same
SQLite file directly to avoid a second ORM layer and the generator overhead
that would come with it.

All writes go through parameterized statements — no string interpolation,
ever. Every upsert is idempotent on the natural key from the schema so a
re-run of the same cycle produces identical state.
"""

from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Iterator

from .config import is_sqlite, sqlite_path


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _iso(dt: datetime) -> str:
    # Prisma stores DateTime as ISO8601 with millisecond precision + "Z".
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Open a connection with sensible defaults + a session-scoped close."""
    if not is_sqlite():
        raise NotImplementedError(
            "Postgres support lands in Phase E. For now the worker only "
            "talks to SQLite."
        )
    conn = sqlite3.connect(
        sqlite_path(),
        timeout=10.0,
        isolation_level=None,  # autocommit; we manage transactions ourselves
        detect_types=sqlite3.PARSE_DECLTYPES,
    )
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        yield conn
    finally:
        conn.close()


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    conn.execute("BEGIN IMMEDIATE;")
    try:
        yield conn
    except Exception:
        conn.execute("ROLLBACK;")
        raise
    else:
        conn.execute("COMMIT;")


# ── domain dtos ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class RawEvent:
    book_key: str
    book_event_id: str
    home_team: str
    away_team: str
    commence_time: datetime
    sport_key: str = "basketball_nba"


@dataclass(frozen=True)
class RawSelection:
    book_key: str
    book_event_id: str
    market_type: str        # moneyline | spread | total
    market_line: float | None
    side: str               # "home" | "away" | "over" | "under"
    label: str
    american_odds: float
    max_stake: float | None = None


# ── lookup helpers ─────────────────────────────────────────────────────────


def get_book_id_by_key(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT id FROM Book WHERE key = ?", (key,)).fetchone()
    return row["id"] if row else None


def get_event_by_canonical_key(
    conn: sqlite3.Connection, canonical_key: str
) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, commenceTime FROM Event WHERE canonicalKey = ?",
        (canonical_key,),
    ).fetchone()


def find_events_by_time_window(
    conn: sqlite3.Connection,
    sport_id: str,
    window_start_iso: str,
    window_end_iso: str,
) -> list[sqlite3.Row]:
    return list(
        conn.execute(
            """
            SELECT id, homeTeam, awayTeam, commenceTime, canonicalKey
            FROM Event
            WHERE sportId = ?
              AND commenceTime BETWEEN ? AND ?
            """,
            (sport_id, window_start_iso, window_end_iso),
        ).fetchall()
    )


def get_book_event_ref(
    conn: sqlite3.Connection, book_id: str, book_event_id: str
) -> str | None:
    row = conn.execute(
        "SELECT eventId FROM BookEventRef WHERE bookId = ? AND bookEventId = ?",
        (book_id, book_event_id),
    ).fetchone()
    return row["eventId"] if row else None


# ── writes ─────────────────────────────────────────────────────────────────


def upsert_book_event_ref(
    conn: sqlite3.Connection,
    *,
    book_id: str,
    book_event_id: str,
    event_id: str,
) -> None:
    conn.execute(
        """
        INSERT INTO BookEventRef (id, bookId, bookEventId, eventId, createdAt)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(bookId, bookEventId) DO UPDATE SET eventId = excluded.eventId
        """,
        (_new_id("ber"), book_id, book_event_id, event_id, _iso(datetime.utcnow())),
    )


def upsert_event(
    conn: sqlite3.Connection,
    *,
    sport_id: str,
    home_team: str,
    away_team: str,
    commence_time: datetime,
    canonical_key: str,
) -> str:
    """Insert the Event if it's new, return its id."""
    row = conn.execute(
        "SELECT id FROM Event WHERE canonicalKey = ?", (canonical_key,)
    ).fetchone()
    if row:
        return row["id"]
    event_id = _new_id("evt")
    conn.execute(
        """
        INSERT INTO Event (id, sportId, homeTeam, awayTeam, commenceTime, canonicalKey, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_id,
            sport_id,
            home_team,
            away_team,
            _iso(commence_time),
            canonical_key,
            _iso(datetime.utcnow()),
        ),
    )
    return event_id


def upsert_market(
    conn: sqlite3.Connection,
    *,
    event_id: str,
    market_type: str,
    market_line: float | None,
    market_key: str,
) -> str:
    row = conn.execute(
        "SELECT id FROM Market WHERE eventId = ? AND marketKey = ?",
        (event_id, market_key),
    ).fetchone()
    if row:
        return row["id"]
    market_id = _new_id("mkt")
    conn.execute(
        """
        INSERT INTO Market (id, eventId, type, line, marketKey)
        VALUES (?, ?, ?, ?, ?)
        """,
        (market_id, event_id, market_type, market_line, market_key),
    )
    return market_id


def upsert_selection(
    conn: sqlite3.Connection,
    *,
    market_id: str,
    book_id: str,
    side: str,
    label: str,
    american_odds: float,
    max_stake: float | None,
) -> str:
    """Upsert on the unique (marketId, bookId, side) from the Prisma schema."""
    row = conn.execute(
        "SELECT id FROM Selection WHERE marketId = ? AND bookId = ? AND side = ?",
        (market_id, book_id, side),
    ).fetchone()
    now_iso = _iso(datetime.utcnow())
    if row:
        conn.execute(
            """
            UPDATE Selection
               SET label = ?, americanOdds = ?, maxStake = ?, fetchedAt = ?
             WHERE id = ?
            """,
            (label, american_odds, max_stake, now_iso, row["id"]),
        )
        return row["id"]
    sel_id = _new_id("sel")
    conn.execute(
        """
        INSERT INTO Selection (id, marketId, bookId, side, label, americanOdds, maxStake, fetchedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sel_id, market_id, book_id, side, label, american_odds, max_stake, now_iso),
    )
    return sel_id


def insert_match_review(
    conn: sqlite3.Connection,
    *,
    book_id: str,
    book_event_id: str,
    raw_home: str,
    raw_away: str,
    commence_time: datetime,
    reason: str,
    payload_json: str,
) -> None:
    conn.execute(
        """
        INSERT INTO EventMatchReview
            (id, bookId, bookEventId, rawHome, rawAway, commenceTime, reason, payload, createdAt, resolved)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(bookId, bookEventId) DO UPDATE SET
            rawHome = excluded.rawHome,
            rawAway = excluded.rawAway,
            commenceTime = excluded.commenceTime,
            reason = excluded.reason,
            payload = excluded.payload
        """,
        (
            _new_id("rev"),
            book_id,
            book_event_id,
            raw_home,
            raw_away,
            _iso(commence_time),
            reason,
            payload_json,
            _iso(datetime.utcnow()),
        ),
    )


def record_scrape_run(
    conn: sqlite3.Connection,
    *,
    book_key: str,
    status: str,
    started_at: datetime,
    finished_at: datetime | None,
    http_status: int | None = None,
    error: str | None = None,
    events_found: int = 0,
    selections_found: int = 0,
) -> None:
    duration_ms: int | None = None
    if finished_at:
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)
    conn.execute(
        """
        INSERT INTO ScrapeRun
            (id, bookKey, startedAt, finishedAt, status, error, httpStatus,
             eventsFound, selectionsFound, durationMs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            _new_id("run"),
            book_key,
            _iso(started_at),
            _iso(finished_at) if finished_at else None,
            status,
            error,
            http_status,
            events_found,
            selections_found,
            duration_ms,
        ),
    )


def recent_scrape_runs(
    conn: sqlite3.Connection, book_key: str, limit: int = 5
) -> list[sqlite3.Row]:
    return list(
        conn.execute(
            """
            SELECT status, startedAt, finishedAt, error
              FROM ScrapeRun
             WHERE bookKey = ?
             ORDER BY startedAt DESC
             LIMIT ?
            """,
            (book_key, limit),
        ).fetchall()
    )


def ensure_nba_sport(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT id FROM Sport WHERE key = 'nba'").fetchone()
    if row:
        return row["id"]
    conn.execute(
        "INSERT INTO Sport (id, key, title) VALUES (?, ?, ?)",
        ("nba", "nba", "NBA"),
    )
    return "nba"


def wipe_arb_opps(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM ArbOpp")


def insert_arb_opp(conn: sqlite3.Connection, row: dict[str, Any]) -> None:
    keys = list(row.keys())
    placeholders = ",".join("?" for _ in keys)
    conn.execute(
        f"INSERT INTO ArbOpp ({','.join(keys)}) VALUES ({placeholders})",
        tuple(row.values()),
    )
