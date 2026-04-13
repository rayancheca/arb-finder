# state.md

## Status
IN PROGRESS

## Project
arb-finder — cross-book sportsbook arbitrage + promo-boost finder with Kelly bankroll optimization and personal P&L analytics

## Session count
1

## Session 1 plan
Ship the full mockup. Every page in the nav renders with realistic seeded data. Arb engine ported from Rayan's Excel with parity tests. Design system in place (Editorial Terminal direction). No real scrapers yet — seed data only. Pushed to GitHub.

## Thinking: scaffold
What this needs to accomplish — Working monorepo with Next.js 15 app, shared TS engine package, Prisma schema, SQLite database, pnpm workspaces wired.
Approach — pnpm workspaces, Next 15 App Router + React 19, Prisma generate against SQLite, Tailwind v4.
What could go wrong — Next 15 on Node 25 might surface peer warnings. Prisma generate needs a schema before it runs.
Done — `pnpm install` succeeds, `pnpm --filter web dev` boots a blank Next app, `pnpm --filter engine test` runs (empty pass).

## Completed steps
- Clarified project scope with Rayan in two rounds of Q&A
- Read the Excel calculator (`sportbook calculator copy.xlsx`), mapped all four sheets (calc, free bet, no sweat, bet365 trade) to arithmetic I can port verbatim
- Flagged six math improvements in the Excel (free-bet formula generalization, rounding compounding, no-sweat cash rate parameterization, max-stake enforcement, min-profit vs EV labels, slippage buffer)
- Locked architecture (Next 15 + TS engine package + Python worker + Prisma + SQLite→Postgres)
- Locked design direction (Editorial Terminal, OKLCH palette, Inter + JetBrains Mono, FLIP motion)
- Created `projects/arb-finder/`, `git init`, branch `main`
- Wrote full `CLAUDE.md` spec

## In progress
Scaffolding monorepo files (package.json, pnpm-workspace.yaml, Next app, engine package, Prisma schema)

## Next steps
1. Write root `package.json` + `pnpm-workspace.yaml` + `.gitignore` + `tsconfig.base.json`
2. Scaffold `apps/web` manually (package.json, next.config, tsconfig, tailwind, postcss, app/layout.tsx, app/globals.css) rather than running `create-next-app` to keep full control
3. Scaffold `packages/engine` with tsup + vitest
4. Write `db/schema.prisma` with full data model
5. `pnpm install` at root
6. `pnpm --filter @arb/engine test` (expect empty pass)
7. `pnpm --filter web dev` smoke test
8. Commit: "chore: scaffold monorepo"
9. Build engine Phase 1 — odds math + 4 arb functions + tests with Excel-parity fixtures
10. Commit: "feat(engine): arb math with Excel-parity tests"
11. Write `db/seed.ts` with books, events, markets, selections, historical bets, engineered arb opps
12. Build design tokens + UI primitives
13. Build dashboard + detail + search + boosts pages
14. Build analytics tab with seed P&L charts
15. Build bankroll tab with Kelly + risk of ruin
16. Final `pnpm build`, smoke test, commit, push, `gh repo create`

## Decisions log
- **No create-next-app** — hand-scaffolded to avoid template cruft and retain full control over every file
- **Tailwind v4** — CSS-first config, design tokens in `:root`, utilities compose variables
- **Prisma over Drizzle** — migrations and Studio matter more than the slight runtime perf win
- **SQLite locally, Postgres in prod** — same schema, flipped by `DATABASE_URL` at deploy time
- **Engine package in TS (not Rust or Go)** — the whole thing is <300 lines of arithmetic; TS is the right fit and means the client can recompute stake splits instantly on a slider change
- **Vitest over Jest** — faster, native ESM, first-class TS
- **Recharts for analytics** — mature, composable, themeable enough; not worth Visx/D3 complexity at this stage
- **Radix primitives, fully restyled** — accessibility free, template look avoided
- **Worker language is Python but worker is NOT built in session 1** — session 1 is the mockup only; worker scaffold and scrapers come in session 2+
- **Excel parity first, improvements second** — port faithfully, then apply the six fixes behind a toggle so Rayan can compare outputs

## Rayan's feedback this session
- Free data only for now — no paid APIs
- Wants automated scraping (Playwright + JSON endpoints), not screenshots
- Will tell me the active promos OR wants auto-login via Playwright on his own session (I'll support both)
- All NY sportsbooks in scope
- Any 2-way market (moneyline, spread, total, 2-way props)
- 5-minute refresh cadence is fine
- Single-user, both local and hosted
- Deep links when supported, browser extension otherwise
- Mockup first with seed data, then real scrapers
- Trusts my stack call
- Added Kelly / bankroll optimization tab
- Added personal analytics tab (all P&L, all history, charts, trends, optimization insights)
- Permission to improve on Excel formulas where I see flaws — "set it up as you like in the prettiest most efficient way possible"
- Explicit design mandate: "become a good designer not just coder"

## Blockers
None.
