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
import os
from datetime import datetime, timedelta, timezone

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from . import db
from .alerts import send_pushover
from .config import (
    CIRCUIT_BASE_COOLDOWN_SECONDS,
    MAX_CONSECUTIVE_FAILURES,
    POLL_INTERVAL_SECONDS,
)
from .logging_setup import get_logger
from .pipeline.run_cycle import run_cycle

log = get_logger("scheduler")

# Dead-man counter: number of consecutive ticks where every book reported
# status=="error". After 3 such ticks (~15 minutes at default cadence) we
# wake the user with a priority-2 Pushover alert. Reset on any ok book.
_ALL_FAILED_STREAK_THRESHOLD = 3
_all_failed_streak = 0


def _ping_healthcheck(state: str) -> None:
    """Heartbeat Healthchecks.io.

    `state` is "ok", "fail", or anything else (treated as a plain ping).
    Silent no-op when HEALTHCHECKS_URL is unset (dev). Any error is
    swallowed — a missed heartbeat must never crash the tick.
    """
    base = os.environ.get("HEALTHCHECKS_URL", "").strip()
    if not base:
        return
    url = f"{base}/{state}" if state in ("ok", "fail") else base
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(url)
    except Exception as exc:  # noqa: BLE001 — fire-and-forget heartbeat
        log.debug("healthcheck_ping_failed", state=state, error=str(exc))


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
    global _all_failed_streak
    try:
        reports = await run_cycle()
        # Dead-man counter: bump only when every book in the cycle errored.
        # Any ok book resets the streak. An empty report list (no enabled
        # scrapers) is treated as "nothing happened" — we don't bump.
        if reports and all(r.status == "error" for r in reports):
            _all_failed_streak += 1
            log.warning(
                "all_books_failed_tick",
                streak=_all_failed_streak,
                threshold=_ALL_FAILED_STREAK_THRESHOLD,
            )
            if _all_failed_streak >= _ALL_FAILED_STREAK_THRESHOLD:
                send_pushover(
                    "All scrapers failed for 3 consecutive ticks (~15min)",
                    priority=2,
                    title="arb-finder DEAD",
                )
        elif reports:
            if _all_failed_streak:
                log.info("all_books_failed_streak_reset", prior=_all_failed_streak)
            _all_failed_streak = 0
        # Heartbeat to Healthchecks.io — only on success.
        _ping_healthcheck("ok")
    except Exception:
        log.exception("tick_failed")
        _ping_healthcheck("fail")


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
