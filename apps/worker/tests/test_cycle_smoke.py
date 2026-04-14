"""
Pipeline smoke test — wires the matcher, db layer, and arb recomputation
against a temporary in-memory-equivalent SQLite file. No network.

We spin up a fresh schema by reading db/schema.prisma? Too brittle — instead
we create just the tables the pipeline touches with minimal DDL, insert a
handful of fake selections across two books on the same market, and assert
that recompute_arb_opps finds the arb.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

import pytest

from arb_worker.pipeline.recompute_arbs import recompute_arb_opps


SCHEMA = """
CREATE TABLE Sport (id TEXT PRIMARY KEY, key TEXT UNIQUE, title TEXT);
CREATE TABLE Book (id TEXT PRIMARY KEY, key TEXT UNIQUE, name TEXT, color TEXT, active INT DEFAULT 1, region TEXT DEFAULT 'US-NY');
CREATE TABLE Event (
    id TEXT PRIMARY KEY, sportId TEXT, homeTeam TEXT, awayTeam TEXT,
    commenceTime TEXT, canonicalKey TEXT UNIQUE, createdAt TEXT
);
CREATE TABLE Market (
    id TEXT PRIMARY KEY, eventId TEXT, type TEXT, line REAL, marketKey TEXT,
    UNIQUE(eventId, marketKey)
);
CREATE TABLE Selection (
    id TEXT PRIMARY KEY, marketId TEXT, bookId TEXT, side TEXT, label TEXT,
    americanOdds REAL, maxStake REAL, fetchedAt TEXT,
    UNIQUE(marketId, bookId, side)
);
CREATE TABLE ArbOpp (
    id TEXT PRIMARY KEY, eventId TEXT, marketId TEXT, bookAId TEXT, bookBId TEXT,
    boostId TEXT, boostType TEXT DEFAULT 'standard', oddsA REAL, oddsB REAL,
    sideALabel TEXT, sideBLabel TEXT, stakeA REAL, stakeB REAL,
    costBasis REAL, guaranteedProfit REAL, netReturnPct REAL, computedAt TEXT
);
"""


@pytest.fixture()
def conn() -> sqlite3.Connection:
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    yield conn
    conn.close()
    Path(path).unlink(missing_ok=True)


def _seed_two_book_arb(conn: sqlite3.Connection) -> None:
    # Future-dated commence so the recomputation includes the market.
    conn.execute(
        "INSERT INTO Event VALUES (?, ?, ?, ?, datetime('now', '+1 day'), ?, datetime('now'))",
        ("evt_1", "nba", "Knicks", "Celtics", "nba|2099-01-01|celtics|knicks"),
    )
    conn.execute(
        "INSERT INTO Market VALUES (?, ?, ?, NULL, ?)",
        ("mkt_1", "evt_1", "moneyline", "moneyline"),
    )
    conn.execute(
        "INSERT INTO Selection VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))",
        ("sel_1", "mkt_1", "book_a", "home", "Knicks", 120),
    )
    conn.execute(
        "INSERT INTO Selection VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))",
        ("sel_2", "mkt_1", "book_b", "away", "Celtics", 110),
    )
    conn.commit()


def test_recompute_finds_two_book_arb(conn: sqlite3.Connection) -> None:
    _seed_two_book_arb(conn)
    inserted = recompute_arb_opps(conn)
    assert inserted == 1
    row = conn.execute("SELECT * FROM ArbOpp").fetchone()
    assert row is not None
    assert row["boostType"] == "standard"
    assert row["netReturnPct"] > 0
    assert row["bookAId"] != row["bookBId"]


def test_recompute_ignores_same_book_pair(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT INTO Event VALUES (?, ?, ?, ?, datetime('now', '+1 day'), ?, datetime('now'))",
        ("evt_1", "nba", "H", "A", "ck|1"),
    )
    conn.execute("INSERT INTO Market VALUES (?, ?, ?, NULL, ?)", ("mkt_1", "evt_1", "moneyline", "moneyline"))
    conn.execute(
        "INSERT INTO Selection VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))",
        ("sel_1", "mkt_1", "book_a", "home", "H", 120),
    )
    conn.execute(
        "INSERT INTO Selection VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))",
        ("sel_2", "mkt_1", "book_a", "away", "A", 110),
    )
    conn.commit()
    inserted = recompute_arb_opps(conn)
    assert inserted == 0  # same-book pairs are skipped
