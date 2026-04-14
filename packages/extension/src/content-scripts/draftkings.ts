import {
  copyStakeToClipboard,
  notify,
  pullFillIntent,
  waitFor,
} from "./shared";

(async function main() {
  const intent = await pullFillIntent();
  if (!intent) return;

  // DraftKings doesn't expose a URL-level addToBetslip, so we click the
  // outcome matching the label and then fill the stake field. Outcome
  // cells are <span class="sportsbook-odds"> inside a <div class="table-row"
  // data-tracking-selector="MARKET_ROW_*">.
  if (intent.label) {
    const row = await waitFor<HTMLElement>(
      `[class*="game-info"] [class*="sportsbook-outcome-cell"]`,
      10_000,
    );
    if (row) {
      const allOutcomes = document.querySelectorAll<HTMLElement>(
        '[class*="sportsbook-outcome-cell"]',
      );
      const target = Array.from(allOutcomes).find((el) =>
        el.textContent?.toLowerCase().includes(intent.label!.toLowerCase()),
      );
      if (target) {
        target.click();
        notify(`Selected ${intent.label}`);
      } else {
        notify(`Couldn't find outcome "${intent.label}"`, "warn");
      }
    }
  }

  if (intent.stake && intent.stake > 0) {
    const stakeInput = await waitFor<HTMLInputElement>(
      '[class*="wager-amount"] input[type="text"], [class*="stake-input"] input',
      8000,
    );
    if (stakeInput) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(stakeInput, intent.stake.toFixed(2));
      stakeInput.dispatchEvent(new Event("input", { bubbles: true }));
      notify(`Stake pre-filled · $${intent.stake.toFixed(2)}`);
    } else {
      await copyStakeToClipboard(intent.stake);
      notify("Stake copied to clipboard", "warn");
    }
  }
})();
