# Scraper inventory — current state (2026-05-21)

Phase 0 reconnaissance of the arb-finder scraping layer. This is the map for
the six-phase resilience refactor that follows. Read this before touching any
scraper code.

---

## 1. Top-line divergences from the planned refactor

The refactor prompt assumes a fresh `scrapers/` directory at the repo root.
That is **not** the current shape. The repo is well past session 2 and the
Python scraping layer already exists as a real package under `apps/worker/`.

| Prompt's assumption | Actual repo |
|---|---|
| `scrapers/` at root, fresh build-out | `apps/worker/arb_worker/scrapers/` — published Python package, installed via `pyproject.toml`, importable as `arb_worker.scrapers.*` |
| No transport abstraction | `apps/worker/arb_worker/scrapers/base.py` already wraps httpx with tenacity retry and curl_cffi stealth fallback |
| Build a `BrowserTransport` for stealth books | `apps/worker/arb_worker/scrapers/playwright_base.py` already exists with persistent profile + jittered mouse/scroll |
| Build canonical-key matcher (Phase 2) | `apps/worker/arb_worker/matcher/{canonical,event_matcher}.py` ships full NBA alias table + canonical hashing + ±15 min fuzzy time window + EventMatchReview queue |
| Build circuit breaker | `apps/worker/arb_worker/scheduler.py` already implements one over the `ScrapeRun` model with exponential backoff capped at 1h |
| Build webhook alerts | `apps/worker/arb_worker/notifications.py` ships Slack + Discord (no Pushover yet) |
| `pyproject.toml` would be created | exists at `apps/worker/pyproject.toml`, `[stealth]` extra already gates curl_cffi + playwright |
| `tests/` with fixtures | `apps/worker/tests/` has 3 test modules (canonical, arb math parity, pipeline smoke) |
| `.github/workflows/` | **does not exist** — CI is genuinely unbuilt |

**Implication.** Phases 1, 2, and parts of 4 are partly built. Phase 3 (max
stake), Phase 5 (CI), and the bulk of the proxy / fingerprint / rate-limit /
cache / admin-dashboard work in Phase 1 and 4 are genuinely missing. The
right move is to **adapt the refactor in place under `apps/worker/`** rather
than create a parallel `scrapers/` tree.

This decision is surfaced as an open question at the bottom of this doc.

---

## 2. Repository layout (relevant parts)

```
arb-finder/
├── apps/
│   ├── web/                          # Next.js 15 App Router + React 19
│   │   └── app/api/health/route.ts   # only existing API route
│   └── worker/
│       ├── arb_worker/
│       │   ├── cli.py                # `python -m arb_worker {cycle,run,doctor,login,detect-boosts}`
│       │   ├── config.py             # env + BOOKS registry + DATABASE_URL resolution
│       │   ├── db.py                 # sqlite3 wrapper + RawEvent/RawSelection DTOs + upserts
│       │   ├── logging_setup.py      # structlog: JSON in prod, pretty in TTY
│       │   ├── scheduler.py          # APScheduler 5-min tick + circuit breaker
│       │   ├── notifications.py      # Slack + Discord webhooks above ARB_NOTIFY_THRESHOLD
│       │   ├── matcher/
│       │   │   ├── canonical.py      # NBA alias table + canonical-key hasher + rapidfuzz fallback
│       │   │   └── event_matcher.py  # fast-path → canonical → ±15 min fuzzy → create | review
│       │   ├── pipeline/
│       │   │   ├── run_cycle.py      # gather scrapers → match → persist → recompute arbs
│       │   │   └── recompute_arbs.py # Python port of arb-standard, preserves seed arbs
│       │   ├── boosts/auto_detect.py # Playwright-driven promo detection (referenced by cli.py)
│       │   └── scrapers/
│       │       ├── base.py           # SportsbookScraper ABC + httpx + tenacity + curl_cffi
│       │       ├── playwright_base.py# PlaywrightScraper ABC + persistent profile + humanization
│       │       ├── fanduel.py
│       │       ├── draftkings.py
│       │       ├── betmgm.py
│       │       ├── caesars.py
│       │       ├── betrivers.py
│       │       ├── bet365.py
│       │       ├── fanatics.py
│       │       └── espnbet.py
│       ├── tests/
│       │   ├── test_canonical.py     # 7 tests
│       │   ├── test_arb_math.py      # 6 tests (parity with TS engine)
│       │   └── test_cycle_smoke.py   # 2 tests (in-memory SQLite)
│       ├── pyproject.toml            # hatchling, Python ≥3.11, [stealth] extra
│       ├── Dockerfile                # Railway deploy target
│       └── railway.json
├── packages/engine/                  # TS arb math — 52/52 tests green (verified 2026-05-21)
├── db/
│   ├── schema.prisma                 # SQLite (dev)
│   ├── schema.postgres.prisma        # Neon (prod, same models)
│   └── seed.ts                       # 8 books, 12 events, 5 arbs, 120 bets
├── DEPLOY.md                         # Vercel + Neon + Railway walkthrough
└── vercel.json
```

