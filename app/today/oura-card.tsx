"use client";

import { useState, useTransition } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { syncOura, type SyncResult } from "./sync-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type OuraSnapshot = {
  date: string;
  sleep_score: number | null;
  hrv_avg: number | null;
  readiness_score: number | null;
  resilience_level: string | null;
  stress_high_min: number | null;
} | null;

// Oura resilience: accumulated capacity to handle stress, building over
// weeks of recovery. Worth surfacing warmly — it's a slower, steadier
// signal than day-to-day readiness.
const RESILIENCE_COPY: Record<string, string> = {
  limited: "building back",
  adequate: "steady",
  solid: "solid",
  strong: "strong",
  exceptional: "exceptional",
};

function fmtStress(min: number | null): string | null {
  if (min == null) return null;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

// 85+ → vibrant; 70–84 → neutral; <70 → invite rest.
type ReadinessBand = "high" | "mid" | "low" | "unknown";
function bandFor(score: number | null): ReadinessBand {
  if (score === null) return "unknown";
  if (score >= 85) return "high";
  if (score >= 70) return "mid";
  return "low";
}

function readinessVibe(band: ReadinessBand): string | null {
  switch (band) {
    case "high": return "Feeling strong today.";
    case "low":  return "Lean into recovery — protein, fiber, sleep.";
    default:     return null;
  }
}

function Stat({
  label,
  value,
  unit,
  emphasized,
}: {
  label: string;
  value: number | null;
  unit?: string;
  emphasized?: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "font-serif text-3xl font-medium tabular-nums leading-none",
          emphasized && "text-primary",
        )}
      >
        {value === null || value === undefined
          ? "—"
          : Math.round(Number(value))}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {label}
        {unit ? ` (${unit})` : ""}
      </div>
    </div>
  );
}

export function OuraCard({ data }: { data: OuraSnapshot }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);
  const band = bandFor(data?.readiness_score ?? null);
  const vibe = readinessVibe(band);

  function handleSync() {
    start(async () => {
      const r = await syncOura();
      setResult(r);
    });
  }

  return (
    <Card
      className={cn(
        "transition-shadow",
        band === "high" &&
          "shadow-[0_0_0_1px_var(--ring),0_8px_24px_-12px_color-mix(in_oklch,var(--primary)_40%,transparent)]",
      )}
    >
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Oura</span>
            {data ? (
              <span className="text-xs text-muted-foreground">
                {data.date}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={pending}
          >
            <RefreshCw
              className={pending ? "size-4 animate-spin" : "size-4"}
            />
            <span className="ml-1">{pending ? "Syncing…" : "Sync now"}</span>
          </Button>
        </div>

        {data ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Sleep" value={data.sleep_score} />
              <Stat label="HRV" value={data.hrv_avg} unit="ms" />
              <Stat
                label="Readiness"
                value={data.readiness_score}
                emphasized={band === "high"}
              />
            </div>
            {(data.resilience_level &&
              RESILIENCE_COPY[data.resilience_level]) ||
            data.stress_high_min != null ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                {data.resilience_level &&
                RESILIENCE_COPY[data.resilience_level] ? (
                  <span>
                    Resilience:{" "}
                    <span className="font-medium text-foreground">
                      {RESILIENCE_COPY[data.resilience_level]}
                    </span>
                  </span>
                ) : null}
                {data.stress_high_min != null ? (
                  <span>
                    Daytime stress:{" "}
                    <span className="font-medium text-foreground">
                      {fmtStress(data.stress_high_min)}
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}
            {vibe ? (
              <p className="text-xs text-muted-foreground">{vibe}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Oura data yet. Tap Sync now to pull the last 7 days.
          </p>
        )}

        {result ? (
          result.ok ? (
            <p className="text-xs text-muted-foreground">
              Synced {result.daysSynced} day{result.daysSynced === 1 ? "" : "s"}.
            </p>
          ) : (
            <p className="text-xs text-destructive">{result.error}</p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
