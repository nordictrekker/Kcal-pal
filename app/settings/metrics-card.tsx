"use client";

import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import { updateVisibleMetrics } from "./metrics-actions";
import { METRICS, ALL_METRIC_KEYS, type MetricKey } from "@/lib/nutrients";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Choose which nutrient bars appear on the home calorie card. The food-log
// page always shows the full breakdown.
export function MetricsCard({ initial }: { initial: MetricKey[] }) {
  const [selected, setSelected] = useState<Set<MetricKey>>(new Set(initial));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const toggle = (k: MetricKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const macros = ALL_METRIC_KEYS.filter((k) => METRICS[k].category === "macro");
  const micros = ALL_METRIC_KEYS.filter((k) => METRICS[k].category === "micro");

  function save() {
    setSaved(false);
    start(async () => {
      const r = await updateVisibleMetrics([...selected]);
      if (r.ok) setSaved(true);
    });
  }

  const Chip = ({ k }: { k: MetricKey }) => (
    <button
      type="button"
      onClick={() => {
        toggle(k);
        setSaved(false);
      }}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs transition-colors",
        selected.has(k)
          ? "border-primary bg-primary/10 font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={selected.has(k)}
    >
      {METRICS[k].label}
    </button>
  );

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Home screen metrics</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Pick what shows under your calories on Today. The full breakdown —
          including micronutrients — is always on the food-log page.
        </p>
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Macros
          </p>
          <div className="flex flex-wrap gap-1.5">
            {macros.map((k) => (
              <Chip key={k} k={k} />
            ))}
          </div>
          <p className="pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Micronutrients
          </p>
          <div className="flex flex-wrap gap-1.5">
            {micros.map((k) => (
              <Chip key={k} k={k} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {saved ? (
            <span className="text-xs text-muted-foreground">Saved.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