---

## 3. Per-book scraper inventory

All eight books inherit from `SportsbookScraper` in `apps/worker/arb_worker/scrapers/base.py`.
Five JSON scrapers route through `httpx.AsyncClient` + tenacity. Two of those
five fall back to `curl_cffi` Chrome impersonation (DK, Caesars) because their
WAFs reject vanilla TLS. The three Playwright scrapers are guarded by
`enabled=False` in `config.py:48-50` and load lazily so installs without the
`[stealth]` extra don't crash.

### 3.1 FanDuel — `scrapers/fanduel.py`

| Field | Value |
|---|---|
| `book_id` / `book_key` | `fd` / `fanduel` |
| Transport | `httpx.AsyncClient` (HTTP/2) + tenacity retry |
| Endpoint | `GET https://sbapi.ny.sportsbook.fanduel.com/api/content-managed-page` |
| Query params | `page=CUSTOM, customPageId=nba, _ak=FhMFpcPWXMeyZxOx, timezone=America/New_York` |
| Auth | None — public `_ak` access key |
| Normalizes to | `RawEvent` + `RawSelection` (see `db.py:73-94`) → moneyline/spread/total |
| Market resolver | `_classify_market` whitelists `MONEY_LINE`, `MATCH_HANDICAP_(2-WAY)`, `TOTAL_POINTS_(OVER/UNDER)` and tolerant substrings |
| Side resolver | `_side_for` matches team name lowercase substring; `over`/`under` for totals |
| Failure handled | Network error → tenacity retries (3, exp 1–8s); empty event list → `ScraperError` for circuit breaker |
| Missing for prod | No request cache; no rate limit budget; no fingerprint coherence; only one fixed UA in `DEFAULT_HEADERS` |
| Status (per state.md) | **Live and working from this machine** — 8 NBA events / 84 selections per cycle |

### 3.2 DraftKings — `scrapers/draftkings.py`

| Field | Value |
|---|---|
| `book_id` / `book_key` | `dk` / `draftkings` |
| Transport | **`curl_cffi` Chrome131 impersonation** via `asyncio.to_thread(stealth_get_json, …)` |
| Endpoint | `GET https://sportsbook.draftkings.com/sites/US-NY-SB/api/v5/eventgroups/42648` |
| Why stealth | Akamai WAF returns 403 on vanilla httpx TLS fingerprint |
| Normalizes to | `RawEvent` + `RawSelection`; reads `eventGroup.events[*]` for teams, `offerCategories[*].offerSubcategoryDescriptors[*].offerSubcategory.offers[*][*].outcomes[*]` for prices |
| Failure handled | curl_cffi opaque errors → wrapped in `ScraperError`; 429/4xx surfaced with HTTP status |
| Missing for prod | No proxy support — stealth TLS does not defeat geo-IP block (state.md confirms DK 403s from non-NY IPs); curl_cffi instance not pooled |
| Status (per state.md) | **Blocked from this machine on geo-IP**; expected to work from user's NY home network |

### 3.3 BetMGM — `scrapers/betmgm.py`

