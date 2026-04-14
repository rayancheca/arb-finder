/**
 * Seed data for the session-1 mockup. Realistic NBA moneyline markets
 * across 8 NY sportsbooks, three engineered arbitrage opportunities
 * (standard, free-bet, no-sweat), ~120 historical bets spanning 60 days
 * so the Analytics tab has something interesting to render.
 */
import { PrismaClient } from "@prisma/client";
import {
  arbFreeBet,
  arbNoSweat,
  arbStandard,
} from "../packages/engine/src/index.js";

const prisma = new PrismaClient();

const BOOKS = [
  { id: "fd", key: "fanduel", name: "FanDuel", color: "#0f62fe" },
  { id: "dk", key: "draftkings", name: "DraftKings", color: "#53d337" },
  { id: "mgm", key: "betmgm", name: "BetMGM", color: "#c5a46d" },
  { id: "caesars", key: "caesars", name: "Caesars", color: "#d4a857" },
  { id: "b365", key: "bet365", name: "bet365", color: "#027b5b" },
  { id: "br", key: "betrivers", name: "BetRivers", color: "#2a6bbf" },
  { id: "fan", key: "fanatics", name: "Fanatics", color: "#e3273a" },
  { id: "espn", key: "espnbet", name: "ESPN BET", color: "#ff2e3d" },
] as const;

type BookKey = (typeof BOOKS)[number]["id"];

const NBA_GAMES: Array<{
  home: string;
  away: string;
  hoursFromNow: number;
}> = [
  { home: "Boston Celtics", away: "Milwaukee Bucks", hoursFromNow: 5 },
  { home: "Denver Nuggets", away: "Los Angeles Lakers", hoursFromNow: 7 },
  { home: "Phoenix Suns", away: "Golden State Warriors", hoursFromNow: 9 },
  { home: "Miami Heat", away: "Philadelphia 76ers", hoursFromNow: 26 },
  { home: "Oklahoma City Thunder", away: "Dallas Mavericks", hoursFromNow: 28 },
  { home: "New York Knicks", away: "Brooklyn Nets", hoursFromNow: 30 },
  { home: "Minnesota Timberwolves", away: "Sacramento Kings", hoursFromNow: 52 },
  { home: "Cleveland Cavaliers", away: "Orlando Magic", hoursFromNow: 54 },
  { home: "Atlanta Hawks", away: "Chicago Bulls", hoursFromNow: 76 },
  { home: "Houston Rockets", away: "Memphis Grizzlies", hoursFromNow: 78 },
  { home: "Indiana Pacers", away: "Charlotte Hornets", hoursFromNow: 100 },
  { home: "Toronto Raptors", away: "Detroit Pistons", hoursFromNow: 102 },
];

function canonicalKey(home: string, away: string, commence: Date): string {
  const [a, b] = [home, away].sort();
  const day = commence.toISOString().slice(0, 10);
  return `nba|${day}|${a}|${b}`;
}

/** Randomly perturb an odds line by ±N cents to simulate book disagreement */
function jitter(base: number, cents: number): number {
  const delta = Math.round((Math.random() * 2 - 1) * cents);
  const result = base + delta;
  if (result > -100 && result < 100) {
    return result >= 0 ? 100 : -100;
  }
  return result;
}

