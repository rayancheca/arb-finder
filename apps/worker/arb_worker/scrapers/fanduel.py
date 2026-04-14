"""
FanDuel NBA scraper — SportsBook public JSON.

Endpoint:
  https://sbapi.ny.sportsbook.fanduel.com/api/content-managed-page
  ?page=CUSTOM&customPageId=nba&pbHorizontal=false&_ak=FhMFpcPWXMeyZxOx&timezone=America%2FNew_York

FanDuel wraps everything in attachments:
  attachments.events[eventId] → { name, openDate, runners? }
  attachments.markets[marketId] → { marketType, runners: [{ runnerName, winRunnerOdds }] }

We crosswalk markets → events and emit RawSelection rows. The winRunnerOdds
payload contains both `americanDisplayOdds` (string) and `trueOdds.decimalOdds`
— we prefer the American string and parse it tolerantly.
"""

from __future__ import annotations

import re

import httpx

from ..db import RawEvent, RawSelection
from ..logging_setup import get_logger
from .base import ScrapeResult, ScraperError, SportsbookScraper, get_json, parse_iso

log = get_logger("scraper.fanduel")

FD_URL = "https://sbapi.ny.sportsbook.fanduel.com/api/content-managed-page"
FD_PARAMS = {
    "page": "CUSTOM",
    "customPageId": "nba",
    "pbHorizontal": "false",
    "_ak": "FhMFpcPWXMeyZxOx",
    "timezone": "America/New_York",
}

MONEYLINE_HINTS = {"moneyline", "match odds", "match winner"}
SPREAD_HINTS = {"spread", "point spread", "handicap"}
TOTAL_HINTS = {"total", "total points", "over/under"}


def _classify_market(market_name: str) -> str | None:
    n = market_name.lower()
    if any(h in n for h in MONEYLINE_HINTS):
        return "moneyline"
    if any(h in n for h in SPREAD_HINTS):
        return "spread"
    if any(h in n for h in TOTAL_HINTS):
        return "total"
    return None


def _parse_american(raw: str | float | int | None) -> float | None:
    if raw is None:
        return None
    s = str(raw).replace("+", "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _side_for(
    runner_name: str,
    *,
    home_team: str,
    away_team: str,
    market_type: str,
) -> str | None:
    n = runner_name.lower()
    if market_type == "total":
        if n.startswith("o") or "over" in n:
            return "over"
        if n.startswith("u") or "under" in n:
            return "under"
        return None
    if home_team and home_team.lower() in n:
        return "home"
    if away_team and away_team.lower() in n:
        return "away"
    return None


class FanDuelScraper(SportsbookScraper):
    book_id = "fd"
    book_key = "fanduel"
    name = "FanDuel"

    async def fetch(self, client: httpx.AsyncClient) -> ScrapeResult:
        payload, status = await get_json(client, FD_URL, params=FD_PARAMS)
        result = ScrapeResult(http_status=status)

        attachments = payload.get("attachments") or {}
        events = attachments.get("events") or {}
        markets = attachments.get("markets") or {}

        event_meta: dict[str, tuple[str, str]] = {}
        for ev_id, ev in events.items():
            ev_id = str(ev_id)
            # "New York Knicks @ Brooklyn Nets"
            name = ev.get("name") or ""
            parts = re.split(r"\s@\s| v | vs ", name)
            if len(parts) != 2:
                continue
            away, home = parts[0].strip(), parts[1].strip()
            event_meta[ev_id] = (home, away)
            open_iso = ev.get("openDate") or ev.get("startDate")
            if not open_iso:
                continue
            try:
                commence = parse_iso(open_iso)
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

        for market_id, market in markets.items():
            event_id = str(market.get("eventId") or "")
            if event_id not in event_meta:
                continue
            home, away = event_meta[event_id]
            market_name = market.get("marketType") or market.get("marketName") or ""
            market_type = _classify_market(market_name)
            if market_type is None:
                continue
            line_value = market.get("handicap")
            for runner in market.get("runners") or []:
                wro = runner.get("winRunnerOdds") or {}
                american = _parse_american(wro.get("americanDisplayOdds"))
                if american is None:
                    continue
                runner_name = runner.get("runnerName") or ""
                side = _side_for(
                    runner_name,
                    home_team=home,
                    away_team=away,
                    market_type=market_type,
                )
                if side is None:
                    continue
                result.selections.append(
                    RawSelection(
                        book_key=self.book_key,
                        book_event_id=event_id,
                        market_type=market_type,
                        market_line=float(line_value)
                        if line_value is not None
                        else None,
                        side=side,
                        label=runner_name,
                        american_odds=american,
                    )
                )

        log.info(
            "fanduel_fetched",
            events=len(result.events),
            selections=len(result.selections),
        )
        if not result.events:
            raise ScraperError("FanDuel returned no events", http_status=status)
        return result
