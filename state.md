# state.md

## Status
SESSION 2 — PHASE A COMPLETE. Autonomous run through Phases B → H in progress.

## Project
arb-finder — cross-book sportsbook arbitrage + promo-boost finder

## Session count
2

## User directive for this session (verbatim)
1. Execute every remaining phase in full, high effort on everything
2. Constantly update state.md so a restart from mid-build continues exactly where I left off
3. Back-test every feature
4. Run localhost and let Rayan test before publishing
5. Publish to GitHub (every commit, every phase)
6. Publish to Vercel (+ Neon Postgres for web, Railway for Python worker)
7. New requirement (added mid-session): **Phase H** — make analytics fully polished, interactive, visual. Every card clickable with deeper info. Pirouette + expand-to-center animations. Multi-view modes (chart/table/graph). "I want to be able to play with this."

## Phase A — Real data layer ✅ COMPLETE
- Back-test: engine 52/52, web build green, all 6 routes 200, no runtime errors
- Day×Hour heatmap rewrite: header → flex (was broken `grid-cols-24`), bet counts, legend, empty-cell dimmed state, OKLCH color ramp
- Schema: BookEventRef, TeamAlias, ScrapeRun, EventMatchReview, Market.marketKey unique, Selection unique constraint
- Python worker fully installed (Python 3.14 venv, pytest 15/15)
- 30-team NBA canonical resolver with rapidfuzz ≥90 fuzzy fallback
- 5-step event matcher: BookEventRef fast path → canonical key → ±15 min fuzzy window → create-new → review queue
- Scrapers: DraftKings (curl_cffi stealth), FanDuel (httpx), BetMGM (env access id), Caesars (curl_cffi stealth), BetRivers (cageCode 212)
- Pipeline: asyncio.gather, per-book transactions, ScrapeRun rows for every outcome, arb recomputation after every cycle
- Arb recomputation: Python port of engine arb-standard.ts, pairs home×away + over×under across books, skips same-book pairs
- APScheduler 5-min cadence, circuit breaker with exponential backoff (cap 1h), breaker state persisted via ScrapeRun rows
- CLI: `doctor` / `cycle` / `run` subcommands, all green

**Live-run result:** FanDuel returns 8 real NBA events + 48 real selections, matched canonically. DraftKings and Caesars are geo-blocked (Akamai WAF, 403 even through curl_cffi Chrome impersonation — confirmed not fingerprint; the block is geo-IP). BetMGM needs BETMGM_ACCESS_ID env var. BetRivers now has correct NY cage code (212) but the leagueId for NBA needs discovery when Rayan runs from NY. **The worker is structurally correct; the non-FanDuel books just need Rayan's NY home network to return data.**

## Phase B — Boosts CRUD + auto-detect (NEXT)
Plan:
- Server Actions in `apps/web/app/boosts/actions.ts` for create/update/delete/toggle with Zod validation
- Full CRUD form with radix Dialog, typed to the Boost schema
- Playwright session-based promo auto-detect scaffold in `apps/worker/arb_worker/boosts/` — login state persisted to `profile.json`, parses promo pages per book
- Wire to boosts page with a "Detect from logged-in session" action

## Phase C — Place-trade + Chrome extension
Plan:
- Deep-link URL generators: FanDuel `sportsbook.fanduel.com/addToBetslip?marketId=...&selectionId=...`, DraftKings `sportsbook.draftkings.com/event/{slug}?outcomes=...`, MGM, Caesars, BetRivers patterns
- Full Chrome MV3 extension at `packages/extension/`:
  - `manifest.json` MV3 with host_permissions for each book domain
  - `background.ts` service worker with pairing token
  - `content-scripts/` one per book: `fanduel.ts`, `draftkings.ts`, `betmgm.ts`, `caesars.ts`, `betrivers.ts`
  - Bet-slip autofill DOM selectors with retry, fallback to clipboard stake copy
  - Settings UI in web app to generate pairing token + install extension

## Phase D — Real history import + analytics upgrade
Plan:
- `apps/web/lib/excel-import.ts` using `exceljs` — parses sportbook calculator workbook (profit tracker / daily tracker / bet365 trade sheets)
- `/api/import-history` route with Server Action, streams progress
- Auto-log: `Bet.result = pending` when place-trade fired → `placed` when extension confirms → `settled` on schedule from worker
- EvLeakChart with real EV-at-placement vs realized
- Slippage report: actual odds - available odds delta per book per market, aggregated
- Per-book learned cash conversion rates (replacing hardcoded 0.65 in the engine no-sweat path)

