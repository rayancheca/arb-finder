# state.md

## Status
ALL PHASES A–H COMPLETE. Ready for localhost testing + Vercel/Railway deploy.
Dev server is currently running at http://localhost:3000 and every route renders 200.

## Project
arb-finder — cross-book sportsbook arbitrage + promo-boost finder

## Session count
2

## What shipped this session (A → H)

### Phase A — Real data layer (live)
- Python 3.14 worker installed, pytest 15/15 green
- 30-team NBA canonical resolver + rapidfuzz fuzzy fallback
- 5-step event matcher: BookEventRef → canonical key → ±15 min window → create → review queue
- 5 HTTP scrapers: DraftKings (curl_cffi stealth), FanDuel (httpx), BetMGM (env access id), Caesars (curl_cffi stealth), BetRivers (cageCode 212, ny.betrivers.com)
- Pipeline: asyncio.gather, per-book transactions, ScrapeRun rows, arb recomputation every cycle
- Python port of engine arb-standard math (pairs home×away + over×under across books)
- APScheduler 5-min cadence, circuit breaker with exponential backoff (cap 1h)
- CLI: `doctor` / `cycle` / `run` subcommands, all green
- **Live-verified**: FanDuel returns 8 real NBA events + 48 selections, matched canonically
- **Known geo-block**: DK, Caesars 403 from non-NY IPs even through TLS spoofing — will work from Rayan's NY home network

### Phase B — Boosts CRUD + auto-detect
- Server Actions (create/update/toggle/delete) with Zod validation
- Radix Dialog form with field-level errors, useTransition loading state
- Boosts page: real CRUD, empty state, disabled-dim, live expiry countdown
- Worker: `arb_worker.boosts.auto_detect` Playwright persistent-context framework
- CLI: `detect-boosts <book>` and `login <book>` subcommands

### Phase C — Deep links + Chrome MV3 extension
- `lib/deep-links.ts` — per-book URL builders (FanDuel URL-level, others extension-assisted)
- `packages/extension/` — full MV3 extension (builds via esbuild to `dist/`)
- Service worker handles fill-betslip messages, opens target book, stashes intent
- Per-book content scripts (FD, DK, MGM, CZR, BR) — select outcome by label, fill stake input
- Popup UI with status dots + pairing token input
- `pnpm --filter @arb/extension run build` produces the unpacked extension

### Phase D — Real history import + analytics upgrade
- `lib/excel-import.ts` — fuzzy column detector parses profit tracker and bet365 trade sheets
- `/import` route with drag-drop upload, shows imported/skipped/warnings/sheets-seen
- `lib/analytics-derivations.ts` — computeEvLeak, computeSlippageByBook, computeLearnedCashRates (replaces 0.65 default once ≥10 settled boosted bets on a book)
- Analytics gains EV-leak LineChart (theoretical vs realized) + per-book slippage bars

### Phase E — Deploy config
- `db/schema.postgres.prisma` — prod Neon mirror of SQLite schema
- `apps/web/package.json` — `build:prod`, `prisma:*:prod`, `seed:prod` scripts
- `vercel.json` — `pnpm --filter web run build:prod`, iad1 region
- `apps/web/app/api/health/route.ts` — `SELECT 1` + book count, returns 503 on DB error
- `apps/worker/Dockerfile` — python:3.12-slim, optional Chromium via INSTALL_CHROMIUM arg
- `apps/worker/railway.json` — DOCKERFILE builder, ON_FAILURE restart
- `.env.example` — every required key documented
- `DEPLOY.md` — complete walkthrough: Neon schema push → vercel login/env/deploy → railway init/up/variables → smoke-test curls → rollback

### Phase F — bet365 / Fanatics / ESPN BET (Playwright)
- `playwright_base.py` — persistent-context session opener, human_mouse_move, human_scroll, add_init_script stealth patches
- Three scrapers: bet365 (shadow DOM walker), Fanatics (__NEXT_DATA__ extractor), ESPN BET (DOM count)
- Lazy playwright import so installs without [stealth] don't crash
- Registered in SCRAPER_REGISTRY but `enabled=False` by default — Rayan flips them on after `arb-worker login <book>`

### Phase G — Quality of life
- ⌘K/Ctrl+K `CommandPalette` (cmdk) — routes list with icons, esc to close
- `ThemeToggle` — dark/light with icon morph; inline init script in layout.tsx prevents flash
- Full light-theme OKLCH token override in globals.css
- `MobileNav` — fixed bottom bar at <md, 5 primary routes
- Sidebar hidden on mobile (`hidden md:flex`)
- `/settings` page — ScrapeRun-backed scraper health, risk defaults form (slippage, Kelly, min net return, webhook URLs), reset button, theme toggle card
- `DashboardKeyboardNav` — j/k/enter across `[data-arb-row]`, ignores input focus, scrolls into view
- Worker: `notifications.py` — Slack Block Kit + Discord embed formatters, ARB_NOTIFY_THRESHOLD (default 5%), fire-and-forget urllib POST with 5s timeout

