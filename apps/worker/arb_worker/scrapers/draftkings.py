"""
DraftKings NBA scraper — public sportsbook JSON endpoint.

Endpoint: https://sportsbook.draftkings.com/sites/US-NY-SB/api/v5/eventgroups/{eventGroupId}
Event group 42648 is NBA for US-NY-SB. No auth required.

The response is a deeply nested eventGroup payload:
    eventGroup.offerCategories[*].offerSubcategoryDescriptors[*]
        .offerSubcategory.offers[*][*]
            .outcomes[*]  →  { label, oddsAmerican, participant, line? }

We extract moneyline, spread, and total for every event. Any market type
we don't recognize is skipped silently — we never write junk rows.
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

log = get_logger("scraper.draftkings")

DK_URL = "https://sportsbook.draftkings.com/sites/US-NY-SB/api/v5/eventgroups/42648"

# DK display-groups we care about for 2-way markets
MONEYLINE_NAMES = {"moneyline", "game lines"}
SPREAD_NAMES = {"spread", "point spread", "game spread"}
TOTAL_NAMES = {"total", "total points", "over/under"}


def _side_from_outcome(
    outcome: dict,
    *,
    home_team: str,
    away_team: str,
    market_type: str,
) -> str | None:
    label = (outcome.get("label") or "").strip().lower()
    if market_type == "moneyline":
        part = (outcome.get("participant") or outcome.get("label") or "").lower()
        if home_team.lower() in part or part in home_team.lower():
            return "home"
        if away_team.lower() in part or part in away_team.lower():
            return "away"
        return None
    if market_type == "total":
        if label.startswith("o") or "over" in label:
            return "over"
        if label.startswith("u") or "under" in label:
            return "under"
        return None
    if market_type == "spread":
        part = (outcome.get("participant") or outcome.get("label") or "").lower()
        if home_team.lower() in part or part in home_team.lower():
            return "home"
        if away_team.lower() in part or part in away_team.lower():
            return "away"
        return None
    return None


class DraftKingsScraper(SportsbookScraper):
    book_id = "dk"
    book_key = "draftkings"
    name = "DraftKings"

    async def fetch(self, client: httpx.AsyncClient) -> ScrapeResult:
        # DraftKings sits behind Akamai — vanilla httpx TLS → 403. Route
        # through curl_cffi's Chrome impersonation via a worker thread so we
        # don't block the asyncio loop.
        headers = {
            "Origin": "https://sportsbook.draftkings.com",
            "Referer": "https://sportsbook.draftkings.com/leagues/basketball/nba",
        }
        payload, status = await asyncio.to_thread(
            stealth_get_json, DK_URL, headers=headers
        )
        result = ScrapeResult(http_status=status)

        event_group = payload.get("eventGroup") or {}
        events_list = event_group.get("events") or []
        events_by_id: dict[str, dict] = {}
        for ev in events_list:
            event_id = str(ev.get("eventId") or "")
            if not event_id:
                continue
            events_by_id[event_id] = ev
            try:
                commence = parse_iso(ev["startDate"])
            except (KeyError, ValueError):
                continue
            result.events.append(
                RawEvent(
                    book_key=self.book_key,
                    book_event_id=event_id,
                    home_team=ev.get("teamName2") or ev.get("eventMetadata", {}).get("participantMetadata", {}).get("teamName", ""),
                    away_team=ev.get("teamName1") or "",
                    commence_time=commence,
                )
            )

        categories = event_group.get("offerCategories") or []
        for category in categories:
            for sub in category.get("offerSubcategoryDescriptors") or []:
                sub_cat = sub.get("offerSubcategory") or {}
                sub_name = (sub.get("name") or "").strip().lower()
                if sub_name in MONEYLINE_NAMES:
                    market_type = "moneyline"
                elif sub_name in SPREAD_NAMES:
                    market_type = "spread"
                elif sub_name in TOTAL_NAMES:
                    market_type = "total"
                else:
                    continue

                offers = sub_cat.get("offers") or []
                for offer_group in offers:
                    for offer in offer_group:
                        event_id = str(offer.get("eventId") or "")
                        if event_id not in events_by_id:
                            continue
                        event = events_by_id[event_id]
                        home = event.get("teamName2") or ""
                        away = event.get("teamName1") or ""
                        line_value = offer.get("line")
                        for outcome in offer.get("outcomes") or []:
                            odds = outcome.get("oddsAmerican")
                            if odds is None:
                                continue
                            try:
                                odds_float = float(
                                    str(odds).replace("+", "")
                                )
                            except ValueError:
                                continue
                            side = _side_from_outcome(
                                outcome,
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
                                    label=outcome.get("label", ""),
                                    american_odds=odds_float,
                                )
                            )

        log.info(
            "draftkings_fetched",
            events=len(result.events),
            selections=len(result.selections),
        )
        if not result.events:
            raise ScraperError("DraftKings returned no events", http_status=status)
        return result
