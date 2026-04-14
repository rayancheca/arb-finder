"""
Slack + Discord notifications for high-EV arbs.

After every cycle, the pipeline passes the newly inserted ArbOpp rows to
`notify_opportunities`. Any row with netReturnPct above the configured
threshold fires a webhook. Both transports are fire-and-forget — we
never block the cycle on them and we swallow errors into the log.
"""

from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass

from .logging_setup import get_logger

log = get_logger("notifications")

THRESHOLD = float(os.environ.get("ARB_NOTIFY_THRESHOLD", "0.05"))


@dataclass(frozen=True)
class NotifiableOpp:
    id: str
    net_return_pct: float
    guaranteed_profit: float
    book_a_name: str
    book_b_name: str
    event_label: str
    side_a_label: str
    side_b_label: str


def _format_slack_blocks(opp: NotifiableOpp) -> dict:
    return {
        "text": f"💰 Arb opportunity: {opp.event_label}",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"💰 {opp.event_label}",
                },
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Net return*\n`{opp.net_return_pct * 100:.2f}%`",
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Guaranteed profit*\n`${opp.guaranteed_profit:.2f}`",
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*{opp.book_a_name}*\n{opp.side_a_label}",
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*{opp.book_b_name}*\n{opp.side_b_label}",
                    },
                ],
            },
        ],
    }


def _format_discord(opp: NotifiableOpp) -> dict:
    return {
        "content": None,
        "embeds": [
            {
                "title": f"💰 {opp.event_label}",
                "description": (
                    f"**{opp.book_a_name}**: {opp.side_a_label}\n"
                    f"**{opp.book_b_name}**: {opp.side_b_label}"
                ),
                "color": 0x6ed69b,
                "fields": [
                    {
                        "name": "Net return",
                        "value": f"`{opp.net_return_pct * 100:.2f}%`",
                        "inline": True,
                    },
                    {
                        "name": "Guaranteed profit",
                        "value": f"`${opp.guaranteed_profit:.2f}`",
                        "inline": True,
                    },
                ],
            }
        ],
    }


def _post_json(url: str, payload: dict) -> None:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status >= 400:
                log.warning(
                    "webhook_non_ok",
                    url=url,
                    status=resp.status,
                )
    except Exception as exc:  # noqa: BLE001 — fire-and-forget
        log.warning("webhook_failed", url=url, error=str(exc))


def notify_opportunities(opps: list[NotifiableOpp]) -> None:
    """Non-blocking notification entry point."""
    if not opps:
        return
    slack_url = os.environ.get("SLACK_WEBHOOK_URL", "").strip()
    discord_url = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not slack_url and not discord_url:
        return

    count = 0
    for opp in opps:
        if opp.net_return_pct < THRESHOLD:
            continue
        count += 1
        if slack_url:
            _post_json(slack_url, _format_slack_blocks(opp))
        if discord_url:
            _post_json(discord_url, _format_discord(opp))

    if count:
        log.info("notifications_fired", count=count)
