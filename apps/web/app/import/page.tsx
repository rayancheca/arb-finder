import { ImportClient } from "@/components/import/ImportClient";
import { SurfaceCard } from "@/components/ui/SurfaceCard";

export const metadata = {
  title: "Import history — arb-finder",
};

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-[920px] px-6 py-6">
      <div className="mb-5">
        <h1 className="text-[28px] font-semibold tracking-tighter">
          Import history
        </h1>
        <p className="mt-2 text-[13px] text-text-dim">
          Upload your existing sportbook calculator workbook. The parser
          reads the <em>profit tracker</em> and <em>bet365 trade</em> sheets
          and replaces the seeded demo bets with your real P&amp;L.
        </p>
      </div>

      <SurfaceCard title="Upload" subtitle="XLSX only · up to 10MB">
        <ImportClient />
      </SurfaceCard>

      <SurfaceCard
        title="How the parser works"
        muted
        className="mt-5"
      >
        <ul className="list-disc space-y-1.5 pl-5 text-[12px] text-text-dim">
          <li>
            Scans every worksheet; considers any sheet whose name contains
            <span className="mono-num text-text"> profit tracker </span>
            or <span className="mono-num text-text"> bet365 trade </span>
          </li>
          <li>
            Column detection is fuzzy — searches for headers containing
            <span className="mono-num text-text"> book, stake, odds,
            profit, result, date, boost</span>
          </li>
          <li>
            Book name is normalized (DK → draftkings, CZR → caesars, etc.)
          </li>
          <li>
            Unknown books or rows with missing stake/odds are skipped with
            a warning rather than aborting the whole import
          </li>
          <li>
            Result strings like W / L / Win / Lost are normalized; anything
            unrecognized imports as <em>pending</em>
          </li>
        </ul>
      </SurfaceCard>
    </div>
  );
}
