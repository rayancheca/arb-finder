# arb-finder

## What this is

A cross-book sportsbook arbitrage and promo-boost finder for pre-game markets. Ingests odds from every major New York sportsbook, normalizes them, detects 2-way arbitrage opportunities across books, amplifies them with active promos (free bets, no-sweats, site credits, profit boosts), and surfaces ranked opportunities in a dense, finance-terminal-style web UI with one-click placement via deep links or a companion browser extension.

Personal use, single user (Rayan). Built to replace the manual Excel-calculator workflow with something that monitors every book continuously and tells you the best trade to place right now — with full Kelly / bankroll optimization and a historical P&L analytics layer on top.

## Architecture

Monorepo with a Next.js web app, a Python worker for odds polling and arb computation, a shared TypeScript engine package used by both the server and client for arb math, and a Chrome extension for bet-slip autofill.

```
arb-finder/
├── apps/
│   ├── web/                    # Next.js 15 App Router + TS strict
│   └── worker/                 # Python 3.12 — poller + scrapers + arb computer
├── packages/
│   ├── engine/                 # TS arb math (shared by web server + client)
│   └── extension/              # Chrome MV3 extension (Phase 8)
├── db/
│   └── schema.prisma           # Single source of truth for data model
├── scrapers/                   # One Python module per book (Phase 3+)
├── CLAUDE.md
├── state.md
└── README.md
```

**Data flow:**
1. Python worker polls each book every 5 min via direct JSON endpoints (or Playwright for bet365/Fanatics)
2. Writes normalized `selections` rows to Postgres
3. Event matcher reconciles "Lakers @ Warriors" across books via canonical keys + fuzzy time match
4. Arb engine (TS, called via child process or HTTP) computes opportunities for every 2-way market × every book pair × every active boost
5. `arb_opps` table gets recomputed; staleness tracked per row
6. Next.js UI reads `arb_opps` ordered by `net_return_pct`, streams updates to browser

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Web framework | Next.js 15 App Router + React 19 | Server Components for data fetching, client boundaries for interactive calcs, no API duplication |
| Language (web) | TypeScript strict | Non-negotiable for a money app |
| Styling | Tailwind CSS v4 + CSS variables | Design tokens live in CSS, Tailwind utilities compose them, no runtime cost |
| Components | Radix UI primitives (headless) | Accessibility + keyboard nav free, fully restylable so it doesn't look template |
| Charts | Recharts | Mature, composable, themeable; sufficient for the analytics depth we need |
| Database (local) | SQLite via Prisma | Zero setup, same schema as prod |
| Database (prod) | Neon Postgres | Serverless, generous free tier, Prisma-native |
| ORM | Prisma | Type-safe queries, migrations, one schema for SQLite + Postgres |
| Worker language | Python 3.12 | Best scraping ecosystem: httpx, curl_cffi (TLS fingerprint spoof), playwright, beautifulsoup |
| Task scheduling | APScheduler (Phase 3+) | Simple cron inside a long-running process, no external broker |
| Deploy (web) | Vercel | Phase 9 |
| Deploy (worker) | Railway or Fly.io | Phase 9 |
| Extension | Chrome MV3 + TS | Phase 8 |

**Rejected:**
- Go worker — Python's scraping ecosystem is stronger
- tRPC — adds a layer; Server Actions + typed Prisma is enough
- Zustand / Redux — Server Components + URL state handle everything
- shadcn out of the box — looks like every other site; we use Radix directly and style from scratch
- Rust for the engine — the engine is <200 lines of arithmetic, TS is the right tool

## Core features (v1, session 1 mockup)

1. **Arb engine** with four boost variants, Excel-faithful by default and with six improvements gated behind a "strict / improved" toggle
2. **Dashboard** — ranked table of live arb opportunities across books, sortable and filterable
3. **Detail page** — per-opportunity view with bankroll slider, boost selector, stake split, guaranteed profit range, place-trade buttons
4. **Search** — query any team or matchup, see every 2-way market with every cross-book arb
5. **Boosts tab** — CRUD for active promos per book
6. **Bankroll tab** — Kelly calculator, per-book idle vs exposed, rebalance suggestions, risk-of-ruin simulator
7. **Analytics tab** — KPI cards, bankroll curve, per-book / per-sport / per-boost profit, bet size histogram, EV leak chart, heatmap
8. **Design system** — OKLCH palette, Inter + JetBrains Mono with tabular nums, motion primitives (FLIP number transitions, staleness pulse)

