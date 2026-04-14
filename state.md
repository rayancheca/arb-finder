# state.md

## Status
PAUSED mid-debug. All services killed. Project is in a clean state with
real FanDuel data + seeded demo data both present in the SQLite DB.
Ready to resume testing the moment the user reboots Claude in this folder.

## Session count
2 (ongoing)

## ⭐ RESUME GREETING — SAY THIS FIRST NEXT SESSION ⭐

When the user returns to this folder, start your response with a short
status summary AND the exact question you last asked them, verbatim:

> **Welcome back. Last session I got live FanDuel data flowing to localhost,
> then you asked me to kill everything and save state. The dev server and
> Python worker are both stopped. The DB still has 20 events (12 seeded +
> 8 real NBA games from FanDuel) and 5 seeded demo arbs.
>
> The last thing I asked you before you paused was:
>
> 1. Does real FanDuel data show up in /search for real NBA teams?
> 2. Does the dashboard still show 5 arbs?
> 3. Any new console errors?
>
> Also pending from the session before: **your hydration error, the
> analytics modal positioning bug, and the Dialog.Title accessibility
> warnings** — I fixed all three in round 3 (commit 060a15f) but you
> hadn't hard-refreshed yet to verify.
>
> Want me to bring the dev server + worker back up so you can test?
> Or should we tackle something else first?**

After the user answers, pick up from whichever branch they point you at.

## What was running (now stopped)
- Next.js dev server (pid was 556) — stopped
- Python arb_worker scheduler (pid was 462) — stopped
- Background cycle was polling FanDuel every 5 min; last successful
  tick wrote 48 real selections for 8 NBA games

## Git state
- Branch: `main`
- Last commit: `8798d4c` — fix(worker): scheduler event loop + preserve
  seed arbs on recompute
- Fully pushed to `github.com/rayancheca/arb-finder`
- Working tree clean

## Database state (SQLite at db/dev.db)
- 8 books
- 20 events = 12 seeded + 8 REAL FanDuel NBA games
- 264 selections = 216 seeded + 84 real FanDuel odds
- 5 seeded demo arbs (hand-crafted in db/seed.ts, preserved by the
  selective-delete fix in recompute_arbs.py)
