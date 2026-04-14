"""
BetRivers NY NBA scraper — nj.betrivers.com lobby API.

Endpoint:
  https://nj.betrivers.com/api/service/sportsbook/offering/listview/events
  ?cageCode=271&type=league&primaryMarketOnly=true&state=NY&leagueId=1149

League id 1149 = NBA. primaryMarketOnly=false returns spread/total also.
"""

from __future__ import annotations

import httpx

from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger
from .base import ScrapeResult, ScraperError, SportsbookScraper, get_json, parse_iso

log = get_logger("scraper.betrivers")

BR_URL = "https://nj.betrivers.com/api/service/sportsbook/offering/listview/events"
BR_PARAMS = {
    "cageCode": "271",
    "type": "league",
    "primaryMarketOnly": "false",
    "state": "NY",
    "leagueId": "1149",
}


class BetRiversScraper(SportsbookScraper):
    book_id = "br"
    book_key = "betrivers"
    name = "BetRivers"

    async def fetch(self, client: httpx.AsyncClient) -> ScrapeResult:
        payload, status = await get_json(client, BR_URL, params=BR_PARAMS)
        result = ScrapeResult(http_status=status)

        items = payload.get("items") or payload.get("events") or []
        for item in items:
            ev_id = str(item.get("id") or item.get("eventId") or "")
            if not ev_id:
                continue
            participants = item.get("participants") or []
            if len(participants) >= 2:
                away = participants[0].get("name")
                home = participants[1].get("name")
            else:
                home = item.get("homeTeam")
                away = item.get("awayTeam")
            start = item.get("startTime") or item.get("startDate")
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

            for bet_offer in item.get("betOffers") or []:
                criterion = (bet_offer.get("criterion") or {}).get("label") or ""
                c_lower = criterion.lower()
                if "money line" in c_lower or "moneyline" in c_lower:
                    market_type = "moneyline"
                elif "handicap" in c_lower or "spread" in c_lower:
                    market_type = "spread"
                elif "total" in c_lower or "over/under" in c_lower:
                    market_type = "total"
                else:
                    continue
                for outcome in bet_offer.get("outcomes") or []:
                    odds_raw = outcome.get("oddsAmerican") or outcome.get("oddsAmericanStr")
                    if odds_raw is None:
                        continue
                    try:
                        american = float(str(odds_raw).replace("+", ""))
                    except ValueError:
                        continue
                    label = outcome.get("label") or outcome.get("participant") or ""
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
                            market_line=outcome.get("line"),
                            side=side,
                            label=label,
                            american_odds=american,
                        )
                    )

        log.info(
            "betrivers_fetched",
            events=len(result.events),
            selections=len(result.selections),
        )
        if not result.events:
            raise ScraperError("BetRivers returned no events", http_status=status)
        return result
