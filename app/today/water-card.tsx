"use client";

import { useState, useTransition } from "react";
import { Droplet, Undo2 } from "lucide-react";
import { logWater, undoLastWater, type WaterResult } from "./water-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const OZ_TO_ML = 29.5735;
const PRESETS_OZ = [8, 16, 20];

function ozFromMl(ml: number): number {
  return Math.round(ml / OZ_TO_ML);
}

export function WaterCard({
  todayMl,
  targetMl,
}: {
  todayMl: number;
  targetMl: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const todayOz = ozFromMl(todayMl);
  const targetOz = ozFromMl(targetMl);
  const pct = targetMl > 0 ? Math.min(100, (todayMl / targetMl) * 100) : 0;

  function log(oz: number) {
    setError(null);
    const fd = new FormData();
    fd.set("oz", String(oz));
    start(async () => {
      const r: WaterResult = await logWater(fd);
      if (!r.ok) setError(r.error ?? "Couldn't log.");
    });
  }

  function undo() {
    setError(null);
    start(async () => {
      const r = await undoLastWater();
      if (!r.ok) setError(r.error ?? "Couldn't undo.");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplet className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Water</span>
            <span className="font-serif text-2xl font-medium tabular-nums leading-none">
              {todayOz}
            </span>
            <span className="text-xs text-muted-foreground">
              oz / {targetOz} oz
            </span>
          </div>
          {todayMl > 0 ? (
            <button
              type="button"
              onClick={undo}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="Undo last"
            >
              <Undo2 className="size-4" />
            </button>
          ) : null}
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          aria-label={`${todayOz} of ${targetOz} ounces`}
        >
          <div
            className="h-full rounded-full bg-[var(--macro-carbs)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex gap-2">
          {PRESETS_OZ.map((oz) => (
            <Button
              key={oz}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => log(oz)}
              disabled={pending}
              className="flex-1"
            >
              +{oz} oz
            </Button>
          ))}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
