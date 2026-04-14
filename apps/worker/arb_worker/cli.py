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
