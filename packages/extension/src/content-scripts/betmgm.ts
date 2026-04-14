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
    const cell = await waitFor<HTMLElement>('ms-option-panel ms-option', 10_000);
    if (cell) {
      const allOptions = document.querySelectorAll<HTMLElement>('ms-option');
      const target = Array.from(allOptions).find((el) =>
        el.textContent?.toLowerCase().includes(intent.label!.toLowerCase()),
      );
      if (target) {
        target.click();
        notify(`Selected ${intent.label}`);
      } else {
        notify(`Couldn't find "${intent.label}"`, "warn");
      }
    }
  }

  if (intent.stake && intent.stake > 0) {
    const input = await waitFor<HTMLInputElement>(
      'input[type="text"][class*="stake"]',
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
