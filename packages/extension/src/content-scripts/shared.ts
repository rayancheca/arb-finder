/**
 * Shared helpers for every content script:
 *  - pullFillIntent(): reads the pending fill-intent from session storage
 *  - waitFor(selector, timeout): polls the DOM for a selector
 *  - copyStakeToClipboard(stake): fallback when the book's slip rejects us
 *  - notify(message): toast overlay injected into the page
 */

export interface FillIntent {
  readonly marketId?: string;
  readonly selectionId?: string;
  readonly label?: string;
  readonly stake?: number;
}

export async function pullFillIntent(): Promise<FillIntent | null> {
  const tabIdFromHash = new URL(location.href).searchParams.get("arbTab");
  const sessionKey = tabIdFromHash ? `fill:${tabIdFromHash}` : null;
  if (!sessionKey) {
    // Fall back: service worker stored it keyed by tab id, which the content
    // script can't know. We try to read any fill:* entry created in the last
    // 30s (one-intent-at-a-time assumption).
    const all = await chrome.storage.session.get(null);
    const entries = Object.entries(all).filter(([k]) => k.startsWith("fill:"));
    entries.sort(
      (a, b) =>
        ((b[1] as { createdAt?: number })?.createdAt ?? 0) -
        ((a[1] as { createdAt?: number })?.createdAt ?? 0),
    );
    const fresh = entries.find(
      ([, v]) =>
        Date.now() - ((v as { createdAt?: number })?.createdAt ?? 0) < 30_000,
    );
    if (!fresh) return null;
    return (fresh[1] as FillIntent) ?? null;
  }
  const value = (await chrome.storage.session.get(sessionKey))[sessionKey];
  return (value as FillIntent) ?? null;
}

export function waitFor<T extends Element>(
  selector: string,
  timeoutMs = 10_000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<T>(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

export async function copyStakeToClipboard(stake: number): Promise<void> {
  try {
    await navigator.clipboard.writeText(stake.toFixed(2));
  } catch {
    // Clipboard API blocked — fall back to execCommand
    const ta = document.createElement("textarea");
    ta.value = stake.toFixed(2);
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function notify(message: string, tone: "ok" | "warn" | "err" = "ok"): void {
  const toast = document.createElement("div");
  toast.textContent = `arb-finder · ${message}`;
  toast.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    padding: 12px 16px;
    background: ${tone === "err" ? "#b91c1c" : tone === "warn" ? "#b45309" : "#0f172a"};
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
    z-index: 2147483647;
    opacity: 0;
    transform: translateY(-8px);
    transition: opacity 180ms, transform 180ms;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    window.setTimeout(() => toast.remove(), 200);
  }, 3500);
}
