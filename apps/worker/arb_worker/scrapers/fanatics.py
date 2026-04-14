"""
Fanatics Sportsbook NBA scraper — Playwright-driven.

Fanatics uses a Next.js app with server-rendered odds plus client-side
hydration. The raw HTML has a __NEXT_DATA__ JSON blob with everything
we need, which means once we get past the WAF we don't need to poke
the DOM at all.
"""

from __future__ import annotations

import json

from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger
from .base import ScrapeResult, ScraperError
from .playwright_base import PlaywrightScraper

log = get_logger("scraper.fanatics")


class FanaticsScraper(PlaywrightScraper):
    book_id = "fan"
    book_key = "fanatics"
    name = "Fanatics"
    start_url = "https://sportsbook.fanatics.com/basketball/nba"

    async def parse(self, page) -> ScrapeResult:
        result = ScrapeResult()
        try:
            await page.wait_for_selector(
                'script#__NEXT_DATA__, [data-testid*="MarketCard"]',
                timeout=12_000,
            )
        except Exception:
            raise ScraperError("Fanatics never rendered market cards")

        next_data = await page.evaluate(
            """
            () => {
              const el = document.querySelector('script#__NEXT_DATA__');
              return el ? el.textContent : null;
            }
            """
        )
        if not next_data:
            raise ScraperError("Fanatics __NEXT_DATA__ not found")

        try:
            data = json.loads(next_data)
        except json.JSONDecodeError as exc:
            raise ScraperError(f"Fanatics __NEXT_DATA__ parse failed: {exc}") from exc

        # The exact shape here is Fanatics-version-specific. We walk
        # the tree looking for any object with `americanOdds` + a
        # parent event we can resolve. This keeps the scraper
        # self-healing across minor schema drift.
        def walk(obj, parent=None):
            if isinstance(obj, dict):
                if "americanOdds" in obj and parent is not None:
                    yield parent, obj
                for v in obj.values():
                    yield from walk(v, obj)
            elif isinstance(obj, list):
                for v in obj:
                    yield from walk(v, parent)

        events_found = 0
        for parent, odds in walk(data):
            _ = parent
            _ = odds
            events_found += 1

        log.info("fanatics_nodes", count=events_found)
        if events_found == 0:
            raise ScraperError("Fanatics __NEXT_DATA__ contained no odds")

        # Phase F MVP: we detect presence but defer structured parsing
        # until Rayan iterates on this against live Fanatics payloads.
        return result
