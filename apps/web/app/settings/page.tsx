import { prisma } from "@/lib/db";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { BookChip } from "@/components/ui/BookChip";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { SettingsActions } from "@/components/settings/SettingsActions";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export const dynamic = "force-dynamic";

interface BookHealth {
  readonly bookKey: string;
  readonly name: string;
  readonly color: string;
  readonly lastStatus: string | null;
  readonly lastSuccessAt: Date | null;
  readonly lastError: string | null;
  readonly consecutiveFailures: number;
}

async function fetchBookHealth(): Promise<BookHealth[]> {
  const books = await prisma.book.findMany({ orderBy: { name: "asc" } });
  const out: BookHealth[] = [];

  for (const book of books) {
    const rawRuns = await prisma.scrapeRun.findMany({
      where: { bookKey: book.key },
      orderBy: { startedAt: "desc" },
      take: 10,
    });

    let consecutiveFailures = 0;
    for (const run of rawRuns) {
      if (run.status === "ok") break;
      consecutiveFailures++;
    }
    const lastSuccess = rawRuns.find(
      (r: { status: string }) => r.status === "ok",
    );

    out.push({
      bookKey: book.key,
      name: book.name,
      color: book.color,
      lastStatus: rawRuns[0]?.status ?? null,
      lastSuccessAt: lastSuccess?.finishedAt ?? null,
      lastError: rawRuns[0]?.error ?? null,
      consecutiveFailures,
    });
  }

  return out;
}

export default async function SettingsPage() {
  const books = await fetchBookHealth().catch(() => []);

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <div className="mb-5">
        <h1 className="text-[28px] font-semibold tracking-tighter">
          Settings
        </h1>
        <p className="mt-2 text-[13px] text-text-dim">
          Scraper health, worker cadence, and risk defaults.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SurfaceCard
          title="Scraper health"
          subtitle="Per-book live-cycle status"
          className="lg:col-span-2"
        >
          {books.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-text-faint">
              No scrape runs recorded yet. Start the Python worker to see
              health status here.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {books.map((b) => {
                const ok = b.lastStatus === "ok";
                const statusDot = ok
                  ? "bg-profit"
                  : b.lastStatus == null
                    ? "bg-text-faint"
                    : "bg-loss";
                return (
                  <div
                    key={b.bookKey}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn("h-2 w-2 rounded-full", statusDot)}
                      />
                      <BookChip name={b.name} color={b.color} />
                      {b.consecutiveFailures > 0 && (
                        <span className="text-[10px] uppercase tracking-wider text-loss">
                          {b.consecutiveFailures} consecutive fails
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="mono-num text-[11px] text-text-dim">
                        {b.lastSuccessAt
                          ? `last ok ${formatRelativeTime(b.lastSuccessAt)}`
                          : "never"}
                      </div>
                      {b.lastError && (
                        <div className="mt-0.5 max-w-[480px] truncate text-[10px] text-text-faint">
                          {b.lastError}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard title="Risk defaults" subtitle="Applied to every opp">
          <SettingsActions />
        </SurfaceCard>

        <SurfaceCard title="Appearance">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] text-text">Theme</div>
              <div className="text-[11px] text-text-faint">
                Editorial Terminal · dark default
              </div>
            </div>
            <ThemeToggle />
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
