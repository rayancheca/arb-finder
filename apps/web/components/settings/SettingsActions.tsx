"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface SettingsState {
  slippageBufferCents: number;
  kellyFraction: number; // 0..1 (¼=0.25, ½=0.5, full=1)
  minNetReturnPct: number;
}

const DEFAULT: SettingsState = {
  slippageBufferCents: 3,
  kellyFraction: 0.25,
  minNetReturnPct: 0.01,
};

const STORAGE_KEY = "arb-finder:settings:v1";

function loadSettings(): SettingsState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<SettingsState> & {
      webhookSlackUrl?: unknown;
      webhookDiscordUrl?: unknown;
    };
    // Drop any legacy webhook fields that may still be persisted in
    // localStorage from a prior version. Webhooks are env-only now.
    const {
      webhookSlackUrl: _legacySlack,
      webhookDiscordUrl: _legacyDiscord,
      ...safe
    } = parsed;
    return { ...DEFAULT, ...safe };
  } catch {
    return DEFAULT;
  }
}

function saveSettings(s: SettingsState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function SettingsActions() {
  const [state, setState] = useState<SettingsState>(DEFAULT);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setState(loadSettings());
  }, []);

  function update<K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) {
    const next = { ...state, [key]: value };
    setState(next);
    saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div className="flex flex-col gap-4">
      <Row
        label="Slippage buffer"
        hint="Cents subtracted from every theoretical edge before the row hits the dashboard"
      >
        <input
          type="number"
          min={0}
          max={20}
          value={state.slippageBufferCents}
          onChange={(e) =>
            update("slippageBufferCents", Number(e.target.value))
          }
          className="mono-num w-20 rounded-md border border-border bg-surface-raised px-2 py-1 text-[12px] text-right"
        />
        <span className="text-[10px] text-text-faint">¢</span>
      </Row>

      <Row
        label="Kelly fraction"
        hint="Stake size as a fraction of full Kelly. ¼ is the safest sane default."
      >
        <select
          value={state.kellyFraction}
          onChange={(e) => update("kellyFraction", Number(e.target.value))}
          className="rounded-md border border-border bg-surface-raised px-2 py-1 text-[12px]"
        >
          <option value={0.25}>¼ Kelly</option>
          <option value={0.5}>½ Kelly</option>
          <option value={0.75}>¾ Kelly</option>
          <option value={1}>Full Kelly</option>
        </select>
      </Row>

      <Row
        label="Minimum net return"
        hint="Hide any opportunity below this threshold"
      >
        <input
          type="number"
          step={0.005}
          min={0}
          max={0.5}
          value={state.minNetReturnPct}
          onChange={(e) =>
            update("minNetReturnPct", Number(e.target.value))
          }
          className="mono-num w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-[12px] text-right"
        />
        <span className="text-[10px] text-text-faint">
          {(state.minNetReturnPct * 100).toFixed(1)}%
        </span>
      </Row>

      <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
        <div className="text-[10px] uppercase tracking-[0.08em] text-text-dim">
          Notification webhooks
        </div>
        <p className="text-[11px] leading-relaxed text-text-faint">
          Webhook URLs are configured via{" "}
          <code className="mono-num text-text-dim">SLACK_WEBHOOK_URL</code> /{" "}
          <code className="mono-num text-text-dim">DISCORD_WEBHOOK_URL</code>{" "}
          env vars on the worker. They are no longer stored in the browser —
          full URLs contain a secret and must not live in localStorage.
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-4">
        <span
          className={`text-[11px] transition-opacity ${saved ? "opacity-100 text-profit" : "opacity-0"}`}
        >
          Saved
        </span>
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            if (confirm("Reset all settings to defaults?")) {
              saveSettings(DEFAULT);
              setState(DEFAULT);
            }
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="text-[12px] text-text">{label}</div>
        {hint && <div className="mt-0.5 text-[10px] text-text-faint">{hint}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
