# arb-worker

Python 3.12 worker for arb-finder. Polls every supported NY sportsbook on a
5-minute cadence, normalizes the selections, matches events across books via
a canonical-key hasher, persists everything to the same SQLite (or Postgres)
database the Next.js app reads, and recomputes the `ArbOpp` table after every
cycle.

## Architecture

```
arb_worker/
├── cli.py                 # `python -m arb_worker` entry
├── config.py              # env loading, database URL, book registry
├── db.py                  # sqlite3 / psycopg connection + raw upsert helpers
├── logging_setup.py       # structlog config
├── scheduler.py           # APScheduler orchestration + circuit breaker
├── pipeline/
│   ├── run_cycle.py       # end-to-end: scrape → match → persist → recompute
│   └── recompute_arbs.py  # arb engine invocation + ArbOpp upsert
├── matcher/
│   ├── canonical.py       # team-name normalization + canonical hashing
│   └── event_matcher.py   # ±15 min fuzzy time match + review queue writes
└── scrapers/
    ├── base.py            # Scraper ABC + circuit breaker + retry wrapper
    ├── draftkings.py
    ├── fanduel.py
    ├── betmgm.py
    ├── caesars.py
    └── betrivers.py
```

## Running

```bash
cd apps/worker
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
playwright install chromium   # only needed for bet365/Fanatics/ESPN BET in Phase F

# One-shot cycle
python -m arb_worker cycle

# Scheduled mode — runs every 5 minutes
python -m arb_worker run
```

## Environment

The worker reads `DATABASE_URL` from the repo root `.env` (same file the
Next.js app uses). For local dev that points at the shared SQLite file; in
prod it points at Neon Postgres. The SQL it emits is intentionally portable
(parameterized inserts, `INSERT OR REPLACE` / `ON CONFLICT` branches).

## Circuit breaker

Every scrape cycle writes a row to `ScrapeRun`. If a book fails three cycles
in a row, subsequent cycles skip that book for 15 minutes (exponential
backoff, capped at 1 hour). Status is exposed to the UI via the Settings
page once Phase G lands.
