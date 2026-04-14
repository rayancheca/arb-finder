import {
  copyStakeToClipboard,
  notify,
  pullFillIntent,
  waitFor,
} from "./shared";

(async function main() {
  const intent = await pullFillIntent();
  if (!intent) return;

  if (intent.label) {
    await waitFor<HTMLElement>('.sb-event-market', 10_000);
    const allOdds = document.querySelectorAll<HTMLElement>(
      '.sb-outcome, [class*="outcome-button"]',
    );
    const target = Array.from(allOdds).find((el) =>
      el.textContent?.toLowerCase().includes(intent.label!.toLowerCase()),
    );
    if (target) {
      target.click();
      notify(`Selected ${intent.label}`);
    } else {
      notify(`Couldn't find "${intent.label}"`, "warn");
    }
  }

  if (intent.stake && intent.stake > 0) {
    const input = await waitFor<HTMLInputElement>(
      '.betslip-stake-input, input[placeholder*="stake" i]',
      8000,
    );
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, intent.stake.toFixed(2));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      notify(`Stake pre-filled · $${intent.stake.toFixed(2)}`);
    } else {
      await copyStakeToClipboard(intent.stake);
      notify("Stake copied to clipboard", "warn");
    }
  }
})();
