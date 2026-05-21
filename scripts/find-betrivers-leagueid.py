#!/usr/bin/env python3
"""
find-betrivers-leagueid.py — one-shot diagnostic helper.

Run this from your NY home network. The cloud-deploy worker has BetRivers
disabled until this is fixed.

BetRivers returns HTTP 200 with 0 events on the previously-hardcoded
leagueId=1149. Rush Street rotates the NBA leagueId from time to time, so
this script:

  1. First tries the public leagues-by-group endpoint to discover the
     current NBA leagueId directly.
  2. If that endpoint shape has changed (or returns nothing useful), falls
     back to sweeping two known Rush Street ID ranges (1000-1500 and
     100000000-100000100) and prints which IDs return events plus the home/
     away team names of the first event in each non-empty response.

Once you have the suggested leagueId, drop it into
apps/worker/arb_worker/scrapers/betrivers.py and flip the BetRivers entry
in apps/worker/arb_worker/config.py back to enabled=True.

Usage:
    python scripts/find-betrivers-leagueid.py [--help]

Dependencies: httpx only (sync). Install with `pip install httpx` if not
already in your active environment.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

import httpx

# Public Rush Street endpoints used by the NY-licensed BetRivers brand.
BASE_URL = "https://ny.betrivers.com/api/service/sportsbook/offering"
LEAGUES_URL = f"{BASE_URL}/leagues"
EVENTS_URL = f"{BASE_URL}/listview/events"

CAGE_CODE = "212"  # New York
GROUP = "BASKETBALL"
COUNTRY = "US"

# Two ID ranges Rush Street is known to use for league identifiers.
# The legacy short-range (~1000-1500) was where leagueId=1149 originally
# came from; newer deployments started issuing 9-digit IDs (~1e8 + offset).
# Sweep both so the helper works regardless of which generation BetRivers
# happens to be on the day this script is run.
SHORT_RANGE = range(1000, 1501)
LONG_RANGE = range(100_000_000, 100_000_101)

REQUEST_TIMEOUT = 20.0
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


def try_leagues_endpoint(client: httpx.Client) -> int | None:
    """
    Attempt the structured leagues-by-group endpoint. Returns the NBA
    leagueId if found, otherwise None.
    """
    params = {"cageCode": CAGE_CODE, "country": COUNTRY, "group": GROUP}
    print(f"[1/2] GET {LEAGUES_URL}")
    print(f"      params={params}")
    try:
        resp = client.get(LEAGUES_URL, params=params, headers=HEADERS)
    except httpx.HTTPError as exc:
        print(f"      transport error: {exc}")
        return None

    print(f"      HTTP {resp.status_code}")
    if resp.status_code != 200:
        print("      (non-200 — endpoint may have moved; falling back to sweep)")
        return None

    try:
        payload = resp.json()
    except ValueError:
        print("      response was not JSON; falling back to sweep")
        return None

    # Be tolerant about response shape — Rush Street has shipped multiple
    # variants of this endpoint. Look for any object whose name field
    # mentions "NBA" and which exposes a numeric id.
    leagues = _flatten_leagues(payload)
    if not leagues:
        print("      no league objects found in response; falling back to sweep")
        return None

    for league in leagues:
        name = str(league.get("name") or league.get("displayName") or "")
        league_id = league.get("id") or league.get("leagueId")
        if "nba" in name.lower() and league_id is not None:
            print(f"      found candidate: {name!r} → leagueId={league_id}")
            try:
                return int(league_id)
            except (TypeError, ValueError):
                continue

    print("      no NBA entry in leagues payload; falling back to sweep")
    return None


def _flatten_leagues(payload: Any) -> list[dict[str, Any]]:
    """
    Walk the response payload and collect any dict that looks like a league
    (has an id and a name). Works regardless of whether the response is a
    list, a dict with a `leagues` key, or nested under `group`.
    """
    out: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            looks_like_league = (
                ("id" in node or "leagueId" in node)
                and ("name" in node or "displayName" in node)
            )
            if looks_like_league:
                out.append(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(payload)
    return out


def probe_league_id(client: httpx.Client, league_id: int) -> tuple[int, str | None]:
    """
    Query the events endpoint for a given leagueId. Returns (event_count,
    sample_label) where sample_label is "HOME vs AWAY" of the first event
    if any, else None.
    """
    params = {
        "cageCode": CAGE_CODE,
        "type": "PREMATCH",
        "leagueId": league_id,
        "primaryMarketOnly": "false",
    }
    try:
        resp = client.get(EVENTS_URL, params=params, headers=HEADERS)
    except httpx.HTTPError as exc:
        return 0, f"transport-error: {exc}"

    if resp.status_code != 200:
        return 0, f"http-{resp.status_code}"

    try:
        payload = resp.json()
    except ValueError:
        return 0, "non-json"

    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        return 0, None

    first = items[0] if isinstance(items[0], dict) else {}
    home = (
        first.get("homeName")
        or first.get("home")
        or (first.get("participants") or [{}])[0].get("name")
        if isinstance(first.get("participants"), list)
        else first.get("homeName")
    )
    away = (
        first.get("awayName")
        or first.get("away")
        or (
            first.get("participants")[1].get("name")
            if isinstance(first.get("participants"), list)
            and len(first.get("participants")) > 1
            else None
        )
    )

    label = None
    if home or away:
        label = f"{home or '?'} vs {away or '?'}"
    return len(items), label


def sweep(client: httpx.Client) -> list[tuple[int, int, str | None]]:
    """
    Sweep both known Rush Street leagueId ranges. Returns a list of
    (league_id, event_count, sample_label) for every ID that returned at
    least one event.
    """
    hits: list[tuple[int, int, str | None]] = []

    print(f"[2/2] sweeping short range {SHORT_RANGE.start}-{SHORT_RANGE.stop - 1}")
    for lid in SHORT_RANGE:
        count, label = probe_league_id(client, lid)
        if count > 0:
            print(f"      leagueId={lid} → {count} events ({label})")
            hits.append((lid, count, label))

    print(
        f"      sweeping long range {LONG_RANGE.start}-{LONG_RANGE.stop - 1}"
    )
    for lid in LONG_RANGE:
        count, label = probe_league_id(client, lid)
        if count > 0:
            print(f"      leagueId={lid} → {count} events ({label})")
            hits.append((lid, count, label))

    return hits


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Discover the current BetRivers NBA leagueId. Run from a NY "
            "home network — cloud IPs are geo-blocked."
        )
    )
    return parser.parse_args()


def main() -> int:
    parse_args()
    print("find-betrivers-leagueid.py — one-shot diagnostic")
    print("=" * 60)

    with httpx.Client(timeout=REQUEST_TIMEOUT, follow_redirects=True) as client:
        suggested = try_leagues_endpoint(client)

        # Even if the leagues endpoint suggested an ID, verify it actually
        # returns events. The structured endpoint has been known to list
        # leagues with no live offering.
        if suggested is not None:
            count, label = probe_league_id(client, suggested)
            print(
                f"      verifying suggested leagueId={suggested}: "
                f"{count} events ({label})"
            )
            if count > 0:
                print()
                print(f"Suggested leagueId: {suggested}")
                return 0
            print("      suggested leagueId returned 0 events — sweeping anyway")

        hits = sweep(client)

    print()
    if not hits:
        print(
            "No leagueId in the swept ranges returned any events. "
            "Either BetRivers has no live NBA offering right now, or "
            "they have moved to a new ID range entirely. Try again "
            "during NBA hours, or inspect the network tab on "
            "https://ny.betrivers.com/?page=sports/basketball/nba."
        )
        return 1

    best = max(hits, key=lambda h: h[1])
    print(f"Suggested leagueId: {best[0]}")
    if best[2]:
        print(f"  sample event: {best[2]}")
    if len(hits) > 1:
        print("  other candidates with events:")
        for lid, count, label in hits:
            if lid == best[0]:
                continue
            print(f"    leagueId={lid} → {count} events ({label})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
