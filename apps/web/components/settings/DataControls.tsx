"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Trash2, Zap } from "lucide-react";
import {
  clearDemoBets,
  recomputeArbs,
  regenerateDemoBets,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/Button";

type ActionKey = "regenerate" | "clear" | "recompute";

export function DataControls() {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [message, setMessage] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

  function run(key: ActionKey, fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(key);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setBusy(null);
      setMessage({
        tone: result.ok ? "ok" : "err",
        text: result.message,
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[9px] border border-border bg-surface-sunken p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-text">
              Regenerate demo bets
            </div>
            <div className="mt-1 text-[11px] text-text-faint">
              Wipes the last-60-days bet history and rolls 120 fresh random
              bets. Use when the analytics charts feel stale or you want a
              new scenario to explore.
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            icon={<RefreshCw className="h-3 w-3" />}
            disabled={isPending}
            onClick={() => run("regenerate", regenerateDemoBets)}
          >
            {busy === "regenerate" ? "Rolling…" : "Regenerate"}
          </Button>
        </div>
      </div>

      <div className="rounded-[9px] border border-border bg-surface-sunken p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-text">
              Recompute arbs from live selections
            </div>
            <div className="mt-1 text-[11px] text-text-faint">
              Reads every <code className="mono-num text-text-dim">Selection</code>{" "}
              in the DB, pairs home × away across books, and writes fresh
              <code className="mono-num text-text-dim"> ArbOpp</code> rows. Run
              this after the Python worker finishes a scrape cycle and you want
              the UI to reflect the new lines without waiting for the 5-minute poll.
            </div>
          </div>
          <Button
            size="sm"
            variant="profit"
            icon={<Zap className="h-3 w-3" />}
            disabled={isPending}
            onClick={() => run("recompute", recomputeArbs)}
          >
            {busy === "recompute" ? "Computing…" : "Recompute"}
          </Button>
        </div>
      </div>

      <div className="rounded-[9px] border border-loss/20 bg-loss-bg/40 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-text">
              Clear all demo bets
            </div>
            <div className="mt-1 text-[11px] text-text-faint">
              Deletes every bet row. Analytics will render empty states.
              Intended as the first step before importing your real history
              from a spreadsheet later.
            </div>
          </div>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 className="h-3 w-3" />}
            disabled={isPending}
            onClick={() => {
              if (confirm("Delete ALL demo bets? This cannot be undone.")) {
                run("clear", clearDemoBets);
              }
            }}
          >
            {busy === "clear" ? "Clearing…" : "Clear"}
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-[7px] border px-3 py-2 text-[11px] ${
            message.tone === "ok"
              ? "border-profit/35 bg-profit-bg text-profit"
              : "border-loss/35 bg-loss-bg text-loss"
          }`}
          role="status"
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
