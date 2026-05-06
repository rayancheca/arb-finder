import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'docs/screenshots');
const BASE = 'http://localhost:3000';

async function shot(page, name, caption) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`✓ ${caption} → ${name}`);
  return file;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH
    ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell`
    : undefined,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// 1. Dashboard
await page.goto(BASE);
await shot(page, '01-dashboard.png', '1. Dashboard — ranked arb opportunities');

// 2. Filter interaction
await page.goto(`${BASE}?sport=NBA`);
await shot(page, '02-dashboard-filtered.png', '2. Dashboard filtered by NBA');

// 3. Opportunity detail — click first row
await page.goto(BASE);
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(600);
const firstRow = page.locator('table tbody tr').first();
const hasRows = await firstRow.count();
if (hasRows > 0) {
  await firstRow.click();
  await page.waitForTimeout(1000);
  await shot(page, '03-opp-detail.png', '3. Opportunity detail with stake calculator');
} else {
  // fallback — navigate directly
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/opportunities?limit=1');
    const j = await r.json();
    return j;
  });
  console.log('No rows in table, fetched:', JSON.stringify(res).slice(0, 200));
  await shot(page, '03-opp-detail.png', '3. Dashboard (no clickable row found)');
}

// 4. Search
await page.goto(`${BASE}/search?q=Knicks`);
await shot(page, '04-search-knicks.png', '4. Search results for "Knicks"');

// 5. Search — FanDuel live data
await page.goto(`${BASE}/search?q=Lakers`);
await shot(page, '05-search-lakers.png', '5. Search results for "Lakers" — live FanDuel data');

// 6. Boosts
await page.goto(`${BASE}/boosts`);
await shot(page, '06-boosts.png', '6. Boosts manager — active promos per book');

// 7. Bankroll
await page.goto(`${BASE}/bankroll`);
await shot(page, '07-bankroll.png', '7. Bankroll — Kelly calculator + per-book balances');

// 8. Analytics
await page.goto(`${BASE}/analytics`);
await shot(page, '08-analytics.png', '8. Analytics — P&L dashboard overview');

// 9. Analytics — scroll to charts
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(500);
await shot(page, '09-analytics-charts.png', '9. Analytics — bankroll curve + profit charts');

// 10. Settings
await page.goto(`${BASE}/settings`);
await shot(page, '10-settings.png', '10. Settings panel');

await browser.close();
console.log('\nAll screenshots saved to docs/screenshots/');
