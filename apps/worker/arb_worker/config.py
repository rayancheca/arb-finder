"""Configuration + book registry. Reads DATABASE_URL from repo-root .env."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Resolve repo root regardless of cwd so this works under APScheduler,
# Railway, or a one-shot `python -m arb_worker cycle`.
REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(REPO_ROOT / "apps" / "web" / ".env")
load_dotenv(REPO_ROOT / ".env", override=False)


@dataclass(frozen=True)
class BookConfig:
    """Registry entry for one sportsbook."""

    id: str
    key: str
    name: str
    enabled: bool = True
    # NBA event group IDs for the JSON-endpoint scrapers.
    dk_event_group: int | None = None
    fd_competition_id: int | None = None


BOOKS: tuple[BookConfig, ...] = (
    BookConfig(
        id="dk",
        key="draftkings",
        name="DraftKings",
        dk_event_group=42648,  # NBA
    ),
    BookConfig(
        id="fd",
        key="fanduel",
        name="FanDuel",
        fd_competition_id=10547864,  # NBA
    ),
    BookConfig(id="mgm", key="betmgm", name="BetMGM"),
    BookConfig(id="caesars", key="caesars", name="Caesars"),
    BookConfig(id="br", key="betrivers", name="BetRivers"),
    # Phase F — flaky, guarded:
    BookConfig(id="b365", key="bet365", name="bet365", enabled=False),
    BookConfig(id="fan", key="fanatics", name="Fanatics", enabled=False),
    BookConfig(id="espn", key="espnbet", name="ESPN BET", enabled=False),
)

BOOKS_BY_KEY: dict[str, BookConfig] = {b.key: b for b in BOOKS}
BOOKS_BY_ID: dict[str, BookConfig] = {b.id: b for b in BOOKS}


def database_url() -> str:
    """
    Returns the DATABASE_URL in a form the worker's db layer can use.
    Prisma stores it as `file:/abs/path/dev.db` for SQLite; we strip the
    `file:` prefix so sqlite3 opens it directly.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set — expected in apps/web/.env or repo root .env"
        )
    return url


def is_sqlite() -> bool:
    return database_url().startswith("file:")


def sqlite_path() -> Path:
    url = database_url()
    if not url.startswith("file:"):
        raise RuntimeError(f"Not a SQLite URL: {url}")
    return Path(url.removeprefix("file:"))


POLL_INTERVAL_SECONDS = int(os.environ.get("ARB_POLL_INTERVAL_SECONDS", "300"))
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("ARB_REQUEST_TIMEOUT", "15"))
MAX_CONSECUTIVE_FAILURES = int(os.environ.get("ARB_MAX_FAILURES", "3"))
CIRCUIT_BASE_COOLDOWN_SECONDS = int(os.environ.get("ARB_COOLDOWN", "900"))
FUZZY_MATCH_WINDOW_MINUTES = int(os.environ.get("ARB_MATCH_WINDOW", "15"))
