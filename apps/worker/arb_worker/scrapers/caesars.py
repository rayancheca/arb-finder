"""
Caesars NY NBA scraper — api.americanwagering.com public CZR endpoint.

Endpoint (NBA league id is stable):
  https://api.americanwagering.com/regions/us/locations/ny/brands/czr/sb/v3/events/schedule
  ?league=basketball_nba
"""

from __future__ import annotations

import asyncio

import httpx

from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger
from .base import (
    ScrapeResult,
    ScraperError,
    SportsbookScraper,
    parse_iso,
    stealth_get_json,
)

log = get_logger("scraper.caesars")

CZR_URL = (
    "https://api.americanwagering.com/regions/us/locations/ny/brands/czr/sb/v3/"
    "events/schedule"
)
# Back-compat default for legacy callers that may still import this constant.
CZR_PARAMS = {"league": "basketball_nba"}


class CaesarsScraper(SportsbookScraper):
    book_id = "caesars"
    book_key = "caesars"
    name = "Caesars"

    # Per-sport endpoint configuration. Caesars uses the same schedule URL
    # for every sport — only the `league` query string changes.
    SPORT_CONFIGS: dict[str, dict[str, str]] = {
        "basketball_nba": {"league": "basketball_nba"},
        "football_nfl": {"league": "american_football_nfl"},
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
                f"Caesars scraper does not support sport {sport_key!r}; "
                f"known: {sorted(self.SPORT_CONFIGS)}"
            )
        self.sport_key = sport_key
        self.sport_config = self.SPORT_CONFIGS[sport_key]

    async def fetch(self, client: httpx.AsyncClient) -> ScrapeResult:
        # Caesars also sits behind a TLS-fingerprint WAF. Same pattern as DK.
        payload, status = await asyncio.to_thread(
            stealth_get_json, CZR_URL, params=self.sport_config
        )
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
                    sport_key=self.sport_key,
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
            sport=self.sport_key,
            events=len(result.events),
            selections=len(result.selections),
        )
        if not result.events:
            raise ScraperError(
                f"Caesars returned no events for {self.sport_key}",
                http_status=status,
            )
        return result
