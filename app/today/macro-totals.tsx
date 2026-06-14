import { Card, CardContent } from "@/components/ui/card";
import type { Totals } from "@/lib/food";

function round(n: number) {
  return Math.round(n);
}

function Bar({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {round(value)}
          {unit} / {target}
          {unit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={over ? "h-full bg-destructive" : "h-full bg-primary"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function MacroTotals({
  totals,
  targets,
  phaseAdjustment,
}: {
  totals: Totals;
  targets: Totals;
  // Optional "+5% kcal, +15% fat, -10% carbs" hint shown when targets
  // have been adjusted for the current cycle phase.
  phaseAdjustment?: { phase: string; description: string } | null;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums">
            {round(totals.calories)}
          </span>
          <span className="text-sm text-muted-foreground">
            of {targets.calories} kcal
          </span>
        </div>
        {phaseAdjustment ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            <span className="capitalize">{phaseAdjustment.phase}</span>:{" "}
            {phaseAdjustment.description}
          </p>
        ) : null}
        <div className="space-y-3">
          <Bar
            label="Protein"
            value={totals.protein_g}
            target={targets.protein_g}
            unit="g"
          />
          <Bar
            label="Carbs"
            value={totals.carbs_g}
            target={targets.carbs_g}
            unit="g"
          />
          <Bar label="Fat" value={totals.fat_g} target={targets.fat_g} unit="g" />
          <Bar
            label="Fiber"
            value={totals.fiber_g}
            target={targets.fiber_g}
            unit="g"
          />
        </div>
      </CardContent>
    </Card>
  );
}
