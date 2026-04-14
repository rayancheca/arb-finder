"""
Shared base for Playwright-driven scrapers (bet365, Fanatics, ESPN BET).

Everything these books do to block scraping — TLS fingerprinting, mouse
movement analysis, canvas fingerprinting, iframed shadow DOM, client-side
rate limits — requires a real browser. We open a persistent-context
Chromium instance per book, keep the profile alive between runs so
login state survives, and simulate realistic mouse movement before
reading the DOM.

This base is lazy: `playwright` is imported inside `fetch()` so installs
without the `[stealth]` extra still work. Scrapers that depend on this
file are `enabled=False` in the BOOKS registry by default.
"""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from pathlib import Path

from ..config import REPO_ROOT
from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger
from .base import ScrapeResult, ScraperError, SportsbookScraper

log = get_logger("scraper.playwright")

PROFILE_ROOT = REPO_ROOT / "apps" / "worker" / ".playwright-profiles"


@dataclass
class PlaywrightSession:
    """Thin wrapper around a persistent context + page pair."""

    context: object
    page: object


async def human_mouse_move(page, end_x: int, end_y: int, steps: int = 25) -> None:
    """
    Move the virtual cursor from its current position to (end_x, end_y)
    along a jittery path. Not perfect spoofing, but enough to defeat the
    "did the cursor teleport" heuristics most WAFs rely on.
    """
    start = await page.evaluate(
        "() => { return [window.__lastMouseX || 0, window.__lastMouseY || 0]; }"
    )
    start_x, start_y = start if isinstance(start, list) else (0, 0)
    for i in range(steps):
        t = (i + 1) / steps
        jitter_x = random.uniform(-6, 6) * (1 - t)
        jitter_y = random.uniform(-6, 6) * (1 - t)
        x = start_x + (end_x - start_x) * t + jitter_x
        y = start_y + (end_y - start_y) * t + jitter_y
        await page.mouse.move(x, y)
        await asyncio.sleep(random.uniform(0.005, 0.02))
    await page.evaluate(
        f"() => {{ window.__lastMouseX = {end_x}; window.__lastMouseY = {end_y}; }}"
    )


async def human_scroll(page, distance: int = 600) -> None:
    """Scroll in small increments so the `scroll` event listener sees
    multiple events rather than one big jump."""
    steps = max(4, distance // 80)
    for _ in range(steps):
        await page.mouse.wheel(0, random.randint(60, 140))
        await asyncio.sleep(random.uniform(0.08, 0.2))


async def open_persistent_session(book_key: str, *, headless: bool = True):
    """
    Open (or reuse) the persisted Chromium profile for this book.
    Returns a PlaywrightSession the caller closes via `await session.context.close()`.
    """
    try:
        from playwright.async_api import async_playwright  # type: ignore
    except ImportError as exc:
        raise ScraperError(
            "playwright not installed — run `pip install -e '.[stealth]'` "
            "and `playwright install chromium`"
        ) from exc

    profile = PROFILE_ROOT / book_key
    profile.mkdir(parents=True, exist_ok=True)

    pw = await async_playwright().__aenter__()
    context = await pw.chromium.launch_persistent_context(
        user_data_dir=str(profile),
        headless=headless,
        viewport={"width": 1440, "height": 900},
        locale="en-US",
        timezone_id="America/New_York",
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        # Kill a couple of common fingerprint beacons. Not stealth-plugin
        # level, but cheap to do and takes care of the obvious tells.
        bypass_csp=True,
    )
    await context.add_init_script(
        """
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
        """
    )
    page = await context.new_page()
    return PlaywrightSession(context=context, page=page)


class PlaywrightScraper(SportsbookScraper):
    """Subclasses override `parse` with the per-book scrape logic."""

    start_url: str = ""

    async def fetch(self, _client) -> ScrapeResult:
        session = await open_persistent_session(self.book_key, headless=True)
        try:
            page = session.page
            await page.goto(self.start_url, wait_until="domcontentloaded")
            await human_mouse_move(page, 400, 300)
            await asyncio.sleep(random.uniform(1.2, 2.0))
            await human_scroll(page, 800)
            return await self.parse(page)
        except ScraperError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ScraperError(f"playwright scrape failed: {exc}") from exc
        finally:
            try:
                await session.context.close()
            except Exception:  # noqa: BLE001
                pass

    async def parse(self, page) -> ScrapeResult:
        raise NotImplementedError
