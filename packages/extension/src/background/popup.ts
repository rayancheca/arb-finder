/**
 * Popup script — light UI for pairing + scraper status. Runs in the
 * extension popup frame, not on the page.
 */

const BOOKS = ["fanduel", "draftkings", "betmgm", "caesars", "betrivers"] as const;

async function refreshStatus(): Promise<void> {
  const tokenInput = document.getElementById("token") as HTMLInputElement | null;
  const saved = await chrome.storage.local.get("pairingToken");
  if (tokenInput && saved.pairingToken) tokenInput.value = saved.pairingToken;

  for (const book of BOOKS) {
    const dot = document.getElementById(`status-${book}`);
    if (!dot) continue;
    const key = `status:${book}`;
    const value = (await chrome.storage.session.get(key))[key];
    dot.classList.toggle("off", !value);
  }
}

document.getElementById("save")?.addEventListener("click", async () => {
  const tokenInput = document.getElementById("token") as HTMLInputElement | null;
  if (tokenInput) {
    await chrome.storage.local.set({ pairingToken: tokenInput.value.trim() });
    tokenInput.value = tokenInput.value.trim();
  }
});

refreshStatus();
