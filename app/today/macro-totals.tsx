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
  colorVar,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  // CSS variable name for the bar fill, e.g. "--macro-protein"
  colorVar: string;
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
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: over
              ? "var(--destructive)"
              : `var(${colorVar})`,
          }}
        />
      </div>
    </div>
  );
}

export function MacroTotals({
  totals,
  targets,
  phaseAdjustment,
  targetNote,
}: {
  totals: Totals;
  targets: Totals;
  phaseAdjustment?: { phase: string; description: string } | null;
  // Short explanation when targets are auto-computed (e.g. from Oura burn).
  targetNote?: string | null;
}) {
  const calPct = targets.calories > 0
    ? Math.min(100, (totals.calories / targets.calories) * 100)
    : 0;
  const calOver = totals.calories > targets.calories;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-5xl font-medium leading-none tabular-nums">
              {round(totals.calories)}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              of {targets.calories} kcal
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${calPct}%`,
                background: calOver ? "var(--destructive)" : "var(--primary)",
              }}
            />
          </div>
          {targetNote ? (
            <p className="pt-1 text-xs text-muted-foreground">{targetNote}</p>
          ) : null}
          {phaseAdjustment ? (
            <p className="pt-1 text-xs text-muted-foreground">
              <span className="capitalize">{phaseAdjustment.phase}</span>:{" "}
              {phaseAdjustment.description}
            </p>
          ) : null}
        </div>
        <div className="space-y-3">
          <Bar
            label="Protein"
            value={totals.protein_g}
            target={targets.protein_g}
            unit="g"
            colorVar="--macro-protein"
          />
          <Bar
            label="Carbs"
            value={totals.carbs_g}
            target={targets.carbs_g}
            unit="g"
            colorVar="--macro-carbs"
          />
          <Bar
            label="Fat"
            value={totals.fat_g}
            target={targets.fat_g}
            unit="g"
            colorVar="--macro-fat"
          />
          <Bar
            label="Fiber"
            value={totals.fiber_g}
            target={targets.fiber_g}
            unit="g"
            colorVar="--macro-fiber"
          />
        </div>
      </CardContent>
    </Card>
  );
}
