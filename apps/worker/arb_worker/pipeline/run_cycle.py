"""
End-to-end scrape cycle:

  1. Run every enabled scraper in parallel (asyncio.gather)
  2. Per book: match events → write selections (in a single transaction)
  3. Recompute ArbOpp across every 2-way market × book pair
  4. Emit one ScrapeRun row per book for the circuit breaker + UI

The cycle is re-entrant: if any step raises, we record a failed ScrapeRun
and move on. A half-updated Selection table is still consistent because
every book's writes are wrapped in their own transaction.
"""

from __future__ import annotations

import asyncio
import sqlite3
from datetime import datetime, timezone
from dataclasses import dataclass

from .. import db
from ..config import BOOKS, BOOKS_BY_KEY
from ..logging_setup import get_logger
from ..matcher.event_matcher import match_or_create_event
from ..scrapers import SCRAPER_REGISTRY, ScrapeResult, ScraperError
from .recompute_arbs import recompute_arb_opps

log = get_logger("pipeline.cycle")


@dataclass
class BookCycleReport:
    book_key: str
    status: str
    events_found: int
    selections_found: int
    http_status: int | None
    error: str | None
    started_at: datetime
    finished_at: datetime


async def _run_scraper(book_key: str) -> tuple[str, ScrapeResult | None, str | None, int | None]:
    scraper_cls = SCRAPER_REGISTRY.get(book_key)
    if scraper_cls is None:
        return book_key, None, f"no scraper registered for {book_key}", None
    scraper = scraper_cls()
    try:
        result = await scraper.run()
        return book_key, result, None, result.http_status
    except ScraperError as exc:
        return book_key, None, str(exc), exc.http_status
    except Exception as exc:  # noqa: BLE001 — we want to log and continue
        return book_key, None, f"{type(exc).__name__}: {exc}", None


def _persist(
    conn: sqlite3.Connection,
    *,
    book_key: str,
    result: ScrapeResult,
) -> int:
    """Persist a single book's scraped events/selections. Returns selection count."""
    cfg = BOOKS_BY_KEY[book_key]
    book_id = db.get_book_id_by_key(conn, book_key) or cfg.id

    # Phase A — match every raw event to a canonical Event.
    event_id_by_book_event: dict[str, str] = {}
    for raw_ev in result.events:
        match = match_or_create_event(
            conn,
            book_id=book_id,
            book_key=book_key,
            book_event_id=raw_ev.book_event_id,
            raw_home=raw_ev.home_team,
            raw_away=raw_ev.away_team,
            commence_time=raw_ev.commence_time,
            raw_payload={
                "home": raw_ev.home_team,
                "away": raw_ev.away_team,
                "commence": raw_ev.commence_time.isoformat(),
            },
        )
        if match.event_id:
            event_id_by_book_event[raw_ev.book_event_id] = match.event_id

    selections_written = 0
    for sel in result.selections:
        event_id = event_id_by_book_event.get(sel.book_event_id)
        if not event_id:
            continue
        if sel.market_line is not None:
            market_key = f"{sel.market_type}:{sel.market_line}"
        else:
            market_key = sel.market_type
        market_id = db.upsert_market(
            conn,
            event_id=event_id,
            market_type=sel.market_type,
            market_line=sel.market_line,
            market_key=market_key,
        )
        db.upsert_selection(
            conn,
            market_id=market_id,
            book_id=book_id,
            side=sel.side,
            label=sel.label,
            american_odds=sel.american_odds,
            max_stake=sel.max_stake,
        )
        selections_written += 1

    return selections_written


async def run_cycle() -> list[BookCycleReport]:
    log.info("cycle_start")
    enabled = [b for b in BOOKS if b.enabled and b.key in SCRAPER_REGISTRY]
    tasks = [_run_scraper(b.key) for b in enabled]
    scraped = await asyncio.gather(*tasks)

    reports: list[BookCycleReport] = []
    now = lambda: datetime.now(timezone.utc)  # noqa: E731

    with db.connect() as conn:
        for book_key, result, error, http_status in scraped:
            started = now()
            if result is None:
                db.record_scrape_run(
                    conn,
                    book_key=book_key,
                    status="error",
                    started_at=started,
                    finished_at=now(),
                    http_status=http_status,
                    error=error,
                )
                reports.append(
                    BookCycleReport(
                        book_key=book_key,
                        status="error",
                        events_found=0,
                        selections_found=0,
                        http_status=http_status,
                        error=error,
                        started_at=started,
                        finished_at=now(),
                    )
                )
                continue

            try:
                with db.transaction(conn):
                    written = _persist(conn, book_key=book_key, result=result)
                status = "ok"
                err: str | None = None
            except Exception as exc:  # noqa: BLE001
                status = "error"
                err = f"persist failed: {type(exc).__name__}: {exc}"
                written = 0
                log.exception("persist_failed", book=book_key)

            finished = now()
            db.record_scrape_run(
                conn,
                book_key=book_key,
                status=status,
                started_at=started,
                finished_at=finished,
                http_status=http_status,
                error=err,
                events_found=len(result.events),
                selections_found=written,
            )
            reports.append(
                BookCycleReport(
                    book_key=book_key,
                    status=status,
                    events_found=len(result.events),
                    selections_found=written,
                    http_status=http_status,
                    error=err,
                    started_at=started,
                    finished_at=finished,
                )
            )

        # Phase A5 — always recompute arbs, even if some books failed.
        try:
            with db.transaction(conn):
                arb_count = recompute_arb_opps(conn)
            log.info("arbs_recomputed", count=arb_count)
        except Exception:  # noqa: BLE001
            log.exception("arb_recompute_failed")

    log.info(
        "cycle_done",
        books=len(reports),
        ok=sum(1 for r in reports if r.status == "ok"),
        errors=sum(1 for r in reports if r.status == "error"),
    )
    return reports