- 120 seeded historical bets (for analytics charts)
- Real NBA events currently in the DB (pulled from FanDuel's live API):
  - Charlotte Hornets vs Miami Heat
  - Cleveland Cavaliers vs Toronto Raptors
  - Phoenix Suns vs Portland Trail Blazers
  - LA Clippers vs Golden State Warriors
  - New York Knicks vs Atlanta Hawks
  - Los Angeles Lakers vs Houston Rockets
  - Philadelphia 76ers vs Orlando Magic
  - Denver Nuggets vs Minnesota Timberwolves

## To bring it back up (single command each)
```bash
# Dev server
pnpm --filter web dev

# Python worker (continuously polls FanDuel every 5 min)
cd apps/worker && source .venv/bin/activate && python -m arb_worker run

# One-shot FanDuel refresh (no scheduler)
cd apps/worker && .venv/bin/python -m arb_worker cycle
```

## Known-unresolved issues (user reported, not yet confirmed fixed)
1. **Hydration error** — "data-theme='dark'" mismatch on `<html>`. Fixed in
   commit 060a15f via `suppressHydrationWarning` on the html element + the
   InteractiveCard rewrite. User hasn't hard-refreshed to verify.
2. **Analytics modal opening in bottom-right corner instead of center** —
   Fixed in commit 060a15f by scrapping framer-motion layoutId entirely on
   the modal and using a `fixed inset-0 flex items-center justify-center`
   centering container with a scale-in + pirouette animation. User hasn't
   verified after the round-3 push.
3. **DialogContent requires DialogTitle** (x4 console errors) — Fixed in
   commit 060a15f by replacing the raw motion.h2 with proper
   `<Dialog.Title>` in InteractiveCard. Not yet verified.

## What's on deploy / new-work pipeline
- Vercel + Neon Postgres + Railway deploy waits for user's browser
  OAuth CLI login (documented in DEPLOY.md, config in vercel.json,
  apps/worker/railway.json, db/schema.postgres.prisma)
- **Rotate the Neon password FIRST** — user pasted it in plain text
  last session; new one shouldn't go into any committed file

## Known scraper limits (tested, not bugs)
- **FanDuel**: works perfectly from this machine. Real data flowing.
- **DraftKings** + **Caesars**: geo-block non-NY IPs with HTTP 403 even
  through curl_cffi Chrome TLS impersonation. Will work from user's
  home network in NY.
- **BetMGM**: needs `BETMGM_ACCESS_ID` env var from devtools on
  sports.ny.betmgm.com
- **BetRivers**: returns 200 but 0 events — leagueId=1149 isn't NBA on
  their current schema. Needs a quick fix pass to find the right value.
- **bet365 / Fanatics / ESPN BET**: Phase F Playwright scrapers exist
  but `enabled=False` by default. Opt-in via
  `python -m arb_worker login <book>` once user has logged in manually.

## Immediate next actions (in priority order)
1. Start dev server + worker, user hard-refreshes and confirms fixes
2. If hydration error / analytics modal / DialogTitle still broken →
   another round of fixes
3. Once all three confirmed fixed, user decides: test more locally or
   push to Vercel now?
4. Fix BetRivers leagueId (quick win, gives us a second live book)
5. Walk user through Vercel/Railway deploy

## Commit log (full session 2)
```
8798d4c fix(worker): scheduler event loop + preserve seed arbs on recompute
060a15f fix(analytics): modal positioning + Dialog.Title + demo-data controls
1da9a4d fix(ui): hydration error + analytics card width + search best-bet
7a43740 fix(ui): kill Import, fix TopBar + Search + Analytics layout
6a575f0 docs(state): full session 2 summary — all phases A-H complete
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

## Rayan's directives (verbatim, for tone calibration)
- "continue where you left off. i want you to complete the entire project"
- "run multiple agents to debug and test i then ask me quesitons"
- "search feature is not clickable idk why theres an improt tab we dont
  need that the analytics tab is broken all squares all all oer the
  plave and diffferent sizes. sitre is throung a bunch of errors"
- "its totally broken now" (after stale cache issue — resolved with
  dev-server restart)
- "can you get the live data flowing right now so i can test on localhost"
- "close the dev. kill the server. i will come bac to this projects later.
  for now remember your state and the last thing you ask me, next time
  i boot up claude in this folder i wqant you to tell me the last thing
  you said and well continue where we left off"

## Back-test snapshot (last confirmed green)
- `pnpm --filter @arb/engine test` — 52/52 passed
- `cd apps/worker && .venv/bin/pytest` — 15/15 passed
- `pnpm --filter web build` — exit 0
- `pnpm --filter web exec tsc --noEmit` — exit 0
- Live routes tested: /, /analytics, /search?q=Lakers, /settings,
  /boosts, /bankroll, /api/health — all 200

## Blockers (external, require user action)
- DK/CZR geo block — needs NY residential IP
- BetMGM access ID — needs user devtools copy
- Neon password rotation — user pasted in chat, must rotate
- Vercel/Railway login — interactive OAuth, can't do remotely

## File structure reminder
```
arb-finder/
├── apps/
│   ├── web/                 Next 15 App Router
│   └── worker/              Python 3.14 scrapers + scheduler
├── packages/
│   ├── engine/              TS arb math, 52/52 tests
│   └── extension/           Chrome MV3 bet-slip autofill
├── db/
│   ├── schema.prisma        SQLite (dev)
│   ├── schema.postgres.prisma Neon (prod)
│   ├── seed.ts              8 books, 12 events, 5 arbs, 120 bets
│   └── dev.db               live SQLite
├── vercel.json              deploy config
├── DEPLOY.md                step-by-step Vercel/Neon/Railway walkthrough
├── CLAUDE.md                project spec
├── state.md                 THIS FILE — always update before pausing
└── README.md
```
