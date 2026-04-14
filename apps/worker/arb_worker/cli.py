"""
Command-line interface.

Usage:
    python -m arb_worker cycle    # run one cycle and exit
    python -m arb_worker run      # run the scheduler forever
    python -m arb_worker doctor   # self-check: can we reach the DB + scrapers
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from .logging_setup import configure_logging, get_logger


def main() -> None:
    configure_logging()
    log = get_logger("cli")

    parser = argparse.ArgumentParser(prog="arb-worker")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("cycle", help="run one scrape cycle and exit")
    sub.add_parser("run", help="run the scheduler on a 5-minute cadence")
    sub.add_parser("doctor", help="self-check database + scraper imports")

    detect = sub.add_parser(
        "detect-boosts",
        help="auto-detect active promos for one or all books via Playwright",
    )
    detect.add_argument(
        "book",
        nargs="?",
        help="book key (draftkings, fanduel). Omit to detect for all.",
    )

    login = sub.add_parser(
        "login",
        help="open a headed browser so you can log into a book; cookies persist",
    )
    login.add_argument("book", help="book key (draftkings, fanduel)")

    args = parser.parse_args()

    if args.command == "cycle":
        from .pipeline.run_cycle import run_cycle

        reports = asyncio.run(run_cycle())
        for r in reports:
            log.info(
                "book_report",
                book=r.book_key,
                status=r.status,
                events=r.events_found,
                selections=r.selections_found,
                error=r.error,
            )
        any_ok = any(r.status == "ok" for r in reports)
        sys.exit(0 if any_ok else 1)

    if args.command == "run":
        from .scheduler import run_forever

        run_forever()
        return

    if args.command == "detect-boosts":
        from .boosts.auto_detect import DETECTORS, detect_boosts_for_book

        targets = [args.book] if args.book else list(DETECTORS.keys())
        results = []

        async def run_all() -> None:
            for bk in targets:
                results.append(await detect_boosts_for_book(bk))

        asyncio.run(run_all())

        from . import db as dblayer
        import uuid

        with dblayer.connect() as conn:
            for res in results:
                log.info(
                    "detect_result",
                    book=res.book_key,
                    ok=res.ok,
                    count=len(res.boosts),
                    error=res.error,
                )
                if not res.ok:
                    continue
                book_id = dblayer.get_book_id_by_key(conn, res.book_key)
                if not book_id:
                    continue
                for b in res.boosts:
                    conn.execute(
                        """
                        INSERT INTO Boost
                            (id, bookId, type, title, description, amount,
                             cashRate, active, activeFrom, activeTo, eventId)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), NULL, NULL)
                        """,
                        (
                            f"boost_{uuid.uuid4().hex[:12]}",
                            book_id,
                            b.type,
                            b.title,
                            b.description,
                            b.amount,
                            b.cash_rate,
                        ),
                    )
        sys.exit(0 if all(r.ok for r in results) else 1)

    if args.command == "login":
        try:
            from playwright.async_api import async_playwright  # type: ignore
        except ImportError:
            log.error(
                "playwright_missing",
                hint="pip install -e '.[stealth]' && playwright install chromium",
            )
            sys.exit(1)

        from .boosts.auto_detect import DETECTORS, PROFILE_ROOT

        detector = DETECTORS.get(args.book)
        if not detector:
            log.error("unknown_book", book=args.book)
            sys.exit(1)

        async def open_browser() -> None:
            profile = PROFILE_ROOT / args.book
            profile.mkdir(parents=True, exist_ok=True)
            async with async_playwright() as p:
                ctx = await p.chromium.launch_persistent_context(
                    user_data_dir=str(profile),
                    headless=False,
                    viewport={"width": 1280, "height": 800},
                )
                page = await ctx.new_page()
                await page.goto(detector.promo_url)
                log.info(
                    "browser_open",
                    hint="log in, then close the window to persist cookies",
                )
                try:
                    await page.wait_for_event("close", timeout=0)
                except Exception:
                    pass
                await ctx.close()

        asyncio.run(open_browser())
        sys.exit(0)

    if args.command == "doctor":
        from . import db
        from .scrapers import SCRAPER_REGISTRY

        try:
            with db.connect() as conn:
                count = conn.execute("SELECT COUNT(*) AS c FROM Book").fetchone()[0]
            log.info("doctor_db_ok", books=count)
        except Exception as exc:  # noqa: BLE001
            log.error("doctor_db_failed", error=str(exc))
            sys.exit(1)
        log.info("doctor_scrapers_registered", count=len(SCRAPER_REGISTRY))
        for key, cls in SCRAPER_REGISTRY.items():
            log.info("doctor_scraper", key=key, cls=cls.__name__)
        sys.exit(0)


if __name__ == "__main__":
    main()
