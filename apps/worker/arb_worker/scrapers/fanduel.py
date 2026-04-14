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

# FanDuel uses SCREAMING_SNAKE_CASE for marketType. The full set for NBA is
# larger than we care about; we match the 3 specific 2-way markets we arb on.
FD_MARKET_TYPES: dict[str, str] = {
    "MONEY_LINE": "moneyline",
    "MATCH_ODDS": "moneyline",
    "MATCH_HANDICAP_(2-WAY)": "spread",
    "MATCH_HANDICAP": "spread",
    "POINT_SPREAD": "spread",
    "TOTAL_POINTS_(OVER/UNDER)": "total",
    "TOTAL_POINTS": "total",
    "TOTAL": "total",
}


def _classify_market(market_type: str) -> str | None:
    if not market_type:
        return None
    mt = market_type.upper()
    if mt in FD_MARKET_TYPES:
        return FD_MARKET_TYPES[mt]
    if "MONEY_LINE" in mt:
        return "moneyline"
    if "HANDICAP" in mt and "2-WAY" in mt:
        return "spread"
    if "TOTAL" in mt and "OVER" in mt:
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
            market_type = _classify_market(market.get("marketType") or "")
            if market_type is None:
                continue
            for runner in market.get("runners") or []:
                wro = runner.get("winRunnerOdds") or {}
                # FanDuel nests american odds two levels deep:
                #   winRunnerOdds.americanDisplayOdds.americanOddsInt (int)
                display = wro.get("americanDisplayOdds") or {}
                american_raw = (
                    display.get("americanOddsInt")
                    if isinstance(display, dict)
                    else display
                )
                if american_raw is None:
                    american_raw = display.get("americanOdds") if isinstance(display, dict) else None
                american = _parse_american(american_raw)
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
                # handicap lives on the runner itself (per-side line) or on the
                # market. Prefer runner-level (correct for spread and total).
                runner_handicap = runner.get("handicap")
                line_value = (
                    runner_handicap
                    if runner_handicap not in (None, 0)
                    else market.get("handicap")
                )
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
