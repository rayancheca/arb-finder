"""Pushover emergency alerts. $5 lifetime, priority=2 wakes the user."""
from __future__ import annotations

import os
import urllib.parse
import urllib.request
from typing import Literal

from .logging_setup import get_logger

log = get_logger("alerts")
Priority = Literal[-2, -1, 0, 1, 2]


def send_pushover(message: str, *, priority: Priority = 0, title: str | None = None) -> bool:
    """Send a Pushover notification. Returns True on success.

    Priority 2 (emergency) repeats every 30s for 1 hour until ack'd —
    use only for "scrapers all dead" or "bet drift detected" class events.
    """
    token = os.environ.get("PUSHOVER_TOKEN", "").strip()
    user = os.environ.get("PUSHOVER_USER", "").strip()
    if not token or not user:
        log.debug("pushover_skip_no_creds")
        return False
    payload = {
        "token": token,
        "user": user,
        "message": message,
        "priority": str(priority),
    }
    if title:
        payload["title"] = title
    if priority == 2:
        payload["retry"] = "30"
        payload["expire"] = "3600"
    try:
        data = urllib.parse.urlencode(payload).encode()
        req = urllib.request.Request(
            "https://api.pushover.net/1/messages.json",
            data=data,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception as exc:  # noqa: BLE001 — fire-and-forget
        log.warning("pushover_failed", error=str(exc))
        return False
