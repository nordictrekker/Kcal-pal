"use client";

import { useState, useTransition } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { syncOura, type SyncResult } from "./sync-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type OuraSnapshot = {
  date: string;
  sleep_score: number | null;
  hrv_avg: number | null;
  readiness_score: number | null;
} | null;

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit?: string;
}) {
  return (
    <div className="text-center">
      <div className="text-2xl font-semibold tabular-nums">
        {value === null || value === undefined
          ? "—"
          : Math.round(Number(value))}
      </div>
      <div className="text-xs text-muted-foreground">
        {label}
        {unit ? ` (${unit})` : ""}
      </div>
    </div>
  );
}

export function OuraCard({ data }: { data: OuraSnapshot }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);

  function handleSync() {
    start(async () => {
      const r = await syncOura();
      setResult(r);
    });
  }

  return (
    <Card>
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
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Sleep" value={data.sleep_score} />
            <Stat label="HRV" value={data.hrv_avg} unit="ms" />
            <Stat label="Readiness" value={data.readiness_score} />
          </div>
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
