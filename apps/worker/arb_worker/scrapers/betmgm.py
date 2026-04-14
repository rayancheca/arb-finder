"""
BetMGM NBA scraper — the public sports.ny.betmgm.com cds-api.

Primary endpoint (competition-level fixtures + grouped markets):
  https://sports.ny.betmgm.com/en/sports/api/widget/widgetdata
  ?layoutSize=Large&page=CompetitionLobby&sportId=7&regionId=9&competitionId=6004

And then per-fixture markets:
  https://sports.ny.betmgm.com/cds-api/bettingoffer/fixtures?x-bwin-accessid=...

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
MGM_COMPETITION_ID = 6004  # NBA on BetMGM
MGM_SPORT_ID = 7


class BetMgmScraper(SportsbookScraper):
    book_id = "mgm"
    book_key = "betmgm"
    name = "BetMGM"

    async def fetch(self, client: httpx.AsyncClient) -> ScrapeResult:
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
            "competitionIds": str(MGM_COMPETITION_ID),
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
                (p.get("name", {}).get("value") for p in participants if p.get("venueRole") == "Home"),
                None,
            )
            away = next(
                (p.get("name", {}).get("value") for p in participants if p.get("venueRole") == "Away"),
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
                        side = "over" if "over" in label_lower or label_lower.startswith("o") else "under"
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
                            market_line=float(line_value) if line_value is not None else None,
                            side=side,
                            label=label,
                            american_odds=american,
                        )
                    )

        log.info(
            "betmgm_fetched",
            events=len(result.events),
            selections=len(result.selections),
        )
        if not result.events:
            raise ScraperError("BetMGM returned no fixtures", http_status=status)
        return result
