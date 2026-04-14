/**
 * arb-finder Chrome MV3 service worker.
 *
 * Responsibilities:
 *   1. Listen for messages from localhost/prod webapp requesting a bet slip fill
 *   2. Open the target book's event page in a new tab
 *   3. Ping the tab's content script with the outcome + stake
 *   4. Track pairing tokens in chrome.storage.session
 *
 * The web app sends a message like:
 *   { type: "fill-betslip", bookKey, eventSlug, marketId, selectionId, stake }
 * via chrome.runtime.sendMessage (requires externally_connectable in mv3,
 * or the user copies a link into the extension popup). For MVP we use the
 * simpler pattern: the web app opens a URL like
 *   arb-finder://fill?... — which the extension handles via a URL listener.
 * The cleanest cross-browser path is an HTTP POST to a local WebSocket
 * bridge, but Phase C ships the simpler variant.
 */

interface FillRequest {
  readonly type: "fill-betslip";
  readonly bookKey: string;
  readonly eventSlug?: string;
  readonly marketId?: string;
  readonly selectionId?: string;
  readonly label?: string;
  readonly stake?: number;
}

const BOOK_BASE_URL: Record<string, string> = {
  fanduel: "https://sportsbook.fanduel.com/",
  draftkings: "https://sportsbook.draftkings.com/",
  betmgm: "https://sports.ny.betmgm.com/",
  caesars: "https://sportsbook.caesars.com/us/ny/bet",
  betrivers: "https://ny.betrivers.com/",
};

chrome.runtime.onInstalled.addListener(() => {
  console.log("[arb-finder] extension installed");
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!isFillRequest(message)) {
      sendResponse({ ok: false, error: "Unknown message type" });
      return false;
    }
    handleFillRequest(message)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ ok: false, error: (err as Error).message }),
      );
    // Return true to keep the message channel open for async response.
    return true;
  },
);

function isFillRequest(msg: unknown): msg is FillRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "fill-betslip"
  );
}

async function handleFillRequest(
  req: FillRequest,
): Promise<{ ok: boolean; error?: string }> {
  const base = BOOK_BASE_URL[req.bookKey];
  if (!base) {
    return { ok: false, error: `unknown book: ${req.bookKey}` };
  }

  const url = req.eventSlug
    ? `${base}event/${encodeURIComponent(req.eventSlug)}`
    : base;

  const tab = await chrome.tabs.create({ url, active: true });
  if (!tab.id) return { ok: false, error: "tab creation failed" };

  // Stash the fill intent in session storage so the content script can read
  // it once the page hydrates.
  await chrome.storage.session.set({
    [`fill:${tab.id}`]: {
      marketId: req.marketId,
      selectionId: req.selectionId,
      label: req.label,
      stake: req.stake,
      createdAt: Date.now(),
    },
  });

  return { ok: true };
}
