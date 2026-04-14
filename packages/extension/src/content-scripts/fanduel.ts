import {
  copyStakeToClipboard,
  notify,
  pullFillIntent,
  waitFor,
} from "./shared";

(async function main() {
  const intent = await pullFillIntent();
  if (!intent) return;

  if (intent.selectionId) {
    // FanDuel usually honors addToBetslip via URL, so by the time the
    // content script runs the bet slip should already have the selection.
    const slipButton = await waitFor<HTMLElement>(
      '[data-testid="betslip-bet-count"]',
    );
    if (slipButton) {
      notify("Bet slip opened — confirm stake and place");
    }
  }

  if (intent.stake && intent.stake > 0) {
    const stakeInput = await waitFor<HTMLInputElement>(
      '[data-testid="betslip-single-stake-input"]',
      8000,
    );
    if (stakeInput) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(stakeInput, intent.stake.toFixed(2));
      stakeInput.dispatchEvent(new Event("input", { bubbles: true }));
      notify(`Stake pre-filled · $${intent.stake.toFixed(2)}`);
    } else {
      await copyStakeToClipboard(intent.stake);
      notify(
        `Couldn't find stake field — stake copied to clipboard`,
        "warn",
      );
    }
  }
})();
