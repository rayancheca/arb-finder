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

BR_URL = "https://ny.betrivers.com/api/service/sportsbook/offering/listview/events"
# cageCode maps to the specific state operator. BetRivers rotates these
# occasionally — if the scraper starts 400-ing with "No cage configuration
# found", sweep the integer range 1..500 to find the current NY value.
# As of 2026-04 the NY cage code is 212.
BR_CAGE_CODE = "212"

# TODO(rayan): confirm BetRivers NFL leagueId from devtools — same gap as
# the historical NBA leagueId discovery. The scraper raises ScraperError
# until the placeholder is replaced so the circuit breaker can open.
_NFL_LEAGUE_ID_PLACEHOLDER = "0"

# Back-compat default for any external test that still imports BR_PARAMS.
BR_PARAMS = {
    "cageCode": BR_CAGE_CODE,
    "type": "PREMATCH",
    "leagueId": "1149",
    "primaryMarketOnly": "false",
}


class BetRiversScraper(SportsbookScraper):
    book_id = "br"
    book_key = "betrivers"
    name = "BetRivers"

    # Per-sport endpoint configuration. `league_id` is the only thing that
    # changes between sports on this endpoint.
    SPORT_CONFIGS: dict[str, dict[str, str | bool]] = {
        "basketball_nba": {
            "league_id": "1149",
            "needs_confirmation": False,
        },
        "football_nfl": {
            "league_id": _NFL_LEAGUE_ID_PLACEHOLDER,
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
                f"BetRivers scraper does not support sport {sport_key!r}; "
                f"known: {sorted(self.SPORT_CONFIGS)}"
            )
        self.sport_key = sport_key
        self.sport_config = self.SPORT_CONFIGS[sport_key]

    async def fetch(self, client: httpx.AsyncClient) -> ScrapeResult:
        if self.sport_config.get("needs_confirmation"):
            raise ScraperError(
                f"BetRivers {self.sport_key} leagueId is a placeholder "
                f"({self.sport_config['league_id']!r}). Confirm via devtools "
                "and update SPORT_CONFIGS."
            )

        params = {
            "cageCode": BR_CAGE_CODE,
            "type": "PREMATCH",
            "leagueId": str(self.sport_config["league_id"]),
            "primaryMarketOnly": "false",
        }
        payload, status = await get_json(client, BR_URL, params=params)
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
                    sport_key=self.sport_key,
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
            sport=self.sport_key,
            events=len(result.events),
            selections=len(result.selections),
        )
        if not result.events:
            raise ScraperError(
                f"BetRivers returned no events for {self.sport_key}",
                http_status=status,
            )
        return result
