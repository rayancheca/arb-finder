"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Upload } from "lucide-react";
import { importExcelBets } from "@/app/settings/actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface ImportState {
  readonly tone: "ok" | "err";
  readonly text: string;
  readonly warnings: ReadonlyArray<string>;
}

export function ExcelImport() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, setState] = useState<ImportState | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setState(null);
    startTransition(async () => {
      const res = await importExcelBets(formData);
      if (res.ok) {
        setState({
          tone: "ok",
          text: res.message,
          warnings: res.warnings ?? [],
        });
        form.reset();
        setFileName(null);
      } else {
        setState({
          tone: "err",
          text: res.message,
          warnings: res.warnings ?? [],
        });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      encType="multipart/form-data"
    >
      <div className="rounded-[9px] border border-border bg-surface-sunken p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-text">
              Import historical bets from Excel
            </div>
            <div className="mt-1 text-[11px] text-text-faint">
              Upload your "sportbook calculator" workbook (.xlsx). We read
              the <span className="mono-num text-text-dim">profit tracker</span>{" "}
              and <span className="mono-num text-text-dim">bet365 trade</span>{" "}
              sheets, normalize book names, and write one Bet row per leg.
              The analytics tab updates immediately.
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-[7px] border border-border bg-bg px-3 py-2 text-[11px] font-medium text-text-dim transition-colors hover:border-border-strong hover:text-text",
              isPending && "pointer-events-none opacity-50",
            )}
          >
            <FileUp className="h-3 w-3" />
            {fileName ?? "Choose .xlsx file"}
            <input
              ref={inputRef}
              type="file"
              name="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFileName(f?.name ?? null);
              }}
            />
          </label>

          <Button
            type="submit"
            size="sm"
            variant="primary"
            icon={<Upload className="h-3 w-3" />}
            disabled={isPending || !fileName}
          >
            {isPending ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>

      {state && (
        <div
          className={cn(
            "rounded-[7px] border px-3 py-2 text-[11px]",
            state.tone === "ok"
              ? "border-profit/35 bg-profit-bg text-profit"
              : "border-loss/35 bg-loss-bg text-loss",
          )}
          role="status"
        >
          <div className="font-semibold">{state.text}</div>
          {state.warnings.length > 0 && (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-text-dim">
              {state.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
