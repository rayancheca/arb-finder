"""
BetMGM scraper — the public sports.ny.betmgm.com cds-api.

Primary endpoint (competition-level fixtures + grouped markets):
  https://sports.ny.betmgm.com/cds-api/bettingoffer/fixtures?x-bwin-accessid=...&competitionIds=<id>

BetMGM's `competitionId` is the league identifier. NBA on BetMGM is `6004`.
NFL needs to be confirmed from devtools on sports.ny.betmgm.com — we ship a
placeholder until that lands so the rest of the multi-sport plumbing can be
exercised, and the scraper raises ScraperError on the placeholder so the
circuit breaker kicks in instead of silently emitting empty NFL cycles.

BetMGM rotates their access IDs. We read BETMGM_ACCESS_ID from the env and
fall back to a sentinel that triggers a clean ScraperError with a hint so
the circuit breaker kicks in rather than the whole worker crashing.
"""

from __future__ import annotations

import os

import httpx

from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger
from .base import ScrapeResult, ScraperError, SportsbookScraper, get_json, parse_iso

log = get_logger("scraper.betmgm")

MGM_FIXTURES_URL = "https://sports.ny.betmgm.com/cds-api/bettingoffer/fixtures"
MGM_SPORT_ID = 7  # legacy default; we use competitionId for routing.

# TODO(rayan): confirm NFL competitionId from sports.ny.betmgm.com devtools.
# `35` is a common-guess placeholder. The scraper will surface this as a
# ScraperError until the real ID is in.
_NFL_COMPETITION_ID_PLACEHOLDER = 35


class BetMgmScraper(SportsbookScraper):
    book_id = "mgm"
    book_key = "betmgm"
    name = "BetMGM"

    # Per-sport endpoint configuration. `competition_id` is the only thing
    # that varies between leagues on the fixtures endpoint.
    SPORT_CONFIGS: dict[str, dict[str, int | bool]] = {
        "basketball_nba": {
            "competition_id": 6004,
            "needs_confirmation": False,
        },
        "football_nfl": {
            "competition_id": _NFL_COMPETITION_ID_PLACEHOLDER,
            "needs_confirmation": True,
        },
    }

    def __init__(
        self,
        *,
        sport_key: str = "basketball_nba",
        timeout: float | None = None,
    ) -> None:
        super().__init__(timeout=timeout)
        if sport_key not in self.SPORT_CONFIGS:
            raise ValueError(
                f"BetMGM scraper does not support sport {sport_key!r}; "
                f"known: {sorted(self.SPORT_CONFIGS)}"
            )
        self.sport_key = sport_key
        self.sport_config = self.SPORT_CONFIGS[sport_key]

    async def fetch(self, client: httpx.AsyncClient) -> ScrapeResult:
        # Fail loudly on the placeholder so the circuit breaker can open
        # rather than us emitting empty NFL cycles for weeks.
        if self.sport_config.get("needs_confirmation"):
            raise ScraperError(
                f"BetMGM {self.sport_key} competitionId is a placeholder "
                f"({self.sport_config['competition_id']}). Confirm from "
                "sports.ny.betmgm.com devtools and update SPORT_CONFIGS."
            )

        access_id = os.environ.get("BETMGM_ACCESS_ID", "").strip()
        if not access_id:
            raise ScraperError(
                "BETMGM_ACCESS_ID not configured — get it from a browser devtools "
                "network panel on sports.ny.betmgm.com and set it in apps/web/.env"
            )

        params = {
            "x-bwin-accessid": access_id,
            "lang": "en-us",
            "country": "US",
            "userCountry": "US",
            "subdivision": "US-NY",
            "offerMapping": "Filtered",
            "scoreboardMode": "Full",
            "fixtureTypes": "Standard",
            "state": "Latest",
            "competitionIds": str(self.sport_config["competition_id"]),
        }
        payload, status = await get_json(client, MGM_FIXTURES_URL, params=params)
        result = ScrapeResult(http_status=status)

        fixtures = payload.get("fixtures") or payload.get("Fixtures") or []
        for fx in fixtures:
            fx_id = str(fx.get("id") or "")
            if not fx_id:
                continue
            participants = fx.get("participants") or []
            home = next(
                (
                    p.get("name", {}).get("value")
                    for p in participants
                    if p.get("venueRole") == "Home"
                ),
                None,
            )
            away = next(
                (
                    p.get("name", {}).get("value")
                    for p in participants
                    if p.get("venueRole") == "Away"
                ),
                None,
            )
            start = fx.get("startDate")
            if not (home and away and start):
                continue
            try:
                commence = parse_iso(start)
            except ValueError:
                continue
            result.events.append(
                RawEvent(
                    book_key=self.book_key,
                    book_event_id=fx_id,
                    home_team=home,
                    away_team=away,
                    commence_time=commence,
                    sport_key=self.sport_key,
                )
            )

            for option_market in fx.get("optionMarkets") or []:
                name = (option_market.get("name") or {}).get("value") or ""
                name_lower = name.lower()
                if "moneyline" in name_lower or "money line" in name_lower:
                    market_type = "moneyline"
                elif "spread" in name_lower or "handicap" in name_lower:
                    market_type = "spread"
                elif "total" in name_lower or "over/under" in name_lower:
                    market_type = "total"
                else:
                    continue
                for option in option_market.get("options") or []:
                    odds = option.get("price", {}).get("american")
                    if odds is None:
                        odds = option.get("americanOdds")
                    if odds is None:
                        continue
                    try:
                        american = float(str(odds).replace("+", ""))
                    except ValueError:
                        continue
                    label = (option.get("name") or {}).get("value") or ""
                    label_lower = label.lower()
                    if market_type == "total":
                        side = (
                            "over"
                            if "over" in label_lower or label_lower.startswith("o")
                            else "under"
                        )
                    elif home and home.lower() in label_lower:
                        side = "home"
                    elif away and away.lower() in label_lower:
                        side = "away"
                    else:
                        continue
                    line_value = option.get("attr", {}).get("handicap")
                    result.selections.append(
                        RawSelection(
                            book_key=self.book_key,
                            book_event_id=fx_id,
                            market_type=market_type,
                            market_line=float(line_value)
                            if line_value is not None
                            else None,
                            side=side,
                            label=label,
                            american_odds=american,
                        )
                    )

        log.info(
            "betmgm_fetched",
            sport=self.sport_key,
            events=len(result.events),
            selections=len(result.selections),
        )
        if not result.events:
            raise ScraperError(
                f"BetMGM returned no fixtures for {self.sport_key}",
                http_status=status,
            )
        return result
