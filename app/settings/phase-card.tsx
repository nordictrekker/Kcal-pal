"use client";

import { useState, useTransition } from "react";
import { Activity, RotateCcw } from "lucide-react";
import { updatePhaseModifiers } from "./phase-actions";
import {
  DEFAULT_PHASE_MODIFIERS,
  type PhaseModifiers,
  type PhaseMultipliers,
} from "@/lib/phase-modifiers";
import type { Phase } from "@/lib/cycle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PHASES: Phase[] = ["menstrual", "follicular", "ovulatory", "luteal"];
const PHASE_LABEL: Record<Phase, string> = {
  menstrual: "Menstrual",
  follicular: "Follicular",
  ovulatory: "Ovulatory",
  luteal: "Luteal",
};

const COLS: Array<{ key: keyof PhaseMultipliers; label: string }> = [
  { key: "calories", label: "kcal" },
  { key: "protein",  label: "P" },
  { key: "carbs",    label: "C" },
  { key: "fat",      label: "F" },
  { key: "fiber",    label: "Fib" },
];

// Display as percentages (1.05 ↔ "105"). Keep the storage as a multiplier.
function toPct(mult: number): string {
  return String(Math.round(mult * 100));
}
function fromPct(pct: string): number {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 1;
  return Math.max(50, Math.min(150, n)) / 100;
}

export function PhaseModifiersCard({
  initial,
}: {
  initial: PhaseModifiers;
}) {
  const [mods, setMods] = useState<PhaseModifiers>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setCell(phase: Phase, key: keyof PhaseMultipliers, pct: string) {
    setSaved(false);
    setMods((prev) => ({
      ...prev,
      [phase]: { ...prev[phase], [key]: fromPct(pct) },
    }));
  }

  function reset() {
    setMods({ ...DEFAULT_PHASE_MODIFIERS });
    setSaved(false);
  }

  function submit() {
    setErr(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("modifiers", JSON.stringify(mods));
    start(async () => {
      const r = await updatePhaseModifiers(fd);
      if (r.ok) setSaved(true);
      else setErr(r.error ?? "Save failed");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Cycle-phase nutrition</span>
        </div>
        <p className="text-xs text-muted-foreground">
          % of your base targets to apply per phase. 100 = no change.
          Defaults follow common patterns; tune to your body.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal">Phase</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-1 text-right font-normal">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PHASES.map((phase) => (
                <tr key={phase}>
                  <td className="py-1 pr-2 text-sm capitalize">
                    {PHASE_LABEL[phase]}
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-1 py-1">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={50}
                        max={150}
                        step={1}
                        value={toPct(mods[phase][c.key])}
                        onChange={(e) =>
                          setCell(phase, c.key, e.target.value)
                        }
                        className="h-8 w-14 px-1 text-right tabular-nums"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={pending}
          >
            <RotateCcw className="mr-1 size-4" /> Reset to defaults
          </Button>
          {saved ? (
            <span className="text-xs text-muted-foreground">Saved.</span>
          ) : null}
          {err ? (
            <span className="text-xs text-destructive">{err}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