| Field | Value |
|---|---|
| `book_id` / `book_key` | `mgm` / `betmgm` |
| Transport | `httpx.AsyncClient` (HTTP/2) + tenacity |
| Endpoint | `GET https://sports.ny.betmgm.com/cds-api/bettingoffer/fixtures` with `x-bwin-accessid=...` query param |
| Auth | **`BETMGM_ACCESS_ID` env var** — rotating, user-supplied from devtools |
| Normalizes to | `RawEvent` + `RawSelection` from `fixtures[*].optionMarkets[*].options[*]` |
| Failure handled | Missing env var → `ScraperError("BETMGM_ACCESS_ID not configured…")` → circuit breaker; empty fixtures list → `ScraperError` |
| Missing for prod | No automated access-id refresh; stale id silently kills the book |
| Status (per state.md) | Blocked until user provides current `x-bwin-accessid` |

### 3.4 Caesars — `scrapers/caesars.py`

| Field | Value |
|---|---|
| `book_id` / `book_key` | `caesars` / `caesars` |
| Transport | **`curl_cffi` Chrome131 impersonation** via `asyncio.to_thread` |
| Endpoint | `GET https://api.americanwagering.com/regions/us/locations/ny/brands/czr/sb/v3/events/schedule?league=basketball_nba` |
| Why stealth | Same Akamai posture as DK |
| Normalizes to | `RawEvent` + `RawSelection`; reads `competitions[*]` (or `events[*]`) and `markets[*].selections[*]` |
| Failure handled | curl_cffi errors → `ScraperError`; 4xx surfaced |
| Missing for prod | Same as DK — geo-IP blocked, no proxy support |
| Status (per state.md) | Blocked from this machine on geo-IP |

### 3.5 BetRivers — `scrapers/betrivers.py`

| Field | Value |
|---|---|
| `book_id` / `book_key` | `br` / `betrivers` |
| Transport | `httpx.AsyncClient` (HTTP/2) + tenacity |
| Endpoint | `GET https://ny.betrivers.com/api/service/sportsbook/offering/listview/events?cageCode=212&type=PREMATCH&leagueId=1149&primaryMarketOnly=false` |
| Notes | Hardcoded `cageCode=212` (NY) and `leagueId=1149` (claimed NBA — state.md flags this as wrong, returns 200/0 events) |
| Normalizes to | `RawEvent` + `RawSelection` from `items[*].betOffers[*].outcomes[*]` |
| Missing for prod | **leagueId is wrong**; needs a one-time sweep to discover current NBA value; no proxy support |
| Status (per state.md) | Live (HTTP 200) but returns 0 events — quick-fix candidate |

### 3.6 bet365 — `scrapers/bet365.py`

| Field | Value |
|---|---|
| `book_id` / `book_key` | `b365` / `bet365` |
| Transport | Playwright Chromium, persistent context at `apps/worker/.playwright-profiles/bet365/` |
| URL | `https://www.nj.bet365.com/#/AC/B18/C20604387/D48/E850/F165/` |
| Anti-detection | `playwright_base.py` adds: `navigator.webdriver=false`, `plugins=[1,2,3]`, `languages=['en-US','en']`, jittered mouse + wheel scroll |
| Selectors | Walks shadow DOM via `walker(root)` JS, collects `[data-test*="Odds"], .gl-Participant, .src-ParticipantOddsOnly` text nodes |
| Failure handled | Wait timeout on odds selector → reads `page.title()` and raises `ScraperError("…likely CF challenge")` |
| Status | `enabled=False`; **collects raw odds strings only**, never writes structured `RawSelection` rows yet — the parser layer is a TODO marked as Phase F MVP |

### 3.7 Fanatics — `scrapers/fanatics.py`

| Field | Value |
|---|---|
| `book_id` / `book_key` | `fan` / `fanatics` |
| Transport | Same Playwright base as bet365 |
| URL | `https://sportsbook.fanatics.com/basketball/nba` |
| Strategy | Reads `__NEXT_DATA__` script JSON and walks the tree for objects containing `americanOdds` |
| Failure handled | Missing `__NEXT_DATA__` element → `ScraperError`; JSON parse failure → `ScraperError`; zero odds nodes found → `ScraperError` |
| Status | `enabled=False`; **detects liveness only, no structured selections written** — same Phase F MVP shape as bet365 |

### 3.8 ESPN BET — `scrapers/espnbet.py`

