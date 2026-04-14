"use client";

import { useState, useTransition } from "react";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { importHistoryFromFormData, type ImportResult } from "@/app/import/actions";
import { Button } from "@/components/ui/Button";

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const r = await importHistoryFromFormData(formData);
      setResult(r);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[9px] border-2 border-dashed border-border bg-surface-sunken px-6 py-12 text-center transition-colors hover:border-accent/50 hover:bg-accent-bg">
        <Upload className="h-7 w-7 text-text-faint group-hover:text-accent" />
        <div>
          <div className="text-[13px] font-semibold text-text">
            {file ? file.name : "Click to pick an XLSX file"}
          </div>
          <div className="mt-1 text-[11px] text-text-faint">
            {file
              ? `${(file.size / 1024).toFixed(1)} KB`
              : "Drop or click to select"}
          </div>
        </div>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

      <div className="flex items-center justify-end">
        <Button
          variant="primary"
          type="submit"
          disabled={!file || isPending}
        >
          {isPending ? "Importing…" : "Import history"}
        </Button>
      </div>

      {result && (
        <div className="rounded-[9px] border border-border bg-surface-sunken p-4">
          {result.ok ? (
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-text">
                  Import complete
                </div>
                <div className="mt-1 mono-num text-[12px] text-text-dim">
                  {result.imported} imported · {result.skipped} skipped
                </div>
                {result.sheetsSeen.length > 0 && (
                  <div className="mt-2 text-[11px] text-text-faint">
                    Sheets read: {result.sheetsSeen.join(", ")}
                  </div>
                )}
                {result.warnings.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-[11px] text-text-faint">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
              <div>
                <div className="text-[13px] font-semibold text-loss">
                  Import failed
                </div>
                <div className="mt-1 text-[12px] text-text-dim">
                  {result.error}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
