"use client";

import { useState, useTransition } from "react";
import { Droplet, Undo2 } from "lucide-react";
import { logWater, undoLastWater, type WaterResult } from "./water-actions";
import {
  BEVERAGES,
  mlToOz,
  mlToL,
  formatDual,
  type BeverageKind,
} from "@/lib/hydration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PRESETS_OZ = [8, 16, 20];
// Quick beverages beyond plain water; each logs its typical serving.
const BEVERAGE_BUTTONS: BeverageKind[] = ["coffee", "tea", "shake"];

export function WaterCard({
  loggedMl,
  autoFluidMl,
  targetMl,
  goalNote,
}: {
  loggedMl: number;
  autoFluidMl: number;
  targetMl: number;
  goalNote?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState<"now" | "earlier">("now");

  const totalMl = loggedMl + autoFluidMl;
  const totalOz = mlToOz(totalMl);
  const targetOz = mlToOz(targetMl);
  const pct = targetMl > 0 ? Math.min(100, (totalMl / targetMl) * 100) : 0;

  function submit(fields: Record<string, string>) {
    setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fd.set("when", when);
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
          <div className="flex items-baseline gap-2">
            <Droplet className="size-4 translate-y-0.5 text-muted-foreground" />
            <span className="text-sm font-medium">Water</span>
            <span className="font-serif text-2xl font-medium tabular-nums leading-none">
              {totalOz}
            </span>
            <span className="text-xs text-muted-foreground">
              / {targetOz} oz · {mlToL(totalMl).toFixed(1)}/
              {mlToL(targetMl).toFixed(1)} L
            </span>
          </div>
          {loggedMl > 0 ? (
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
          aria-label={`${totalOz} of ${targetOz} ounces`}
        >
          <div
            className="h-full rounded-full bg-[var(--macro-carbs)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {autoFluidMl > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Includes {formatDual(autoFluidMl)} from drinks logged with meals.
          </p>
        ) : null}

        {/* Just now / Earlier — controls how a new log is timed so the
            insight knows a fresh glass from a backfill. */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Logging:</span>
          <div className="inline-flex overflow-hidden rounded-md border">
            {(["now", "earlier"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWhen(w)}
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  when === w
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {w === "now" ? "Just now" : "Earlier"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {PRESETS_OZ.map((oz) => (
            <Button
              key={oz}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => submit({ oz: String(oz), kind: "water" })}
              disabled={pending}
              className="flex-1"
            >
              +{oz} oz
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          {BEVERAGE_BUTTONS.map((kind) => {
            const b = BEVERAGES[kind];
            return (
              <Button
                key={kind}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  submit({ ml: String(b.defaultMl), kind })
                }
                disabled={pending}
                className="flex-1 text-muted-foreground"
              >
                +{b.label} ({mlToOz(b.defaultMl)} oz)
              </Button>
            );
          })}
        </div>

        {goalNote ? (
          <p className="text-[11px] text-muted-foreground">{goalNote}</p>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
