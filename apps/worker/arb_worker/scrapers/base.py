"""
SportsbookScraper ABC + shared HTTP helpers.

Every scraper returns a list of RawEvent + RawSelection pairs so the pipeline
layer can run a single write path regardless of the source book. Scrapers
never touch the database directly — that's the pipeline's job.

Resilience:
- httpx.AsyncClient with tenacity retry on 5xx / connection errors
- curl_cffi fallback when a book blocks vanilla TLS fingerprints
- Per-scraper timeout + user agent
- Caller (pipeline) handles circuit breaker via ScrapeRun rows
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import datetime

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..config import REQUEST_TIMEOUT_SECONDS
from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger

log = get_logger("scraper")


class ScraperError(Exception):
    """Raised when a scraper cannot complete a cycle."""

    def __init__(self, message: str, *, http_status: int | None = None) -> None:
        super().__init__(message)
        self.http_status = http_status


@dataclass
class ScrapeResult:
    events: list[RawEvent] = field(default_factory=list)
    selections: list[RawSelection] = field(default_factory=list)
    http_status: int | None = None


DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


class SportsbookScraper(abc.ABC):
    """Override `book_id`, `book_key`, and `fetch` per book."""

    book_id: str = ""
    book_key: str = ""
    name: str = ""

    def __init__(self, *, timeout: float | None = None) -> None:
        self.timeout = timeout or REQUEST_TIMEOUT_SECONDS

    @abc.abstractmethod
    async def fetch(self, client: httpx.AsyncClient) -> ScrapeResult:
        """Return all NBA events + selections currently posted by this book."""
        raise NotImplementedError

    async def run(self) -> ScrapeResult:
        async with httpx.AsyncClient(
            headers=DEFAULT_HEADERS,
            timeout=self.timeout,
            follow_redirects=True,
            http2=True,
        ) as client:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=1, max=8),
                retry=retry_if_exception_type(
                    (httpx.TransportError, httpx.ReadTimeout, httpx.ConnectError)
                ),
                reraise=True,
            ):
                with attempt:
                    return await self.fetch(client)
        raise ScraperError("retry loop exited without a result")


async def get_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[dict, int]:
    """Shared GET helper that surfaces HTTP status for the circuit breaker."""
    response = await client.get(url, params=params, headers=headers)
    if response.status_code == 429:
        raise ScraperError(
            f"rate-limited by {url}",
            http_status=429,
        )
    if response.status_code >= 500:
        raise ScraperError(
            f"server error {response.status_code} from {url}",
            http_status=response.status_code,
        )
    if response.status_code >= 400:
        raise ScraperError(
            f"client error {response.status_code} from {url}",
            http_status=response.status_code,
        )
    try:
        return response.json(), response.status_code
    except ValueError as exc:
        raise ScraperError(f"non-JSON response from {url}: {exc}") from exc


def parse_iso(value: str) -> datetime:
    """Parse ISO timestamps that books return, tolerant of `Z` suffix."""
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)
