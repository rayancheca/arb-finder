"""
ESPN BET NBA scraper — Playwright-driven.

ESPN BET is the Hard Rock-backed book and uses the same core API as
Hard Rock Bet. The web client pulls odds from a GraphQL endpoint, but
CSRF + session cookies mean calling it directly from httpx is painful.
Playwright with a persistent profile is cleaner.
"""

from __future__ import annotations

from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger
from .base import ScrapeResult, ScraperError
from .playwright_base import PlaywrightScraper

log = get_logger("scraper.espnbet")


class EspnBetScraper(PlaywrightScraper):
    book_id = "espn"
    book_key = "espnbet"
    name = "ESPN BET"
    start_url = "https://espnbet.com/sport/basketball/organization/united-states/competition/nba"

    async def parse(self, page) -> ScrapeResult:
        result = ScrapeResult()
        try:
            await page.wait_for_selector(
                '[data-testid="EventListEvent"], [class*="OddsButton"]',
                timeout=12_000,
            )
        except Exception:
            raise ScraperError("ESPN BET never rendered event list")

        # Count the visible events so we at least surface liveness to
        # the ScrapeRun log. Structured parsing comes in the first
        # live-iteration pass Rayan does from his NY network.
        event_count = await page.evaluate(
            """
            () => document.querySelectorAll('[data-testid="EventListEvent"]').length
            """
        )
        log.info("espnbet_events", count=event_count)
        if event_count == 0:
            raise ScraperError("ESPN BET event list empty")

        return result
