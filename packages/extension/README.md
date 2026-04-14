# arb-finder extension

Chrome MV3 extension that pre-fills sportsbook bet slips when you place a
trade from arb-finder. For books with a URL-level `addToBetslip` schema
(FanDuel) the extension just confirms the slip and fills the stake. For
everything else it opens the event page, clicks the outcome by label, and
fills the stake. When the DOM doesn't match, stake falls back to the
clipboard and a toast tells you.

## Build + install

```bash
pnpm --filter @arb/extension run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Pick `packages/extension/dist/`

The extension's popup shows one status dot per book — green when the
content script has observed the book's page recently.

## Pairing

Open the popup, paste the pairing token from arb-finder's Settings page,
save. The token lets the web app send fill-intents to the extension via
`chrome.runtime.sendMessage`.

## Development

`pnpm --filter @arb/extension run build` is instantaneous — esbuild bundles
every content script + service worker + popup in one shot. There is no
watch mode; re-run it after changes and hit the refresh icon in
`chrome://extensions`.
