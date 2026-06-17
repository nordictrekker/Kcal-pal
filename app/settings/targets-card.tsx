"use client";

import { useState, useTransition } from "react";
import { Target } from "lucide-react";
import { updateTargets, type TargetsResult } from "./targets-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Targets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_oz: number;
  water_mode: "auto" | "manual";
};

const FIELDS: Array<{ name: string; label: string; key: keyof Targets; unit: string }> = [
  { name: "daily_calorie_target",  label: "Calories", key: "calories",  unit: "kcal" },
  { name: "daily_protein_target_g", label: "Protein",  key: "protein_g", unit: "g" },
  { name: "daily_carb_target_g",    label: "Carbs",    key: "carbs_g",   unit: "g" },
  { name: "daily_fat_target_g",     label: "Fat",      key: "fat_g",     unit: "g" },
  { name: "daily_fiber_target_g",   label: "Fiber",    key: "fiber_g",   unit: "g" },
];

export function TargetsCard({ targets }: { targets: Targets }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TargetsResult | null>(null);
  const [waterAuto, setWaterAuto] = useState(targets.water_mode === "auto");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("water_goal_mode", waterAuto ? "auto" : "manual");
    setResult(null);
    start(async () => setResult(await updateTargets(fd)));
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Daily targets</span>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {FIELDS.map((f) => (
              <div key={f.name} className="space-y-1">
                <Label
                  htmlFor={f.name}
                  className="text-xs text-muted-foreground"
                >
                  {f.label} ({f.unit})
                </Label>
                <Input
                  id={f.name}
                  name={f.name}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  defaultValue={targets[f.key]}
                  className="h-9 tabular-nums"
                />
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Daily water</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={waterAuto}
                  onChange={(e) => setWaterAuto(e.target.checked)}
                  className="size-3.5 accent-[var(--macro-carbs)]"
                />
                Auto (weight + activity)
              </label>
            </div>
            {waterAuto ? (
              <p className="text-xs text-muted-foreground">
                Calculated from your body weight and recent activity, and
                updated daily. Drinks like coffee and shakes count too.
              </p>
            ) : (
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label
                    htmlFor="daily_water_target_oz"
                    className="text-xs text-muted-foreground"
                  >
                    Target (oz)
                  </Label>
                  <Input
                    id="daily_water_target_oz"
                    name="daily_water_target_oz"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    defaultValue={targets.water_oz}
                    className="h-9 w-24 tabular-nums"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save targets"}
            </Button>
            {result?.ok ? (
              <span className="text-xs text-muted-foreground">Saved.</span>
            ) : null}
            {result?.error ? (
              <span className="text-xs text-destructive">{result.error}</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