| Field | Value |
|---|---|
| `book_id` / `book_key` | `espn` / `espnbet` |
| Transport | Same Playwright base |
| URL | `https://espnbet.com/sport/basketball/organization/united-states/competition/nba` |
| Strategy | Counts `[data-testid="EventListEvent"]` elements (liveness probe only) |
| Failure handled | Wait timeout → `ScraperError("ESPN BET never rendered event list")`; zero events → `ScraperError` |
| Status | `enabled=False`; **liveness count only, no structured selections** — Phase F MVP shape |

---

## 4. What the transport layer does today vs the planned hardening

### 4.1 HTTP transport (`scrapers/base.py`)

Today:
- One `httpx.AsyncClient` per scraper run with HTTP/2 enabled, 15s timeout, `follow_redirects=True`
- One global `DEFAULT_HEADERS` dict — single Mac Chrome 131 UA, no `Sec-Ch-Ua*`, no platform variants
- Tenacity retry: 3 attempts, exponential 1–8s, only retries on `httpx.TransportError | ReadTimeout | ConnectError`. **Does not retry on 429 or 5xx** — those raise `ScraperError` immediately and the cycle treats them as fatal for that book
- `stealth_get_json` (sync) wraps `curl_cffi.requests.get(impersonate="chrome131")` for DK and Caesars; called via `asyncio.to_thread` so the event loop stays free

Planned in the refactor and **not present today**:
- `JSONTransport` class abstraction (transport is currently expressed as two free functions: `get_json` and `stealth_get_json`)
- Retry on 5xx and 429 with full-jitter backoff
- ProxyProvider hook on every request (no proxy support at all today)
- Coherent fingerprint registry — currently one fixed UA, no rotation
- Per-host token bucket (rate limiting is only via tenacity backoff on already-failed requests)
- Response cache with TTL
- Health-layer hooks recording latency / bytes / attempt count per request

### 4.2 Browser transport (`scrapers/playwright_base.py`)

Today:
- `open_persistent_session` opens a single Chromium context per book at `apps/worker/.playwright-profiles/<book>/`, locale `en-US`, timezone `America/New_York`, viewport 1440×900, Chrome 131 Mac UA
- `add_init_script` patches `navigator.webdriver`, `plugins`, `languages` inline (no `playwright-stealth`, no `rebrowser-playwright`)
- `human_mouse_move` and `human_scroll` provide jittered cursor + wheel events before extraction
- `bypass_csp=True` to allow shadow-DOM walking
- One session per cycle — closes after `parse()` returns
- No resource interception (images/fonts/media still load)
- No `BrowserDetected` typed exception — challenges surface as generic `ScraperError("…likely CF challenge")`
- No proxy support
- Cookies / localStorage persist between cycles (user-data-dir is reused)

Planned in the refactor and **not present today**:
- `rebrowser-playwright` with `playwright-stealth` fallback (current setup uses plain Playwright)
- Resource interception block list (images/fonts/media/trackers)
- Sticky-session proxy rotation (no proxy at all)
- Typed `BrowserDetected` exception
- Coherent fingerprint coupling between viewport / UA / Sec-Ch-Ua / timezone

### 4.3 Health and circuit breaker (`scheduler.py` + `db.record_scrape_run`)

Today:
- `ScrapeRun` rows logged for every book every cycle: `status, error, httpStatus, eventsFound, selectionsFound, durationMs`
- `should_skip(book_key)` reads the last `MAX_CONSECUTIVE_FAILURES+2` rows and computes whether the breaker is open + remaining cooldown
- Cooldown: `CIRCUIT_BASE_COOLDOWN_SECONDS * 2^excess`, capped at 1h; envs `ARB_MAX_FAILURES=3, ARB_COOLDOWN=900`
- **But `should_skip` is defined and not called** — `run_cycle.py` runs every enabled scraper unconditionally and lets failures fall back through to a recorded `ScrapeRun{status="error"}`. The breaker is only partly wired.

Planned in the refactor:
- States: `healthy | degraded | broken` exposed via API (today: derivable from rows, not surfaced)
- Latency p50/p95, requests_total/failed/challenged counters
- 5 failures → degraded with proxy/profile refresh
- 10 failures → broken for 30 min
- `/api/scrapers/health` route in Next.js (today: only `/api/health`)
- `/admin/scrapers` page with sparkline + live request log + force-refresh + reset-circuit buttons (today: nothing)
- `ADMIN_TOKEN` middleware gate

