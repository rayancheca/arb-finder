import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const bookCount = await prisma.book.count();
    return NextResponse.json({
      ok: true,
      service: "arb-finder-web",
      version: process.env.npm_package_version ?? "0.1.0",
      database: "ok",
      books: bookCount,
      elapsed_ms: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        service: "arb-finder-web",
        database: "error",
        error: err instanceof Error ? err.message : "unknown",
        elapsed_ms: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
