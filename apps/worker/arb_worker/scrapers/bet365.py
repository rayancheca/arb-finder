"""
bet365 NBA scraper — Playwright-driven.

bet365 is the hardest book to scrape by a wide margin:
  - TLS fingerprint + JA3 check (curl_cffi works to bypass, but bet365
    goes further)
  - Canvas fingerprinting
  - Session-bound cookies with short TTL
  - Odds tables rendered inside shadow DOM roots
  - Rate-limit kicks in after ~5 requests/minute

Strategy:
  - Persistent Chromium context, opened headless once per cycle
  - Mouse simulation + jittered scroll before reading
  - Pierce shadow DOM via page.evaluateHandle with deep element hunt
  - When bet365 serves the cloudflare-style challenge page, return
    cleanly so the circuit breaker fires off this book without a crash

This scraper is **enabled=False by default** in the BOOKS registry.
Flip it on once Rayan has logged into bet365 via `arb-worker login bet365`
and confirmed the profile page renders odds.
"""

from __future__ import annotations

from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger
from .base import ScrapeResult, ScraperError
from .playwright_base import PlaywrightScraper, human_mouse_move

log = get_logger("scraper.bet365")


class Bet365Scraper(PlaywrightScraper):
    book_id = "b365"
    book_key = "bet365"
    name = "bet365"
    start_url = "https://www.nj.bet365.com/#/AC/B18/C20604387/D48/E850/F165/"

    async def parse(self, page) -> ScrapeResult:
        result = ScrapeResult()
        # Wait for the main odds container. If we get served the CF
        # challenge page instead, we bail early.
        try:
            await page.wait_for_selector(
                'div[data-test*="OddsButton"], .gl-Participant, .src-ParticipantOddsOnly',
                timeout=12_000,
            )
        except Exception:
            title = await page.title()
            raise ScraperError(
                f"bet365 never rendered odds (got '{title}') — likely CF challenge"
            )

        await human_mouse_move(page, 600, 400)

        # bet365 renders odds inside shadow DOM roots in newer builds.
        # We walk the tree via a deep-querySelectorAll helper.
        raw = await page.evaluate(
            """
            () => {
              const results = [];
              const walker = (root) => {
                if (!root) return;
                const nodes = root.querySelectorAll('[data-test*="Odds"], .gl-Participant, .src-ParticipantOddsOnly');
                nodes.forEach((n) => {
                  const txt = n.innerText || '';
                  if (txt) results.push(txt);
                });
                const all = root.querySelectorAll('*');
                all.forEach((el) => {
                  if (el.shadowRoot) walker(el.shadowRoot);
                });
              };
              walker(document);
              return results;
            }
            """
        )

        log.info("bet365_raw_nodes", count=len(raw))
        # Phase F MVP: we collect raw strings rather than risk writing
        # bad selections. Rayan turns this into real RawSelection rows
        # once he's iterated on the selectors against a live page.
        if not raw:
            raise ScraperError("bet365 returned no odds nodes")

        return result