### 4.4 Rate limit + cache

Today:
- No per-host token bucket. Tenacity backoff only fires after a request already failed.
- No response cache. Worker fetches every book on every 5-min tick.

Planned: per-host 1 req/sec, burst 5, configurable per book; SQLite cache keyed by `(book, market_key, hash(request))` with 60s TTL.

### 4.5 Proxy provider

Today: **None.** No `httpx` proxy kwarg, no `curl_cffi` proxy kwarg, no Playwright `proxy=` config. Stealth TLS impersonation is the only anti-fingerprint layer.

Planned: vendor-agnostic `ProxyProvider` protocol + `NoProxyProvider | EnvListProvider | GenericResidentialProvider`, sticky 6-hour session IDs hashed on `(book, day, slot)`.

### 4.6 Fingerprint registry

Today: One UA in `DEFAULT_HEADERS`, one viewport in `open_persistent_session`. Coherent only by coincidence.

Planned: `chrome120_desktop, chrome121_desktop, safari17_desktop, chrome120_macos` profiles, each with matched UA / Sec-Ch-Ua* / viewport / Accept-Language / timezone.

---

## 5. Event matcher (Phase 2 status)

`apps/worker/arb_worker/matcher/canonical.py` and `event_matcher.py` already
implement most of what the prompt's Phase 2 specs. Concretely:

| Phase 2 requirement | Status |
|---|---|
| `canonical_key(sport, start_utc, home, away)` | Implemented as `build_canonical_key(home_canonical, away_canonical, commence)` — string `"nba\|<yyyy-mm-dd>\|<sorted teams>"` |
| Per-sport alias tables | NBA only — 30 teams, in code (`NBA_CANONICAL_TEAMS` dict). NFL/MLB/NHL/etc. not yet built. |
| Sport code normalization | Hardcoded `"nba"` everywhere. No sport-key normalization layer for `nfl`, `mlb`, etc. |
| 15-min start-time rounding | **Not done.** Current canonical key uses `strftime("%Y-%m-%d")` (full day). Day-bucketing handles small disagreements that don't cross midnight, but a game starting at 23:55 UTC vs 00:05 UTC across two books would fall into different buckets and miss the fast path. |
| ±90 min fuzzy fallback | Today's window is ±15 min (`FUZZY_MATCH_WINDOW_MINUTES=15`). Tighter than the prompt asks for. |
| `time_mismatch` log event when teams match but date doesn't | Not emitted as a distinct event. The matcher just falls through to "create new event". |
| Alias tables persisted to disk | Yes — `TeamAlias` Prisma model + `_load_dynamic_aliases` in `event_matcher.py`. Static + dynamic stack. |
| `EventMatchReview` queue for unresolvable rows | Yes — `db.insert_match_review` writes to `EventMatchReview` Prisma model when neither team resolves. |
| Tests | `apps/worker/tests/test_canonical.py` covers normalize / resolve_team / canonical key order independence / unknown teams / round-trip. 7 tests, all green. No fixture-based end-to-end matcher test (e.g. "20 NBA games across all books bucket into 20 canonical keys"). |

**Phase 2 gap.** The matcher works for NBA today. Adding NFL/MLB/NHL needs:
1. A sport-key parameter threaded through `canonical.py:build_canonical_key` (currently hardcoded `"nba"` in the returned key).
2. Per-sport alias dicts loaded from `scrapers/core/aliases/<sport>.json` (or the equivalent path under the existing tree).
3. The 15-min rounding fix on `start_utc` (today only `%Y-%m-%d` is hashed).
4. A fixture-based matcher test of the type the refactor prompt describes.

---

## 6. Max-stake enforcement (Phase 3 status)

Schema confirms `Selection.maxStake Float?` is present (`db/schema.prisma:96`)
and the `RawSelection` DTO carries it (`db.py:94`). Scrapers do not populate
it today — no book API surfaces a per-book / per-market cap. There is no
`MaxStake` table in the schema; caps live on individual selections, not on a
`(book, sport, market_type)` lookup.

