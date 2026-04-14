# state.md

## Status
SESSION 2 PAUSED MID-PHASE-A — worker scaffolded, scrapers written, pipeline + matcher + arb recomputation in place. Not yet installed in a venv; doctor + pytest + live cycle not yet run. Resume by installing the worker and running `python -m arb_worker doctor`, then `pytest`, then `python -m arb_worker cycle`.

## Project
arb-finder — cross-book sportsbook arbitrage + promo-boost finder

## Session count
2

## Session 2 plan
Scoped to Phase A only (real data layer) + fix the day/hour heatmap + back-test every existing feature.

## Completed this session
- **Back-test** — full engine test suite (52/52 green), `pnpm --filter web build` green, dev server started, smoke-tested all 6 routes (`/`, `/search`, `/boosts`, `/bankroll`, `/analytics`, `/opp/[id]`) — every route returns 200 with no runtime errors. Killed the server cleanly.
- **Heatmap fix** — rewrote `apps/web/components/analytics/AnalyticsClient.tsx` day×hour block. Original bug: header used `grid grid-cols-24` (Tailwind doesn't define 24 cols), so hour labels drifted from body cells. Rewrote header to use flex at 20px cell width to match body exactly. Added per-cell count tracking, clearer tooltips (`Sat 19:00 — +$128.50 · 3 bets`), empty-cell dimmed state with border, OKLCH color ramp matching the palette, and a colorbar legend at the bottom. Typecheck clean.
- **Schema extensions** — added `BookEventRef`, `TeamAlias`, `ScrapeRun`, `EventMatchReview` models; added `marketKey` to `Market` with `@@unique([eventId, marketKey])`; added `@@unique([marketId, bookId, side])` to `Selection` so the worker can upsert. Reset + re-pushed SQLite, re-seeded successfully (8 books, 12 events, 120 historical bets).
- **Python worker scaffold** (`apps/worker/`):
  - `pyproject.toml` with httpx, curl_cffi, playwright, apscheduler, tenacity, structlog, rapidfuzz, pytest
  - `arb_worker/config.py` — repo-root .env loader, book registry, circuit-breaker tunables
  - `arb_worker/db.py` — sqlite3 connection, transaction ctx, raw parameterized upserts for Event / BookEventRef / Market / Selection / ScrapeRun / EventMatchReview, plus `ensure_nba_sport`
  - `arb_worker/logging_setup.py` — structlog JSON in prod, ConsoleRenderer in TTY
  - `arb_worker/matcher/canonical.py` — full NBA alias dictionary (30 teams), `normalize`, `resolve_team` with exact → alias → rapidfuzz ≥90 fallback, `build_canonical_key`, `resolve` returning a typed `Resolution`
  - `arb_worker/matcher/event_matcher.py` — 5-step match: BookEventRef fast path → canonical key → ±15 min fuzzy time window → create-new → review queue on failure
  - `arb_worker/scrapers/base.py` — `SportsbookScraper` ABC with tenacity retry, `get_json` helper, `ScraperError` carrying http_status
  - `arb_worker/scrapers/draftkings.py` — eventgroups 42648 endpoint, parses moneyline/spread/total
  - `arb_worker/scrapers/fanduel.py` — content-managed-page custom NBA page, attachments.events + attachments.markets crosswalk
  - `arb_worker/scrapers/betmgm.py` — cds-api/bettingoffer/fixtures, reads BETMGM_ACCESS_ID from env, hard-fails clean when missing
  - `arb_worker/scrapers/caesars.py` — api.americanwagering.com v3 events/schedule
  - `arb_worker/scrapers/betrivers.py` — nj.betrivers.com listview/events leagueId 1149
  - `arb_worker/pipeline/run_cycle.py` — asyncio.gather over all enabled scrapers, per-book transaction, ScrapeRun rows for every outcome, arb recomputation always runs
  - `arb_worker/pipeline/recompute_arbs.py` — Python port of packages/engine arb-standard math, pairs home×away and over×under across books, skips same-book pairs, inserts into ArbOpp
  - `arb_worker/scheduler.py` — APScheduler AsyncIOScheduler on 5-min cadence, `_cooldown_seconds` exponential backoff (cap 1h), `should_skip` breaker check against recent ScrapeRun rows
  - `arb_worker/cli.py` + `__main__.py` — `cycle` / `run` / `doctor` subcommands
  - `tests/test_canonical.py` — normalize, resolve_team (exact + alias + fuzzy), canonical key order-independence, resolve round trip, failure reason
  - `tests/test_arb_math.py` — American↔decimal, implied probability, no-arb detection, positive net return, stake equalization, symmetry
  - `tests/test_cycle_smoke.py` — raw-SQLite fixture exercising `recompute_arb_opps` on a two-book moneyline, asserts 1 arb found + same-book pairs ignored
  - `README.md` — architecture, running, env, circuit breaker doc
  - `.gitignore` — venv, pycache, .env

## In progress
Phase A1 task still marked in_progress because I haven't yet verified the worker installs + runs. On resume, start here.

## Next steps (resume here)
1. **Install & smoke-test the worker** (system Python is 3.14; the venv needs 3.12 or 3.13. Try `brew install python@3.12` first, or use 3.13 if it's close enough — update pyproject `requires-python` if needed):
   ```bash
   cd apps/worker
   python3.12 -m venv .venv && source .venv/bin/activate
   pip install -e ".[dev]"
   python -m arb_worker doctor        # verifies DB + scrapers wire up
   pytest                              # should be 100% green before touching anything live
   python -m arb_worker cycle         # ONE real cycle against live books
   ```
2. If a live book's JSON shape has drifted, adjust the matching scraper only. Don't rewrite — read the raw response, note the drift in the scraper file, fix it narrowly.
3. Confirm the Next.js app now shows live selections: `pnpm --filter web dev`, open `/`, watch ArbOpp rows update.
4. Mark task #3 (scaffold) and #8 (scheduler) completed.
5. **Commit Phase A** — one fat commit covering schema + worker + heatmap + backtest. Push.
6. Pause for Rayan's go-ahead before moving to Phase B (boosts CRUD + Playwright auto-detect).

## Decisions log (additions)
- **Schema owned by Prisma, worker writes via raw SQL** — avoids a second ORM and keeps migrations single-sourced
- **Arb math ported to Python rather than shelled out to TS** — forking Node per cycle would dominate latency at the 5-min cadence × hundreds of markets; parity is pinned by test_arb_math.py mirroring arb-standard.test.ts
- **Boost arb computation stays in TS (client-side)** — it only matters for the detail page's slider, which is interactive; the worker only recomputes the `standard` baseline
- **sqlite3 stdlib over aiosqlite** — the worker is I/O-bound on HTTP, not DB; per-cycle DB work is <100ms and blocking calls inside a sync transaction are simpler than async cursor juggling
- **rapidfuzz for team matching** — fast C-backed Levenshtein, zero Python-layer overhead
- **Circuit breaker reads ScrapeRun rows rather than holding in-memory state** — survives worker restarts and is visible to the UI when Phase G lands
- **BetMGM access ID lives in env** — BetMGM rotates it periodically; we fail clean with a helpful message instead of crashing the scheduler
- **Phase F books (bet365/Fanatics/ESPN BET) are `enabled=False` in the registry** — they'll stay off the schedule until we get to Phase F so a broken Playwright path can't take out the whole cycle

## Rayan's feedback this session
- "split into smaller tasks — execute Phase A only, will continue later"
- Day/hour heatmap needs fixing (done)
- Back-test every feature for workability before building Phase A (done, all green)
- "pause this session, i will resume shortly when i say resume, pickup exactly where you left off same instructions" — pausing cleanly here

## Blockers
- System Python is 3.14. `pyproject.toml` declares `>=3.12`; pip will install on 3.14 but `curl_cffi` and `playwright` can lag on bleeding-edge CPython. Worth pinning to 3.12 via `brew install python@3.12` on resume.
- BetMGM scraper needs `BETMGM_ACCESS_ID` env var — fails clean without it, circuit breaker handles it.