## Stretch features

- Real scrapers for FanDuel, DraftKings, BetMGM, Caesars, BetRivers (Phase 3–4)
- Hardened scrapers for bet365, Fanatics, ESPN BET (Phase 7)
- Boost auto-detection via logged-in Playwright session (Phase 6)
- Chrome extension for bet-slip autofill (Phase 8)
- Live odds streaming via SSE instead of polling (post-Phase 9)
- Mobile-optimized view
- Slack/Discord alerts when a high-EV opp appears

## File structure (session 1 target)

```
arb-finder/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── layout.tsx                 # Root shell, font loading, sidebar nav
│       │   ├── page.tsx                   # Dashboard — ranked arb table
│       │   ├── globals.css                # Design tokens (OKLCH vars) + base styles
│       │   ├── opp/[id]/page.tsx          # Opportunity detail
│       │   ├── search/page.tsx            # Search + results
│       │   ├── boosts/page.tsx            # Manage active promos
│       │   ├── bankroll/page.tsx          # Kelly + per-book + risk of ruin
│       │   └── analytics/page.tsx         # Full personal P&L + charts
│       ├── components/
│       │   ├── shell/
│       │   │   ├── Sidebar.tsx            # Primary nav
│       │   │   └── TopBar.tsx             # Search, staleness indicator, bankroll total
│       │   ├── ui/
│       │   │   ├── SurfaceCard.tsx        # Base card with subtle border + hover
│       │   │   ├── StatBlock.tsx          # KPI card with value + label + sparkline slot
│       │   │   ├── OddsCell.tsx           # Tabular mono odds with +/- color + FLIP anim
│       │   │   ├── BookChip.tsx           # Book badge with logo color
│       │   │   ├── BoostBadge.tsx         # Amber pill for promo-amplified opps
│       │   │   ├── DataTable.tsx          # Headless table primitive, dense mode
│       │   │   ├── Button.tsx             # 3 variants: primary/ghost/danger
│       │   │   ├── Slider.tsx             # Radix Slider restyled
│       │   │   ├── Tabs.tsx               # Radix Tabs restyled
│       │   │   └── Sparkline.tsx          # Tiny inline SVG chart
│       │   ├── dashboard/
│       │   │   ├── ArbTable.tsx           # Main ranked table
│       │   │   └── ArbFilters.tsx         # Sport / book / boost / min EV filters
│       │   ├── opportunity/
│       │   │   ├── StakeSlider.tsx        # Bankroll slider → recomputes splits
│       │   │   ├── BoostPicker.tsx        # Apply any active boost, see new numbers
│       │   │   └── PlaceTradePanel.tsx    # Deep-link buttons + extension handoff
│       │   ├── analytics/
│       │   │   ├── KpiGrid.tsx            # 6 KPI cards
│       │   │   ├── BankrollCurve.tsx      # Area chart, all books stacked
│       │   │   ├── ProfitByBook.tsx       # Bar chart
│       │   │   ├── ProfitByBoost.tsx      # Bar chart
│       │   │   ├── BetSizeHistogram.tsx   # Histogram
│       │   │   ├── EvLeakChart.tsx        # Theoretical vs realized
│       │   │   └── DayHourHeatmap.tsx     # Day-of-week × hour heatmap
│       │   └── bankroll/
│       │       ├── KellyCalculator.tsx    # Full/½/¼ Kelly sliders
│       │       ├── BookBalances.tsx       # Per-book idle vs exposed
│       │       ├── RebalancePanel.tsx     # Move-money suggestions
│       │       └── RiskOfRuin.tsx         # Monte Carlo simulator
│       ├── lib/
│       │   ├── db.ts                      # Prisma client singleton
│       │   ├── format.ts                  # Money, odds, pct formatters
│       │   ├── colors.ts                  # Per-book brand color map
│       │   └── seed-queries.ts            # Typed query helpers for seed data
│       ├── public/
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       └── postcss.config.mjs
├── packages/
│   └── engine/
│       ├── src/
│       │   ├── index.ts                   # Public API
│       │   ├── odds.ts                    # American ↔ decimal ↔ implied prob
│       │   ├── arb-standard.ts            # calc sheet port
│       │   ├── arb-free-bet.ts            # free bet sheet port
│       │   ├── arb-no-sweat.ts            # no sweat sheet port
│       │   ├── arb-site-credit.ts         # bet365 trade sheet port
│       │   ├── kelly.ts                   # Full/fractional Kelly
│       │   ├── risk-of-ruin.ts            # Monte Carlo
│       │   └── types.ts                   # Shared types
│       ├── test/
│       │   ├── odds.test.ts
│       │   ├── arb-standard.test.ts       # Reproduces exact Excel row outputs
│       │   ├── arb-free-bet.test.ts
│       │   ├── arb-no-sweat.test.ts
│       │   ├── arb-site-credit.test.ts
│       │   └── kelly.test.ts
│       ├── package.json
│       └── tsconfig.json
├── db/
│   ├── schema.prisma                      # sports, books, events, markets, selections, boosts, arb_opps, bets
│   └── seed.ts                            # Realistic NBA seed + ~100 historical bets
├── package.json                           # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── CLAUDE.md
├── state.md
└── README.md
```