The engine **does not honor stake caps in any of its four arb functions**
(`packages/engine/src/arb-standard.ts`, `arb-free-bet.ts`, `arb-no-sweat.ts`,
`arb-site-credit.ts`). They take a `totalStake` and split it; if the optimal
split exceeds a real-world book cap the UI happily shows an opportunity that
cannot actually be placed at that size. This is exactly what the README
admits at line 122 — _"Max-stake enforcement per book+market (in schema,
wired in session 2)"_.

Phase 3 work that does not exist yet:
- Engine `caps?: Record<bookId, number>` parameter on every arb function
- Recomputed `min_profit` / `expected_profit` / `cappedBy` outputs
- `MaxStake` Prisma model with `(book, sport, market_type, max_stake_usd)` (or, alternatively, reuse `Selection.maxStake` — the prompt does not insist on a separate table)
- UI amber chip on `/opp/[id]` when `cappedBy` is set
- Bankroll slider max-value snap to the cap

The existing 52 engine tests do not exercise capped paths.

---

## 7. Observability (Phase 4 status)

| Phase 4 requirement | Status |
|---|---|
| structlog with JSON in prod, key=value in dev | Done — `logging_setup.py:30-33` uses `JSONRenderer` when stdout is not a TTY, `ConsoleRenderer` otherwise. (Prompt suggests `ARB_ENV` switch; today the switch is `sys.stdout.isatty()`.) |
| pino in Next.js | Not done. `apps/web/app/api/health/route.ts` uses `console.log`-shaped logging (haven't audited the rest yet but no pino import exists). |
| `ConsoleAlerter` + `PushoverAlerter` | Only Slack + Discord webhooks today (`notifications.py`). No Pushover, no console-only fallback for local dev. Trigger logic is also different — current notifier fires on every `ArbOpp` over `ARB_NOTIFY_THRESHOLD=0.05`, not on health transitions. |
| Alert on `healthy → broken` | Not emitted — there is no `broken` sentinel state surfaced today. |
| Alert on 30-min arb drought during 10am–1am ET | Not emitted. |
| Alert on no healthy proxy for 5 min | No proxy layer, no signal. |
| Rate-limit alerts to one per book per hour | No alert dedup. |
| Admin dashboard with live request log + force refresh + circuit reset | Not built. |
| `ADMIN_TOKEN` middleware gate | Not built. |

---

## 8. CI + deploy (Phase 5 status)

- `.github/workflows/` does not exist. No CI on PRs at all.
- `DEPLOY.md` documents Vercel (web) + Railway (worker) + Neon (DB). The refactor prompt suggests Vercel + Neon + small VPS (Hetzner/DO) + systemd. This is a real architectural divergence: Railway works fine for the existing single-container worker, but the prompt's VPS path lets us bake in Chromium for the Playwright scrapers and write proxy/Pushover credentials outside Vercel's env scope. **No action implied for Phase 0** — just flagging.
- Engine tests run via `pnpm --filter @arb/engine test`; pytest configured but no coverage gate; no `ruff check` enforced; no `tsc --noEmit` in CI (only on `pnpm build`).

---

## 9. Tests today

| Suite | Path | Test count | Notes |
|---|---|---|---|
| Engine — arb math | `packages/engine/test/*.ts` | **52** (verified `pnpm test` on 2026-05-21) | Excel-parity to 4+ decimals across odds / standard / free-bet / no-sweat / site-credit / kelly |
| Worker — arb parity | `apps/worker/tests/test_arb_math.py` | 6 | Asserts the Python `compute_standard_arb` matches the TS engine outputs |
| Worker — canonical / matcher | `apps/worker/tests/test_canonical.py` | 7 | normalize, resolve_team (exact / alias / fuzzy / unknown), canonical-key order independence, resolve round-trip |
| Worker — pipeline smoke | `apps/worker/tests/test_cycle_smoke.py` | 2 | in-memory SQLite, recompute finds a 2-book arb, ignores same-book pair |

No tests for:
- Per-scraper replay against captured fixtures
- Network-level transport behavior (retry curves, 429 handling, curl_cffi fallback)
- Circuit-breaker state transitions
- Notification dedup / threshold logic
- Engine cap-binding (Phase 3)

---

## 10. Database state (per `state.md`, 2026-04-14 pause)

- 8 books seeded
- 20 events = 12 hand-seeded + 8 real FanDuel NBA pulls
- 264 selections = 216 seeded + 48 real FanDuel
- 5 hand-crafted seed arbs preserved across recomputes via `recompute_arbs.py:124` selective delete
- 120 historical bets for analytics
- `db/dev.db` is 1.8 MB WAL + 290 KB main + 32 KB SHM as of 2026-05-21

The seed has not been re-run on this machine since 2026-04-14. The pipeline
will run cleanly on the existing DB; rebuilding from scratch would need
`prisma db push --schema=db/schema.prisma` + `pnpm seed`.

---

## 11. Known blockers (carried from `state.md`)

External issues that need user action — not unblockable from this machine:

1. **DraftKings + Caesars geo-block.** TLS impersonation works; geo-IP block does not. Both books 403 from non-NY IPs. Resolution: run from user's NY home network or wire up a NY residential proxy in the upcoming `ProxyProvider`.
2. **BetMGM access ID.** `BETMGM_ACCESS_ID` rotates. Needs user devtools copy. Could be automated via a Playwright "login + sniff" routine in a later phase.
3. **BetRivers leagueId=1149.** Returns 200 but 0 events. Probably wrong league id since their schema update. One-shot sweep needed.
4. **Neon password rotation.** state.md flags an exposed password from a previous chat — must rotate before any prod deploy. Not blocking Phase 0.

---

## 12. Open questions before Phase 1

The refactor prompt assumes a fresh build under `scrapers/` at the repo root.
Reality is a working package under `apps/worker/arb_worker/`. The two paths
forward are:

**Option A — adapt in place.** Add the missing layers (`ProxyProvider`,
`fingerprint`, `rate_limit`, `cache`, expanded `health`, `BrowserDetected`,
admin route) under `apps/worker/arb_worker/core/` and refactor existing
scrapers to use them. Keeps the package import paths stable, preserves the
existing scheduler, db layer, and tests. Phase 1 becomes additive plus a
modest refactor of `scrapers/base.py` and `scrapers/playwright_base.py`.

**Option B — move to `scrapers/` at root.** Rewire `pyproject.toml`,
`Dockerfile`, `railway.json`, `cli.py` entrypoint, all imports across the
package. Then layer the same new modules. More churn, no functional gain,
breaks every existing PR / branch / state.md path reference.

**Recommendation: Option A.** The only reason to prefer B is if the
refactor prompt's directory layout is load-bearing for some workflow not
visible in the repo. Otherwise the existing layout is already a proper
Python package and moving it is gratuitous.

Other open questions:

1. **Engine cap-binding (Phase 3).** Should the cap parameter be a flat
   `Record<bookId, number>` per arb call, or should it read from a new
   `MaxStake` Prisma model keyed on `(bookId, sport, marketType)`? The
   prompt asks for the latter; the schema today implies the former via
   `Selection.maxStake`. Picking one of these is a Phase 3 question, not
   a Phase 0 question, but flagging early.
2. **Match-window widening (Phase 2).** The matcher today uses ±15 min;
   the prompt asks for 15-min rounding on canonical-key + ±90 min fallback.
   Is the tight 15-min window load-bearing for any UI behavior, or is it
   safe to widen to 90 min for the fallback path while keeping the
   canonical fast path tight?
3. **Pushover vs the existing Slack/Discord notifier.** Should Pushover
   be added alongside the existing webhooks, or replace them? The prompt
   suggests Pushover specifically; the existing notifier already covers
   Slack and Discord with sane templates.
4. **VPS vs Railway for the worker.** DEPLOY.md ships Railway. The
   prompt suggests Hetzner / DO + systemd. Worth a brief decision before
   Phase 5 — Railway works fine today and the only real win of VPS is
   isolating proxy / Pushover env from Vercel.

---

## 13. Verified pre-flight state (2026-05-21)

- `pnpm --filter @arb/engine test` → **52 / 52 passed**, 555ms duration
- `apps/worker/.venv/bin/python -c "import arb_worker"` → imports cleanly
- `git status` → clean, on `main`, up to date with `origin/main`
- Branch for this PR: `docs/scraper-inventory`

No Phase 0 stop conditions from the refactor prompt are triggered. The
"no `scrapers/` directory yet" condition is technically true but the
intended functionality lives under `apps/worker/` — that's the directory
divergence resolved by question 1 above, not a blocker.
