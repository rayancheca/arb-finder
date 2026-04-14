"""
APScheduler orchestration + per-book circuit breaker.

The breaker reads the last N ScrapeRun rows for each book. If the book has
failed `MAX_CONSECUTIVE_FAILURES` runs in a row, we skip it for `cooldown`
seconds, doubling the cooldown on each repeat failure (capped at 1 hour).
The skip itself is logged as a ScrapeRun so the UI can show "circuit open
for 12 more minutes".
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from . import db
from .config import (
    CIRCUIT_BASE_COOLDOWN_SECONDS,
    MAX_CONSECUTIVE_FAILURES,
    POLL_INTERVAL_SECONDS,
)
from .logging_setup import get_logger
from .pipeline.run_cycle import run_cycle

log = get_logger("scheduler")


def _cooldown_seconds(consecutive_failures: int) -> int:
    """Exponential backoff, doubling every failure past the threshold. Cap 1h."""
    if consecutive_failures <= MAX_CONSECUTIVE_FAILURES:
        return 0
    excess = consecutive_failures - MAX_CONSECUTIVE_FAILURES
    seconds = CIRCUIT_BASE_COOLDOWN_SECONDS * (2 ** (excess - 1))
    return min(seconds, 3600)


def _is_open(rows: list) -> tuple[bool, int]:
    """
    Given recent ScrapeRun rows (most-recent first), return
    (is_open, failure_streak). A run is considered a failure if its
    status is anything other than 'ok'.
    """
    streak = 0
    for r in rows:
        if r["status"] == "ok":
            break
        streak += 1
    if streak < MAX_CONSECUTIVE_FAILURES:
        return False, streak
    return True, streak


def _last_finished(rows: list) -> datetime | None:
    if not rows:
        return None
    raw = rows[0]["finishedAt"] or rows[0]["startedAt"]
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def should_skip(book_key: str) -> tuple[bool, str | None]:
    """Check the breaker for one book. Returns (skip, reason-if-skipping)."""
    with db.connect() as conn:
        rows = db.recent_scrape_runs(conn, book_key, limit=MAX_CONSECUTIVE_FAILURES + 2)
    is_open, streak = _is_open(rows)
    if not is_open:
        return False, None
    cooldown = _cooldown_seconds(streak)
    last = _last_finished(rows)
    if last is None:
        return False, None
    reopen_at = last + timedelta(seconds=cooldown)
    now = datetime.now(timezone.utc)
    if now >= reopen_at:
        return False, None
    remaining = int((reopen_at - now).total_seconds())
    return True, f"circuit open ({streak} fails, {remaining}s until retry)"


async def tick() -> None:
    """One scheduler tick — runs the full cycle."""
    try:
        await run_cycle()
    except Exception:
        log.exception("tick_failed")


async def _scheduler_main() -> None:
    """Scheduler runs inside an asyncio loop that we keep alive forever."""
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        tick,
        trigger="interval",
        seconds=POLL_INTERVAL_SECONDS,
        id="arb_cycle",
        next_run_time=datetime.now(timezone.utc),
        max_instances=1,
        coalesce=True,
    )
    log.info("scheduler_start", interval_seconds=POLL_INTERVAL_SECONDS)
    scheduler.start()
    # Block forever — APScheduler runs its jobs on this loop, but the
    # loop itself needs an awaitable to keep alive.
    try:
        await asyncio.Event().wait()
    finally:
        scheduler.shutdown(wait=False)


def run_forever() -> None:
    """Start the AsyncIO scheduler and block until interrupted."""
    try:
        asyncio.run(_scheduler_main())
    except KeyboardInterrupt:
        log.info("scheduler_stop")
