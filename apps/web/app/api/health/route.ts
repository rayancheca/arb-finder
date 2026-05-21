import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STALE_MS = 15 * 60 * 1000; // 15 minutes
const ENGINE_LOOKBACK_MS = 60 * 60 * 1000; // 1 hour

type BookHealth = {
  key: string;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  stale: boolean;
};

type HealthResponse = {
  status: "ok" | "degraded" | "broken";
  checkedAt: string;
  db: { read: boolean; write: boolean; latencyMs: number };
  books: BookHealth[];
  engine: { arbsLastHour: number; lastComputedAt: string | null };
};

function isPeakWindowET(now: Date): boolean {
  // 10:00–01:00 ET. America/New_York is UTC-5 (EST) or UTC-4 (EDT).
  // We approximate with the Intl API rather than pull in a tz library.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  });
  const hour = Number(fmt.format(now));
  return hour >= 10 || hour < 1;
}

async function probeRead(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function probeWrite(): Promise<boolean> {
  const id = randomUUID();
  try {
    await prisma.healthProbe.create({ data: { id } });
    await prisma.healthProbe.delete({ where: { id } });
    return true;
  } catch {
    // Best-effort cleanup in case create succeeded but delete didn't.
    try {
      await prisma.healthProbe.delete({ where: { id } });
    } catch {
      // swallow — generic error, don't leak driver details
    }
    return false;
  }
}

async function bookHealth(now: Date): Promise<BookHealth[]> {
  try {
    const books = await prisma.book.findMany({
      where: { active: true },
      select: { key: true },
      orderBy: { key: "asc" },
    });
    if (books.length === 0) return [];

    const okRows = await prisma.scrapeRun.groupBy({
      by: ["bookKey"],
      where: { status: "ok" },
      _max: { finishedAt: true },
    });
    const errRows = await prisma.scrapeRun.groupBy({
      by: ["bookKey"],
      where: { status: "error" },
      _max: { startedAt: true },
    });

    const okMap = new Map<string, Date | null>(
      okRows.map((r) => [r.bookKey, r._max.finishedAt ?? null]),
    );
    const errMap = new Map<string, Date | null>(
      errRows.map((r) => [r.bookKey, r._max.startedAt ?? null]),
    );

    return books.map((b) => {
      const lastOk = okMap.get(b.key) ?? null;
      const lastErr = errMap.get(b.key) ?? null;
      const stale = lastOk === null || now.getTime() - lastOk.getTime() > STALE_MS;
      return {
        key: b.key,
        lastOkAt: lastOk ? lastOk.toISOString() : null,
        lastErrorAt: lastErr ? lastErr.toISOString() : null,
        stale,
      };
    });
  } catch {
    return [];
  }
}

async function engineHealth(now: Date): Promise<{
  arbsLastHour: number;
  lastComputedAt: string | null;
}> {
  try {
    const cutoff = new Date(now.getTime() - ENGINE_LOOKBACK_MS);
    const [count, latest] = await Promise.all([
      prisma.arbOpp.count({ where: { computedAt: { gt: cutoff } } }),
      prisma.arbOpp.findFirst({
        orderBy: { computedAt: "desc" },
        select: { computedAt: true },
      }),
    ]);
    return {
      arbsLastHour: count,
      lastComputedAt: latest?.computedAt ? latest.computedAt.toISOString() : null,
    };
  } catch {
    return { arbsLastHour: 0, lastComputedAt: null };
  }
}

export async function GET() {
  const now = new Date();
  const started = Date.now();

  const read = await probeRead();
  const write = await probeWrite();
  const latencyMs = Date.now() - started;

  const [books, engine] = await Promise.all([bookHealth(now), engineHealth(now)]);

  const enabledBooks = books;
  const allStale = enabledBooks.length > 0 && enabledBooks.every((b) => b.stale);
  const anyStale = enabledBooks.some((b) => b.stale);
  const peak = isPeakWindowET(now);
  const noArbsDuringPeak = peak && engine.arbsLastHour === 0;

  let status: HealthResponse["status"];
  if (!write || allStale) {
    status = "broken";
  } else if (anyStale || noArbsDuringPeak) {
    status = "degraded";
  } else {
    status = "ok";
  }

  const payload: HealthResponse = {
    status,
    checkedAt: now.toISOString(),
    db: { read, write, latencyMs },
    books,
    engine,
  };

  return NextResponse.json(payload, { status: status === "broken" ? 503 : 200 });
}
