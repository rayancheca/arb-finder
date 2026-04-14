"""Scraper plug-ins — one per sportsbook."""
from .base import ScraperError, ScrapeResult, SportsbookScraper
from .betmgm import BetMgmScraper
from .betrivers import BetRiversScraper
from .caesars import CaesarsScraper
from .draftkings import DraftKingsScraper
from .fanduel import FanDuelScraper

# Phase F scrapers — Playwright-driven, flaky, only loaded lazily from
# the SCRAPER_REGISTRY so installs without [stealth] don't crash.
SCRAPER_REGISTRY: dict[str, type[SportsbookScraper]] = {
    "draftkings": DraftKingsScraper,
    "fanduel": FanDuelScraper,
    "betmgm": BetMgmScraper,
    "caesars": CaesarsScraper,
    "betrivers": BetRiversScraper,
}

try:
    from .bet365 import Bet365Scraper
    from .espnbet import EspnBetScraper
    from .fanatics import FanaticsScraper

    SCRAPER_REGISTRY.update(
        {
            "bet365": Bet365Scraper,
            "fanatics": FanaticsScraper,
            "espnbet": EspnBetScraper,
        }
    )
except ImportError:
    # playwright isn't installed — skip Phase F scrapers silently. The
    # pipeline uses BookConfig.enabled to gate these anyway.
    pass

__all__ = [
    "SCRAPER_REGISTRY",
    "ScraperError",
    "ScrapeResult",
    "SportsbookScraper",
]
