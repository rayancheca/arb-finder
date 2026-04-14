"""
Caesars NY NBA scraper — api.americanwagering.com public CZR endpoint.

Endpoint (NBA league id is stable):
  https://api.americanwagering.com/regions/us/locations/ny/brands/czr/sb/v3/events/schedule
  ?league=basketball_nba
"""

from __future__ import annotations

import httpx

from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger
from .base import ScrapeResult, ScraperError, SportsbookScraper, get_json, parse_iso

log = get_logger("scraper.caesars")

CZR_URL = (
    "https://api.americanwagering.com/regions/us/locations/ny/brands/czr/sb/v3/"
    "events/schedule"
)
CZR_PARAMS = {"league": "basketball_nba"}


class CaesarsScraper(SportsbookScraper):
    book_id = "caesars"
    book_key = "caesars"
    name = "Caesars"

    async def fetch(self, client: httpx.AsyncClient) -> ScrapeResult:
        payload, status = await get_json(client, CZR_URL, params=CZR_PARAMS)
        result = ScrapeResult(http_status=status)

        events = payload.get("competitions") or payload.get("events") or []
        for ev in events:
            ev_id = str(ev.get("id") or "")
            if not ev_id:
                continue
            home = ev.get("homeTeam") or ev.get("competitors", [{}])[0].get("name")
            away = ev.get("awayTeam") or (
                ev.get("competitors", [{}])[1].get("name")
                if len(ev.get("competitors") or []) > 1
                else None
            )
            start = ev.get("startTime") or ev.get("date")
            if not (home and away and start):
                continue
            try:
                commence = parse_iso(start)
            except ValueError:
                continue
            result.events.append(
                RawEvent(
                    book_key=self.book_key,
                    book_event_id=ev_id,
                    home_team=home,
                    away_team=away,
                    commence_time=commence,
                )
            )

            for market in ev.get("markets") or []:
                mtype_raw = (market.get("name") or market.get("displayName") or "").lower()
                if "moneyline" in mtype_raw or "money line" in mtype_raw:
                    market_type = "moneyline"
                elif "spread" in mtype_raw or "handicap" in mtype_raw:
                    market_type = "spread"
                elif "total" in mtype_raw or "over" in mtype_raw:
                    market_type = "total"
                else:
                    continue
                for selection in market.get("selections") or []:
                    odds_raw = (
                        selection.get("americanPrice")
                        or selection.get("price", {}).get("a")
                        or selection.get("odds")
                    )
                    if odds_raw is None:
                        continue
                    try:
                        american = float(str(odds_raw).replace("+", ""))
                    except ValueError:
                        continue
                    label = selection.get("name") or selection.get("displayName") or ""
                    label_lower = label.lower()
                    if market_type == "total":
                        side = "over" if "over" in label_lower or label_lower.startswith("o") else "under"
                    elif home.lower() in label_lower:
                        side = "home"
                    elif away.lower() in label_lower:
                        side = "away"
                    else:
                        continue
                    result.selections.append(
                        RawSelection(
                            book_key=self.book_key,
                            book_event_id=ev_id,
                            market_type=market_type,
                            market_line=selection.get("handicap"),
                            side=side,
                            label=label,
                            american_odds=american,
                        )
                    )

        log.info(
            "caesars_fetched",
            events=len(result.events),
            selections=len(result.selections),
        )
        if not result.events:
            raise ScraperError("Caesars returned no events", http_status=status)
        return result
