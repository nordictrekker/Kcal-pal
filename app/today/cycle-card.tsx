"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, Droplet } from "lucide-react";
import { PHASES, phaseForCycleDay, type Phase } from "@/lib/cycle";
import { saveCycleDay } from "./cycle-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CycleSnapshot = {
  // today = manual entry for today; auto = derived from last period start
  // (Apple Health); predicted = projected from an older manual entry.
  day: number | null;
  phase: Phase | null;
  source: "today" | "auto" | "predicted" | "empty";
};

const PHASE_LABEL: Record<Phase, string> = {
  menstrual: "Menstrual",
  follicular: "Follicular",
  ovulatory: "Ovulatory",
  luteal: "Luteal",
};

export function CycleCard({ initial }: { initial: CycleSnapshot }) {
  const [day, setDay] = useState<number | null>(initial.day);
  const [phase, setPhase] = useState<Phase | null>(initial.phase);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedFromPrediction, setSavedFromPrediction] = useState(false);

  function commit(nextDay: number, nextPhase: Phase) {
    setDay(nextDay);
    setPhase(nextPhase);
    setError(null);
    start(async () => {
      const r = await saveCycleDay({ day: nextDay, phase: nextPhase });
      if (!r.ok) setError(r.error ?? "Save failed");
      else setSavedFromPrediction(true);
    });
  }

  function step(delta: number) {
    const base = day ?? 0;
    const next = Math.max(1, Math.min(99, base + delta));
    commit(next, phaseForCycleDay(next));
  }

  function pickPhase(p: Phase) {
    const base = day ?? 1;
    commit(base, p);
  }

  const showPredictedHint =
    initial.source === "predicted" && !savedFromPrediction && !pending;
  const showAutoHint =
    initial.source === "auto" && !savedFromPrediction && !pending;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Droplet className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Cycle</span>
          {showAutoHint ? (
            <span className="text-xs text-muted-foreground">
              auto-tracked · adjust to override
            </span>
          ) : null}
          {showPredictedHint ? (
            <span className="text-xs text-muted-foreground">
              predicted — tap to confirm
            </span>
          ) : null}
          {pending ? (
            <span className="text-xs text-muted-foreground">saving…</span>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => step(-1)}
            aria-label="Decrement"
            disabled={day !== null && day <= 1}
          >
            <Minus className="size-4" />
          </Button>
          <div className="flex-1 text-center">
            <div className="text-3xl font-semibold tabular-nums">
              {day === null ? "—" : day}
            </div>
            <div className="text-xs text-muted-foreground">Day</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => step(1)}
            aria-label="Increment"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {PHASES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => pickPhase(p)}
              className={cn(
                "rounded-md border px-2 py-2 text-xs capitalize transition-colors",
                p === phase
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {PHASE_LABEL[p]}
            </button>
          ))}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
