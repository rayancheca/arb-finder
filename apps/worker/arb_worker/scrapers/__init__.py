"""Scraper plug-ins — one per sportsbook."""
from .base import ScraperError, ScrapeResult, SportsbookScraper
from .betmgm import BetMgmScraper
from .betrivers import BetRiversScraper
from .caesars import CaesarsScraper
from .draftkings import DraftKingsScraper
from .fanduel import FanDuelScraper

SCRAPER_REGISTRY: dict[str, type[SportsbookScraper]] = {
    "draftkings": DraftKingsScraper,
    "fanduel": FanDuelScraper,
    "betmgm": BetMgmScraper,
    "caesars": CaesarsScraper,
    "betrivers": BetRiversScraper,
}

__all__ = [
    "SCRAPER_REGISTRY",
    "ScraperError",
    "ScrapeResult",
    "SportsbookScraper",
]