## Implementation plan (session 1 — mockup)

### Phase 0 — Scaffold
1. Create monorepo with pnpm workspaces
2. Init Next.js 15 in `apps/web` with TS strict
3. Init `packages/engine` with tsup + vitest
4. Init Prisma with SQLite
5. Commit: "chore: scaffold monorepo"

### Phase 1 — Engine (Excel parity first, then improvements)
6. Port American-odds math (`americanToDecimal`, `americanToImpliedProb`, `toNetMultiplier`)
7. Port `calc` sheet → `arbStandard()`
8. Port `free bet` sheet → `arbFreeBet()` (generalize payout formula for + and − odds)
9. Port `no sweat` sheet → `arbNoSweat()` (parameterize cash rate)
10. Port `bet365 trade` sheet → `arbSiteCredit()`
11. Write vitest tests that hardcode the exact inputs from your Excel rows and assert the outputs match to 2 decimal places
12. Implement `kelly()` and `fractionalKelly()`
13. Implement `riskOfRuin()` Monte Carlo
14. Run `pnpm -r test`, all green
15. Commit: "feat(engine): arb math ported from Excel with tests"

### Phase 2 — Design system + data
16. Write `globals.css` with OKLCH tokens, typography, motion keyframes
17. Set up Tailwind v4 with CSS variables
18. Build UI primitives: `SurfaceCard`, `Button`, `DataTable`, `OddsCell`, `BookChip`, `BoostBadge`, `StatBlock`, `Sparkline`, `Slider`, `Tabs`
19. Define Prisma schema: `Sport`, `Book`, `Event`, `Market`, `Selection`, `Boost`, `ArbOpp`, `Bet`, `BankrollSnapshot`
20. Write `db/seed.ts` with:
    - 8 NY books (FanDuel, DraftKings, BetMGM, Caesars, bet365, BetRivers, Fanatics, ESPN BET)
    - 12 NBA events over the next 5 days
    - Moneyline markets for every event at every book
    - 3 engineered arb opportunities (one standard, one with a free bet, one with no-sweat)
    - ~100 historical `Bet` rows spanning 60 days for the analytics tab
    - Starting bankroll snapshots per book
21. Run seed, verify Prisma Studio shows data
22. Commit: "feat(db): schema + seed data"

### Phase 2.5 — Shell + Dashboard + Detail
23. Root layout with Sidebar + TopBar, all 6 tabs wired
24. Dashboard: `ArbTable` component reading from `ArbOpp` ordered by `netReturnPct`
25. `ArbFilters` (sport / book / boost / min EV) using URL search params
26. Detail page: load opp + event + selections, render two side cards with odds, bankroll slider (client-side engine), boost picker, place-trade buttons (deep-link stubs)
27. Search page: free-text over `event.homeTeam` + `awayTeam`, results list
28. Boosts page: table + create/edit form using Server Actions
29. Commit: "feat(ui): dashboard + detail + search + boosts"

### Phase 3 — Analytics tab
30. `KpiGrid` with 6 cards (total profit, ROI, bet count, win rate, avg EV, EV capture efficiency) + sparklines
31. `BankrollCurve` — stacked area by book
32. `ProfitByBook` — horizontal bars with ROI per book
33. `ProfitByBoost` — grouped bars by boost type
34. `BetSizeHistogram` — distribution
35. `EvLeakChart` — theoretical vs realized cumulative
36. `DayHourHeatmap` — 7×24 grid of profit density
37. Commit: "feat(analytics): P&L dashboard with charts"