## Phase E — Deploy
Plan:
- `vercel.json` for web (build cmd, output dir, env schema)
- `db/schema.prisma` datasource switches between SQLite/Postgres via `DATABASE_URL`
- `db/migrations/` for production — generate from current schema with `prisma migrate dev --name init`
- Python worker: `apps/worker/Dockerfile` + `railway.json`
- `.env.example` with every required key
- Deploy scripts in `scripts/deploy.sh`
- Can't actually hit Vercel/Railway without Rayan's auth — config is production-ready, final step is `vercel link` + `vercel deploy` when he says

## Phase F — Playwright scrapers (flaky)
Plan:
- `apps/worker/arb_worker/scrapers/playwright_base.py` — persistent context, stealth plugin equivalent, mouse simulation helper
- `bet365.py`, `fanatics.py`, `espnbet.py` — `enabled=False` in BOOKS until Rayan opts in
- Documented flakiness in state.md + README

## Phase G — Quality of life
Plan:
- Slack/Discord webhook alerts on `netReturnPct > 0.05` via worker `notifications.py`
- Mobile view — reflow sidebar to bottom nav at <768px
- ⌘K command palette — `cmdk` package, searchable across routes + opportunities
- j/k/enter keyboard navigation on dashboard rows
- `/settings` route with scraper health, refresh cadence, slippage buffer, Kelly defaults, DB reset button
- Dark/light theme toggle — CSS vars already token-driven, swap on `:root.light`

## Phase H — Analytics interactive polish (Rayan's new ask)
Plan:
- Install `framer-motion`
- Wrap every analytics card in a `<InteractiveCard>` — captures click, triggers `layoutId` transition to a fullscreen modal via `AnimatePresence`
- Pirouette: `rotate: [0, 360]` 500ms on entry, scale from card origin to 80vw
- Modal has a tab bar: Chart / Table / Graph / Raw Data / Breakdown views
- Drill-downs:
  - KPI cards → trend over time + breakdown table
  - Bankroll curve → per-book split + drawdown analysis
  - Profit by book → sortable table + ROI sparklines
  - Profit by boost → comparative grouped chart
  - Bet size histogram → detail with sliding buckets + table
  - Day/hour heatmap → per-cell bet drilldown
- Esc closes, click outside closes, animated back to grid

## Back-test protocol (after every phase)
1. `pnpm --filter @arb/engine test` — 52/52 green
2. `cd apps/worker && .venv/bin/pytest` — 15+ green
3. `pnpm --filter web build` — exit 0
4. `pnpm --filter web exec tsc --noEmit` — exit 0
5. Start `pnpm --filter web dev`, fetch every route, assert 200
6. Commit + push

## Decisions log
- Python 3.14 works for core worker; `curl_cffi` installs cleanly; `playwright` only pulled in for Phase F via `[stealth]` extra
- Stealth = curl_cffi TLS impersonation. Does NOT bypass geo-IP; DK/CZR both geo-block non-NY IPs even with Chrome fingerprint
- BetRivers NY cageCode = 212 (rotates, see comment in `betrivers.py`)
- Canonical NBA dictionary has 30 teams + abbreviations + aliases, plus rapidfuzz ≥90 fuzzy fallback
- Arb math ported to Python (pipeline/recompute_arbs.py) to avoid forking Node per cycle
- Schema owned by Prisma; worker writes via raw parameterized SQL through `sqlite3` stdlib
- `framer-motion` chosen over `motion.dev` for Phase H — more mature React-first API, `layoutId` is the killer feature

## Resume path (if credits run out mid-build)
1. `cd /Users/rayankarimcheca/Desktop/ClaudeProjects/projects/arb-finder`
2. Read this file. Find the last completed phase.
3. `git log --oneline -10` — last commit tells you where to pick up
4. Resume with the plan section for the next phase
5. After each phase: update this file, commit, push
6. Final step is the Phase H localhost smoke test + Vercel deploy (Rayan must be awake for Vercel auth)

## Rayan's feedback this session
- "split into smaller tasks" (first directive)
- "pause this session, resume shortly" (after Phase A scaffold committed)
- "continue where you left off. i want you to complete the entire project … always backtest … publish to github … publish to vercel … run localhost and i will test all features we will debug but make sure its all on github"
- "make the analytics section much more polished and interactive and visual … every card clickable with deeper info when clicked and cool animations … pirouette then expand to center … view as chart/table/graph … i will leave this running in the background whilst i sleep"

## Blockers
- DK/CZR geo-blocked from current network — **not a code bug**, will work when Rayan runs from NY
- BetMGM needs BETMGM_ACCESS_ID (documented in `apps/worker/README.md`)
- Vercel + Neon + Railway deploy needs Rayan's auth tokens — config will be ready, final `vercel login && vercel deploy` waits for him
