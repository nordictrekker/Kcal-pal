"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  reanalyzeOne,
  type ReanalyzeTarget,
  type ReanalyzeOneResult,
} from "./actions";

const MICRO_LABELS: Record<string, string> = {
  fiber_g: "Fiber",
  iron_mg: "Iron",
  calcium_mg: "Calcium",
  magnesium_mg: "Mag",
  vitamin_d_mcg: "Vit D",
  saturated_fat_g: "Sat fat",
  trans_fat_g: "Trans fat",
  cholesterol_mg: "Cholesterol",
  omega3_mg: "Omega-3",
  folate_mcg: "Folate",
  choline_mg: "Choline",
  iodine_mcg: "Iodine",
};

function round(n: number | null): string {
  return n == null ? "—" : String(Math.round(n * 10) / 10);
}

// How many micros went from "nothing" to a real value.
function filledCount(r: Extract<ReanalyzeOneResult, { ok: true }>): number {
  return Object.keys(MICRO_LABELS).filter(
    (f) => (r.before[f] == null || r.before[f] === 0) && (r.after[f] ?? 0) > 0,
  ).length;
}

export function ReanalyzePanel({ targets }: { targets: ReanalyzeTarget[] }) {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<ReanalyzeOneResult[]>([]);

  async function run() {
    setStatus("running");
    setResults([]);
    setDone(0);
    for (const t of targets) {
      // Sequential so each is its own request (no long-running function) and the
      // estimates stay consistent with the user's other logs.
      const r = await reanalyzeOne(t.id);
      setResults((prev) => [...prev, r]);
      setDone((d) => d + 1);
    }
    setStatus("done");
  }

  const ok = results.filter(
    (r): r is Extract<ReanalyzeOneResult, { ok: true }> => r.ok,
  );
  const gainedMicros = ok.filter((r) => filledCount(r) > 0).length;
  const gainedComponents = ok.filter(
    (r) => !r.componentsBefore && r.componentsAfter > 0,
  ).length;
  const pct = targets.length ? Math.round((done / targets.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <p className="text-sm">
          Reprocesses each of your{" "}
          <span className="font-medium">{targets.length}</span> logs through the
          current pipeline (Claude + USDA), filling in micronutrients and giving
          every component its own breakdown. Your totals may shift slightly.
        </p>
        {status === "idle" ? (
          <Button className="mt-3 w-full" onClick={run} disabled={targets.length === 0}>
            Re-analyze all {targets.length} logs
          </Button>
        ) : null}

        {status !== "idle" ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {status === "running" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4 text-[var(--macro-fiber)]" />
                )}
                {status === "running"
                  ? `Re-analyzing… ${done}/${targets.length}`
                  : `Done — ${done} logs re-analyzed`}
              </span>
              <span className="tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {status === "done" ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-3">
            <p className="font-serif text-2xl tabular-nums">{gainedMicros}</p>
            <p className="text-xs text-muted-foreground">
              logs that now have micros they were missing
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="font-serif text-2xl tabular-nums">{gainedComponents}</p>
            <p className="text-xs text-muted-foreground">
              logs that gained true per-component micros
            </p>
          </div>
        </div>
      ) : null}

      {results.length > 0 ? (
        <ul className="divide-y rounded-lg border text-sm">
          {results.map((r, i) => (
            <li key={i} className="space-y-1 p-3">
              {r.ok ? (
                <>
                  <p className="truncate font-medium">
                    {r.description.split("\n")[0]}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {Object.entries(MICRO_LABELS).map(([f, label]) => {
                      const b = r.before[f];
                      const a = r.after[f];
                      const changed = round(b) !== round(a);
                      if (!changed) return null;
                      return (
                        <span key={f} className="tabular-nums">
                          {label} {round(b)}→
                          <span className="text-foreground">{round(a)}</span>
                        </span>
                      );
                    })}
                    {r.componentsAfter > 0 ? (
                      <span className="text-[var(--macro-fiber)]">
                        {r.componentsAfter} components ✓
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-xs text-destructive">Failed: {r.error}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