### Phase 4 — Bankroll tab
38. `KellyCalculator` with Full / ½ / ¼ / custom sliders, shows recommended stake for a given edge and odds
39. `BookBalances` — idle vs exposed per book, total bankroll at top
40. `RebalancePanel` — reads recent opps, suggests redistribution
41. `RiskOfRuin` — Monte Carlo with configurable runs (default 10k), plots ruin curve
42. Commit: "feat(bankroll): Kelly + per-book + risk of ruin"

### Phase 5 — Ship session 1
43. `pnpm build` green
44. `pnpm dev`, visit every page, verify no runtime errors
45. Write `README.md`
46. `gh repo create arb-finder --public`
47. Push main
48. Update `state.md` to mark session 1 complete

## Visual requirements

**Direction:** Editorial Terminal. Dense, dark, typographic, Bloomberg-meets-Linear. Not a dashboard template. Not slate-gray shadcn defaults.

**Palette** (OKLCH, all dark)
- `--bg` `oklch(13% 0.012 260)` — deep blue-black, never pure black
- `--surface` `oklch(17% 0.014 260)` — cards and panels
- `--surface-raised` `oklch(21% 0.016 260)` — hover, active, focus
- `--border` `oklch(27% 0.018 260)` — hairlines between rows
- `--border-strong` `oklch(35% 0.02 260)` — emphasized dividers
- `--text` `oklch(97% 0 0)` — primary text
- `--text-dim` `oklch(68% 0.01 260)` — secondary
- `--text-faint` `oklch(48% 0.01 260)` — tertiary, timestamps
- `--profit` `oklch(78% 0.17 152)` — confident cool green
- `--profit-bg` `oklch(78% 0.17 152 / 0.12)`
- `--loss` `oklch(68% 0.22 25)` — warm red
- `--loss-bg` `oklch(68% 0.22 25 / 0.12)`
- `--boost` `oklch(82% 0.16 82)` — amber, reserved exclusively for promo rows and boost badges
- `--boost-bg` `oklch(82% 0.16 82 / 0.10)`
- `--accent` `oklch(72% 0.18 255)` — cold blue, primary CTAs only

**Typography**
- Display: Inter, weight 600–700, tight tracking (-0.02em on headlines)
- Body: Inter, weight 400–500, 15px base
- Mono: JetBrains Mono, `font-feature-settings: "tnum" 1, "zero" 1`, used for every number: odds, stakes, EV, P&L, percentages, timestamps

**Rhythm**
- Dashboard rows 38px tall, dense tabular scan-ability
- Detail pages generous: 24–32px section gaps, one decision per viewport
- Analytics uses editorial asymmetry — KPI row across the top, then 2/3 + 1/3 split, not a uniform 3-column grid

**Motion**
- Odds changes: FLIP slide, 180ms `cubic-bezier(0.16, 1, 0.3, 1)`, color flash (green up / red down) fading in 400ms
- Staleness pulse: opacity 0.7 → 1.0 cycle at 2s when row is >4 min old, brighter at 5 min
- Boost rows: 1px amber left-border + faint film grain overlay so they pop without shouting
- No page transitions. This is a terminal.
- Respects `prefers-reduced-motion` — disables FLIP, keeps color flashes

**Anti-template checklist** (must pass all)
- No centered hero with gradient blob
- No uniform card grid with identical padding
- No default shadcn borders or shadows
- Real hierarchy via scale contrast, not weight alone
- Every number uses mono + tnum
- Hover/focus/active states are designed, not default

## Quality bar

Fully done = all of:

- [ ] `pnpm build` exits 0 in `apps/web` and `packages/engine`
- [ ] `pnpm test` green in `packages/engine` with Excel-parity tests passing
- [ ] Dev server starts cleanly, no console errors
- [ ] Every page in the nav renders with seed data, no placeholder text anywhere
- [ ] Dashboard shows at least 3 arb opportunities with realistic numbers
- [ ] Detail page bankroll slider recomputes stakes instantly client-side
- [ ] Analytics renders all 6 KPI cards and all 7 charts with real-looking data
- [ ] Bankroll tab Kelly calculator works, risk-of-ruin runs
- [ ] Boosts tab can create/edit/delete a promo
- [ ] Looks genuinely designed — passes the anti-template checklist
- [ ] Code is pushed to `github.com/rayancheca/arb-finder`
- [ ] `state.md` updated with session 1 complete