async function main() {
  console.log("🌱 Seeding...");

  // Clean slate
  await prisma.bet.deleteMany();
  await prisma.bankrollEntry.deleteMany();
  await prisma.arbOpp.deleteMany();
  await prisma.boost.deleteMany();
  await prisma.selection.deleteMany();
  await prisma.market.deleteMany();
  await prisma.event.deleteMany();
  await prisma.book.deleteMany();
  await prisma.sport.deleteMany();

  // Sports
  await prisma.sport.create({
    data: { id: "nba", key: "nba", title: "NBA" },
  });

  // Books
  for (const b of BOOKS) {
    await prisma.book.create({
      data: {
        id: b.id,
        key: b.key,
        name: b.name,
        color: b.color,
        active: true,
      },
    });
  }

  // Events, markets, selections
  const now = Date.now();
  const eventIds: string[] = [];
  for (let i = 0; i < NBA_GAMES.length; i++) {
    const g = NBA_GAMES[i]!;
    const commence = new Date(now + g.hoursFromNow * 60 * 60 * 1000);
    const eventId = `evt_nba_${i}`;
    eventIds.push(eventId);

    await prisma.event.create({
      data: {
        id: eventId,
        sportId: "nba",
        homeTeam: g.home,
        awayTeam: g.away,
        commenceTime: commence,
        canonicalKey: canonicalKey(g.home, g.away, commence),
      },
    });

    // Moneyline market
    const mlId = `mkt_${eventId}_ml`;
    await prisma.market.create({
      data: {
        id: mlId,
        eventId,
        type: "moneyline",
        line: null,
        marketKey: "moneyline",
      },
    });

    // Base lines for this game (consensus)
    const baseHome = -110 - Math.floor(Math.random() * 200);
    const baseAway = Math.abs(baseHome) - 20 + Math.floor(Math.random() * 40);

    for (const b of BOOKS) {
      await prisma.selection.createMany({
        data: [
          {
            id: `sel_${mlId}_${b.id}_home`,
            marketId: mlId,
            bookId: b.id,
            side: "home",
            label: g.home,
            americanOdds: jitter(baseHome, 18),
            maxStake: 2500,
          },
          {
            id: `sel_${mlId}_${b.id}_away`,
            marketId: mlId,
            bookId: b.id,
            side: "away",
            label: g.away,
            americanOdds: jitter(baseAway, 18),
            maxStake: 2500,
          },
        ],
      });
    }

    // Spread and total markets (just two books each, for variety)
    const spId = `mkt_${eventId}_sp`;
    const spreadLine = 3.5 + Math.floor(Math.random() * 6);
    await prisma.market.create({
      data: {
        id: spId,
        eventId,
        type: "spread",
        line: spreadLine,
        marketKey: `spread:${spreadLine}`,
      },
    });
    await prisma.selection.createMany({
      data: [
        {
          id: `sel_${spId}_fd_home`,
          marketId: spId,
          bookId: "fd",
          side: "home",
          label: `${g.home} -${3.5}`,
          americanOdds: -110,
          maxStake: 2000,
        },
        {
          id: `sel_${spId}_dk_away`,
          marketId: spId,
          bookId: "dk",
          side: "away",
          label: `${g.away} +${3.5}`,
          americanOdds: -105,
          maxStake: 2000,
        },
      ],
    });
  }

  // Boosts
  await prisma.boost.createMany({
    data: [
      {
        id: "boost_fd_freebet_25",
        bookId: "fd",
        type: "free_bet",
        title: "$25 free bet",
        description: "NBA moneyline, any game this week",
        amount: 25,
        cashRate: null,
      },
      {
        id: "boost_dk_nosweat_500",
        bookId: "dk",
        type: "no_sweat",
        title: "No-sweat first bet up to $500",
        description: "Refunded as bonus credit if first bet loses",
        amount: 500,
        cashRate: 0.65,
      },
      {
        id: "boost_b365_credit_100",
        bookId: "b365",
        type: "site_credit",
        title: "$100 site credit",
        description: "Any pre-game 2-way market",
        amount: 100,
        cashRate: null,
      },
      {
        id: "boost_mgm_freebet_50",
        bookId: "mgm",
        type: "free_bet",
        title: "$50 free bet token",
        description: "NBA only",
        amount: 50,
        cashRate: null,
      },
    ],
  });

  // Engineered arb opportunities — use the engine to compute them for real
  const arbOpp1 = arbStandard(-340, 520, 250); // 7% standard arb
  const arbOpp2 = arbFreeBet(460, -600, 25, "A"); // free bet conversion
  const arbOpp3 = arbNoSweat(130, -154, 500, 0.65, "A"); // no sweat
  const arbOpp4 = arbStandard(-220, 245, 500); // modest standard arb
  const arbOpp5 = arbStandard(-105, 115, 1000); // small standard arb

  const ev0 = eventIds[0]!;
  const ev1 = eventIds[1]!;
  const ev2 = eventIds[2]!;
  const ev3 = eventIds[3]!;
  const ev4 = eventIds[4]!;

  await prisma.arbOpp.createMany({
    data: [
      {
        id: "arb_1",
        eventId: ev0,
        marketId: `mkt_${ev0}_ml`,
        bookAId: "fd",
        bookBId: "dk",
        boostType: "standard",
        oddsA: -340,
        oddsB: 520,
        sideALabel: "Boston Celtics",
        sideBLabel: "Milwaukee Bucks",
        stakeA: 250,
        stakeB: arbOpp1.legB.stake,
        costBasis: arbOpp1.costBasis,
        guaranteedProfit: arbOpp1.guaranteedMinProfit,
        netReturnPct: arbOpp1.netReturnPct,
      },
      {
        id: "arb_2",
        eventId: ev1,
        marketId: `mkt_${ev1}_ml`,
        bookAId: "fd",
        bookBId: "mgm",
        boostId: "boost_fd_freebet_25",
        boostType: "free_bet",
        oddsA: 460,
        oddsB: -600,
        sideALabel: "Los Angeles Lakers",
        sideBLabel: "Denver Nuggets",
        stakeA: 25,
        stakeB: arbOpp2.legB.stake,
        costBasis: arbOpp2.costBasis,
        guaranteedProfit: arbOpp2.guaranteedMinProfit,
        netReturnPct: arbOpp2.netReturnPct,
      },
      {
        id: "arb_3",
        eventId: ev2,
        marketId: `mkt_${ev2}_ml`,
        bookAId: "dk",
        bookBId: "caesars",
        boostId: "boost_dk_nosweat_500",
        boostType: "no_sweat",
        oddsA: 130,
        oddsB: -154,
        sideALabel: "Golden State Warriors",
        sideBLabel: "Phoenix Suns",
        stakeA: 500,
        stakeB: arbOpp3.legB.stake,
        costBasis: arbOpp3.costBasis,
        guaranteedProfit: arbOpp3.guaranteedMinProfit,
        netReturnPct: arbOpp3.netReturnPct,
      },
      {
        id: "arb_4",
        eventId: ev3,
        marketId: `mkt_${ev3}_ml`,
        bookAId: "b365",
        bookBId: "br",
        boostType: "standard",
        oddsA: -220,
        oddsB: 245,
        sideALabel: "Philadelphia 76ers",
        sideBLabel: "Miami Heat",
        stakeA: 500,
        stakeB: arbOpp4.legB.stake,
        costBasis: arbOpp4.costBasis,
        guaranteedProfit: arbOpp4.guaranteedMinProfit,
        netReturnPct: arbOpp4.netReturnPct,
      },
      {
        id: "arb_5",
        eventId: ev4,
        marketId: `mkt_${ev4}_ml`,
        bookAId: "fan",
        bookBId: "espn",
        boostType: "standard",
        oddsA: -105,
        oddsB: 115,
        sideALabel: "Oklahoma City Thunder",
        sideBLabel: "Dallas Mavericks",
        stakeA: 1000,
        stakeB: arbOpp5.legB.stake,
        costBasis: arbOpp5.costBasis,
        guaranteedProfit: arbOpp5.guaranteedMinProfit,
        netReturnPct: arbOpp5.netReturnPct,
      },
    ],
  });

  // Historical bets — 120 over the past 60 days
  const placements: Array<{
    id: string;
    daysAgo: number;
    bookId: BookKey;
    stake: number;
    result: "won" | "lost" | "void";
    odds: number;
    boost: "standard" | "free_bet" | "no_sweat" | "site_credit";
    tag: string;
  }> = [];

  for (let i = 0; i < 120; i++) {
    const daysAgo = Math.floor(Math.random() * 60);
    const book = BOOKS[Math.floor(Math.random() * BOOKS.length)]!.id;
    const stake = [25, 50, 100, 150, 200, 300, 500, 750, 1000][
      Math.floor(Math.random() * 9)
    ]!;
    const odds = [-400, -250, -180, -130, -110, 105, 140, 190, 260][
      Math.floor(Math.random() * 9)
    ]!;
    const boostRoll = Math.random();
    const boost =
      boostRoll < 0.55
        ? "standard"
        : boostRoll < 0.75
          ? "free_bet"
          : boostRoll < 0.9
            ? "no_sweat"
            : "site_credit";
    // For arbs most bets settle as a winner on one leg; simulate 58% win rate
    // on individual legs with mild variance
    const win = Math.random() < 0.58;
    const result = win ? "won" : "lost";
    placements.push({
      id: `bet_${i}`,
      daysAgo,
      bookId: book,
      stake,
      result,
      odds,
      boost,
      tag: boost === "standard" ? "arb" : "promo",
    });
  }

  for (const p of placements) {
    const decimal = p.odds > 0 ? p.odds / 100 + 1 : 100 / -p.odds + 1;
    const payoutWin =
      p.boost === "free_bet" ? p.stake * (decimal - 1) : p.stake * decimal;
    const profit = p.result === "won" ? payoutWin - p.stake : -p.stake;
    const placedAt = new Date(now - p.daysAgo * 24 * 60 * 60 * 1000);
    const settledAt = new Date(
      placedAt.getTime() + (2 + Math.random() * 5) * 60 * 60 * 1000,
    );
    await prisma.bet.create({
      data: {
        id: p.id,
        bookId: p.bookId,
        side: "home",
        label: "historical",
        americanOdds: p.odds,
        stake: p.stake,
        result: p.result,
        payout: p.result === "won" ? payoutWin : 0,
        profit,
        boostType: p.boost,
        tag: p.tag,
        placedAt,
        settledAt,
      },
    });
  }

  // Bankroll snapshots — one per book, current state
  const bankroll: Record<BookKey, number> = {
    fd: 2400,
    dk: 1850,
    mgm: 3200,
    caesars: 900,
    b365: 1200,
    br: 650,
    fan: 450,
    espn: 300,
  };
  for (const [bookId, balance] of Object.entries(bankroll)) {
    await prisma.bankrollEntry.create({
      data: {
        id: `bk_${bookId}`,
        bookId,
        balance,
        exposed: Math.floor(balance * (Math.random() * 0.25)),
      },
    });
  }

  console.log(
    `✓ Seeded ${BOOKS.length} books, ${NBA_GAMES.length} events, ${placements.length} historical bets`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
