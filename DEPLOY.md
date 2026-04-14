# Deploying arb-finder

The web app ships to **Vercel** with a **Neon Postgres** database. The
Python worker ships to **Railway** and writes to the same Neon database.
Both deploys use browser-OAuth — no long-lived access tokens get baked
into source, and you only need to run the CLI from your machine once
per account.

## Step 0 — rotate any secrets you've ever pasted in a chat

If you copy/pasted a Neon connection string anywhere public, **regenerate
the password now** before anything else. Neon console → your project →
Roles → `neondb_owner` → Reset password. Copy the new string; don't
paste it anywhere except your local `.env`.

## Step 1 — Neon Postgres

1. Create a project at [console.neon.tech](https://console.neon.tech)
2. Note both connection strings:
   - **Pooled** (what your app uses at runtime)
   - **Direct** (what Prisma uses for migrations — has no `-pooler`
     in the host)
3. Locally, run the schema push so Neon has all the tables:

```bash
cd /path/to/arb-finder
export DATABASE_URL='postgresql://neondb_owner:...pooled...'
export DIRECT_URL='postgresql://neondb_owner:...direct...'
pnpm --filter web run prisma:push:prod
```

4. (Optional) Seed the production database with the same NBA seed used
   for local dev:

```bash
pnpm --filter web run prisma:generate:prod
pnpm --filter web run seed:prod
```

## Step 2 — Vercel (web app)

```bash
# One-time, from the repo root
npm i -g vercel
vercel login
vercel link      # pick the arb-finder project or create new one
vercel env add DATABASE_URL production   # paste pooled Neon URL
vercel env add DIRECT_URL production     # paste direct Neon URL
vercel --prod                            # deploy
```

The build command is already wired in `vercel.json` — it regenerates
Prisma from `db/schema.postgres.prisma`, pushes the schema (no-op on
subsequent deploys), and builds Next.

## Step 3 — Railway (Python worker)

```bash
# One-time, from apps/worker
npm i -g @railway/cli
railway login
cd apps/worker
railway init
railway up
railway variables set DATABASE_URL='postgresql://...pooled...'
railway variables set BETMGM_ACCESS_ID='...'
railway variables set ARB_POLL_INTERVAL_SECONDS=300
```

Railway picks up the `Dockerfile` automatically. The worker runs
`python -m arb_worker run` on startup and APScheduler handles the cadence.

To enable Phase F scrapers (bet365 / Fanatics / ESPN BET) you'll need to
redeploy with Chromium baked in:

```bash
railway variables set INSTALL_CHROMIUM=1
railway up --dockerfile-args INSTALL_CHROMIUM=1
```

## Step 4 — Wire the scheduler health back to the UI

The worker writes `ScrapeRun` rows on every cycle. Once everything is
deployed, open `/settings` in the web app (Phase G) to see live per-book
health, circuit breaker state, and force-refresh controls.

## Smoke tests

After any deploy, run:

```bash
# Web
curl -s https://<your-project>.vercel.app/ -o /dev/null -w '%{http_code}\n'
curl -s https://<your-project>.vercel.app/api/health -o /dev/null -w '%{http_code}\n'

# Worker (from Railway logs)
railway logs --service arb-worker --tail 40
# Expect a "cycle_done" log every 5 minutes
```

## Rolling back

```bash
vercel rollback              # interactive
railway rollback             # interactive
```