### Phase H — Analytics interactive polish (Rayan's ask)
- `InteractiveCard` — radix Dialog wrapping a preview tile that morphs via framer-motion `layoutId` into a centered modal. Pirouette rotate [0, 2, -2, 0] with spring physics. Shared layoutIds on card, title, and preview for continuous morph.
- `DrilldownTabs` — radix Tabs with icon triggers, per-tab framer-motion mount-in fade
- `DataGrid` — generic sortable table used by every drill-down's Table tab
- `charts.tsx` — extracted chart subcomponents (BankrollCurve, ProfitByBook, Histogram, EvLeak, DayHourHeatmap) so the same chart renders in preview and full modal
- **Every one** of the 7 analytics sections now has Chart + Table + Raw tabs in an animated modal

## Back-test status (final)
- `pnpm --filter @arb/engine test` — **52/52 green**
- `cd apps/worker && .venv/bin/pytest` — **15/15 green**
- `pnpm --filter web build` — **exit 0**
- `pnpm --filter web exec tsc --noEmit` — **exit 0**
- Live routes: /, /search, /boosts, /bankroll, /analytics, /import, /settings, /opp/arb_2, /api/health — **all 200**
- Dev server running at http://localhost:3000 (pid tracked in /tmp/arb_dev.log)
- Chrome extension builds clean via `pnpm --filter @arb/extension run build`

## What Rayan still needs to do
1. **Rotate the Neon password** (you pasted it in chat in plain text)
2. Put the rotated DATABASE_URL in `apps/web/.env` locally
3. `vercel login && vercel link && vercel env add DATABASE_URL production && vercel --prod`
4. `railway login && cd apps/worker && railway init && railway up && railway variables set DATABASE_URL=... BETMGM_ACCESS_ID=...`
5. Load `packages/extension/dist/` in chrome://extensions as an unpacked extension
6. Click into every analytics card, confirm the expand animation + tab views behave as expected

## Decisions log
- **Python arb math port** over forked Node subprocess — 5-min cadence × hundreds of markets makes cold-start latency too expensive
- **Two Prisma schemas** (`schema.prisma` + `schema.postgres.prisma`) — lockstep, but avoids Prisma's runtime provider lock
- **curl_cffi stealth path** for DK/CZR — beats Akamai TLS fingerprinting but still requires NY IP
- **framer-motion layoutId** over cross-fade for card-to-modal — the continuous morph is why it feels alive
- **DataGrid is generic** — not constrained to `Record<string, unknown>` so it works with any row type without casting
- **Phase F Playwright scrapers enabled=False** — they'll take out the whole cycle if Chromium isn't installed; opt-in only

## Rayan's asks (verbatim this session)
1. "continue where you left off. i want you to complete the entire project … always backtest … publish to github … publish to vercel … run localhost and i will test all features we will debug"
2. "make the analytics section much more polished and interactive and visual … every card clickable with deeper info when clicked and cool animations … pirouette then expand to center … view as chart/table/graph"
3. (on accounts) "i have made neon and railway accounts i already have a vercel account … also do you need my credentials for vercel neon and railway"
4. "i will leave this running in the background whilst i sleep"

## Commit log (this session)
```
a37b0d7 chore: gitignore SQLite WAL + SHM files
258e294 feat(analytics): Phase H — interactive drill-down cards
9274a58 feat(qol): Phase G — command palette, settings, theme, mobile, alerts
a28f21e feat(worker): Phase F — Playwright scrapers for bet365 / Fanatics / ESPN BET
8934730 feat(deploy): Phase E — Vercel + Neon + Railway deploy config
77634e4 feat(analytics): Phase D — history import, EV-leak chart, slippage report
0de8d9d feat(place-trade): Phase C — deep links + Chrome MV3 extension
d61a5fb feat(boosts): Phase B — real CRUD + Playwright auto-detect
d6968ed feat(worker): Phase A complete — live scraping wired end-to-end
b76f7f8 feat(worker+analytics): scaffold Phase A data layer + fix day/hour heatmap
0583335 feat: ship session 1 mockup — full UI, engine, seed data
```

## Resume instructions (if credits run out before deploy)
1. `cd /Users/rayankarimcheca/Desktop/ClaudeProjects/projects/arb-finder`
2. Dev server likely still running; if not: `pnpm --filter web dev`
3. Git is fully pushed through Phase H at `a37b0d7`
4. Read this file + DEPLOY.md
5. The only remaining step is `vercel --prod` + `railway up`, which requires Rayan's browser OAuth

## Blockers
- Vercel + Railway deploys need Rayan's browser-OAuth CLI login (interactive, can't do from here)
- Neon password **must be rotated** before the new one is used anywhere
- DK/CZR/BetRivers live scraping still geo-blocked from current network — works when Rayan runs worker from NY home
