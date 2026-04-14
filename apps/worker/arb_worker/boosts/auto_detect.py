"""
Playwright session-based promo auto-detect.

Rayan logs into each sportsbook once with `python -m arb_worker login <book>`,
which opens a headed browser and persists cookies to
`apps/worker/.playwright-profiles/<book>/`. On subsequent runs, the detector
opens the same profile headless, navigates to the promotions page, and
scrapes active offers.

This is intentionally book-agnostic at the top level — each book contributes
a small plug-in of (promo_url, parser) that pulls structured boosts out of
the rendered page. Failures are non-fatal: a detector that can't find a
promo block just returns an empty list.

Phase B ships the framework + DraftKings + FanDuel detectors as the
reference implementation. The remaining books come online as Rayan adds
their profile credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from ..config import REPO_ROOT
from ..logging_setup import get_logger

log = get_logger("boosts.auto_detect")

PROFILE_ROOT = REPO_ROOT / "apps" / "worker" / ".playwright-profiles"
PROFILE_ROOT.mkdir(parents=True, exist_ok=True)


@dataclass
class DetectedBoost:
    book_key: str
    type: str  # free_bet | no_sweat | site_credit | profit_boost
    title: str
    description: str | None
    amount: float
    cash_rate: float | None = None
    source_url: str = ""


@dataclass
class BoostDetectionResult:
    book_key: str
    ok: bool
    boosts: list[DetectedBoost] = field(default_factory=list)
    error: str | None = None


# ── per-book registry ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class BookDetector:
    book_key: str
    promo_url: str
    parse_fn: Callable[[str], list[DetectedBoost]]


def _parse_draftkings_promos(html: str) -> list[DetectedBoost]:
    """
    DraftKings promo page parser. Looks for offer cards via data attributes
    and classifies by title keywords. This is a best-effort pass — promos
    that don't match the known templates just get classified as free_bet
    with a `needs-review` description.
    """
    import re

    boosts: list[DetectedBoost] = []
    # Offers carry data-track-promo-offer-id + a visible <h3> title
    card_pattern = re.compile(
        r'data-track-promo-offer-id="[^"]+"[^>]*>.*?<h3[^>]*>([^<]+)</h3>.*?'
        r'(\$\d[\d,]*)',
        re.DOTALL,
    )
    for match in card_pattern.finditer(html):
        title = match.group(1).strip()
        amount_raw = match.group(2).replace("$", "").replace(",", "")
        try:
            amount = float(amount_raw)
        except ValueError:
            continue
        t = title.lower()
        if "no sweat" in t or "no-sweat" in t:
            boost_type = "no_sweat"
        elif "free bet" in t:
            boost_type = "free_bet"
        elif "profit boost" in t or "odds boost" in t:
            boost_type = "profit_boost"
        else:
            boost_type = "site_credit"
        boosts.append(
            DetectedBoost(
                book_key="draftkings",
                type=boost_type,
                title=title,
                description="Auto-detected from DraftKings promotions page",
                amount=amount,
                source_url="https://sportsbook.draftkings.com/promotions",
            )
        )
    return boosts


def _parse_fanduel_promos(html: str) -> list[DetectedBoost]:
    import re

    boosts: list[DetectedBoost] = []
    # FD uses data-testid offer cards with h3 + a dollar amount nearby
    card_pattern = re.compile(
        r'data-testid="[^"]*offer[^"]*"[^>]*>.*?<h3[^>]*>([^<]+)</h3>.*?'
        r'(\$\d[\d,]*)',
        re.DOTALL | re.IGNORECASE,
    )
    for match in card_pattern.finditer(html):
        title = match.group(1).strip()
        amount_raw = match.group(2).replace("$", "").replace(",", "")
        try:
            amount = float(amount_raw)
        except ValueError:
            continue
        t = title.lower()
        boost_type = (
            "no_sweat"
            if "no sweat" in t
            else "free_bet"
            if "free bet" in t or "bonus bet" in t
            else "site_credit"
        )
        boosts.append(
            DetectedBoost(
                book_key="fanduel",
                type=boost_type,
                title=title,
                description="Auto-detected from FanDuel promotions",
                amount=amount,
                source_url="https://sportsbook.fanduel.com/promotions",
            )
        )
    return boosts


DETECTORS: dict[str, BookDetector] = {
    "draftkings": BookDetector(
        book_key="draftkings",
        promo_url="https://sportsbook.draftkings.com/promotions",
        parse_fn=_parse_draftkings_promos,
    ),
    "fanduel": BookDetector(
        book_key="fanduel",
        promo_url="https://sportsbook.fanduel.com/promotions",
        parse_fn=_parse_fanduel_promos,
    ),
}


async def detect_boosts_for_book(book_key: str) -> BoostDetectionResult:
    """
    Open the persisted Playwright profile for this book, navigate to the
    promo page, pass the rendered HTML to the book's parser, return the
    structured boosts. Playwright is imported lazily so installs without
    the `[stealth]` extra don't crash.
    """
    detector = DETECTORS.get(book_key)
    if detector is None:
        return BoostDetectionResult(
            book_key=book_key,
            ok=False,
            error=f"no detector registered for {book_key}",
        )

    try:
        from playwright.async_api import async_playwright  # type: ignore
    except ImportError:
        return BoostDetectionResult(
            book_key=book_key,
            ok=False,
            error=(
                "playwright not installed — run "
                "`pip install -e '.[stealth]'` and `playwright install chromium`"
            ),
        )

    profile_dir = PROFILE_ROOT / book_key
    profile_dir.mkdir(parents=True, exist_ok=True)

    try:
        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=str(profile_dir),
                headless=True,
                viewport={"width": 1280, "height": 800},
            )
            page = await context.new_page()
            await page.goto(detector.promo_url, wait_until="domcontentloaded")
            # Give SPA content a moment to hydrate.
            await page.wait_for_timeout(2000)
            html = await page.content()
            await context.close()
    except Exception as exc:  # noqa: BLE001
        log.exception("playwright_failure", book=book_key)
        return BoostDetectionResult(
            book_key=book_key,
            ok=False,
            error=f"playwright failure: {exc}",
        )

    try:
        boosts = detector.parse_fn(html)
    except Exception as exc:  # noqa: BLE001
        log.exception("parser_failure", book=book_key)
        return BoostDetectionResult(
            book_key=book_key,
            ok=False,
            error=f"parser failure: {exc}",
        )

    log.info(
        "boosts_detected",
        book=book_key,
        count=len(boosts),
    )
    return BoostDetectionResult(book_key=book_key, ok=True, boosts=boosts)
