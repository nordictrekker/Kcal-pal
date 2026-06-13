"use client";

import { useRef, useState, useTransition } from "react";
import { UploadCloud, Loader2, CheckCircle2 } from "lucide-react";
import { importHealthFile, type ImportResult } from "./actions";
import { Button } from "@/components/ui/button";

export function ImportForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setResult(null);
    start(async () => {
      const r = await importHealthFile(fd);
      setResult(r);
    });
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        className="hidden"
        onChange={(e) => {
          setFileName(e.target.files?.[0]?.name ?? null);
          setResult(null);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/40 text-secondary-foreground hover:bg-secondary"
      >
        <UploadCloud className="size-8" />
        <span className="font-medium">
          {fileName ?? "Choose export file"}
        </span>
        <span className="text-xs text-muted-foreground">CSV or JSON</span>
      </button>

      {fileName ? (
        <Button
          type="button"
          className="w-full"
          onClick={submit}
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Importing…
            </>
          ) : (
            "Import"
          )}
        </Button>
      ) : null}

      {result ? (
        result.ok ? (
          <div className="space-y-1 rounded-lg border border-green-600/40 bg-green-600/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-500">
              <CheckCircle2 className="size-4" />
              Imported {result.imported} records
            </div>
            <p className="text-muted-foreground">
              {result.rangeStart && result.rangeEnd
                ? `Spanning ${result.rangeStart} to ${result.rangeEnd}.`
                : "Date range unavailable."}
            </p>
            {result.weightsBackfilled > 0 ? (
              <p className="text-muted-foreground">
                Backfilled {result.weightsBackfilled} body-weight entries.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {result.error}
          </p>
        )
      ) : null}

      <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How to export</p>
        <p>
          In the <span className="font-medium">Health Auto Export</span> app:
          create an export with the metrics you want (body weight, body fat %,
          resting HR, steps, workouts, active energy, VO2 max), choose{" "}
          <span className="font-medium">JSON</span> or aggregated{" "}
          <span className="font-medium">CSV</span>, save the file, then upload
          it here. Re-importing the same range is safe — duplicates are
          skipped.
        </p>
      </div>
    </div>
  );
}
