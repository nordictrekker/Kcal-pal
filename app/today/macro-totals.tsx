import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CountUp } from "./count-up";
import { NutrientBreakdown } from "./nutrient-breakdown";
import type { Totals } from "@/lib/food";
import type { ContribEntry } from "@/lib/contributions";
import {
  METRICS,
  metricValueAndTarget,
  DEFAULT_HOME_METRICS,
  type MetricKey,
} from "@/lib/nutrients";

function round(n: number) {
  return Math.round(n);
}

// A single metric bar. "goal" metrics fill toward the target and read as met
// (never red) when reached; "limit" metrics (saturated fat, cholesterol) turn
// red when exceeded.
export function MetricBar({
  label,
  value,
  target,
  unit,
  kind,
  colorVar,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  kind: "goal" | "limit";
  colorVar: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  const fill =
    kind === "limit" && over ? "var(--destructive)" : `var(${colorVar})`;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {round(value)}
          {unit} / {round(target)}
          {unit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
    </div>
  );
}

export function MacroTotals({
  totals,
  targets,
  metrics = DEFAULT_HOME_METRICS,
  entries,
  phaseAdjustment,
  targetNote,
  recoveryNote,
  balanceNote,
  proteinNote,
  showLogHint,
  weekly = false,
  sex = null,
}: {
  totals: Totals;
  targets: Totals;
  sex?: string | null;
  // Which metric bars to render under the calorie headline.
  metrics?: MetricKey[];
  // Weekly mode: expandable bars show the week's top-5 contributors (table).
  weekly?: boolean;
  // When provided (summary page), each macro bar becomes an expandable
  // contributor breakdown. Omitted on the home card, which stays static.
  entries?: ContribEntry[];
  phaseAdjustment?: { phase: string; description: string } | null;
  // Short explanation when targets are auto-computed (e.g. from Oura burn).
  targetNote?: string | null;
  // Recovery-based bump (low readiness / hard training) explanation.
  recoveryNote?: string | null;
  // Rolling 7-day energy-balance correction explanation.
  balanceNote?: string | null;
  proteinNote?: string | null;
  // When true, renders a "View full log" affordance (card is wrapped in a link).
  showLogHint?: boolean;
}) {
  const calPct =
    targets.calories > 0
      ? Math.min(100, (totals.calories / targets.calories) * 100)
      : 0;
  const calOver = totals.calories > targets.calories;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-5xl font-medium leading-none tabular-nums">
              <CountUp value={round(totals.calories)} />
            </span>
            <span className="flex items-baseline gap-1 text-sm tabular-nums text-muted-foreground">
              of {targets.calories} {weekly ? "kcal/day" : "kcal"}
              {showLogHint ? (
                <ChevronRight className="size-4 self-center text-muted-foreground/70" />
              ) : null}
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
          {recoveryNote ? (
            <p className="pt-1 text-xs text-muted-foreground">{recoveryNote}</p>
          ) : null}
          {balanceNote ? (
            <p className="pt-1 text-xs text-muted-foreground">{balanceNote}</p>
          ) : null}
          {proteinNote ? (
            <p className="pt-1 text-xs text-muted-foreground">{proteinNote}</p>
          ) : null}
        </div>
        <div className="space-y-3">
          {metrics.map((key) => {
            const def = METRICS[key];
            if (!def) return null;
            const { value, target } = metricValueAndTarget(def, totals, targets, sex);
            return entries ? (
              <NutrientBreakdown
                key={key}
                label={def.label}
                value={value}
                target={target}
                unit={def.unit}
                kind={def.kind}
                colorVar={def.colorVar}
                field={def.field as string}
                entries={entries}
                weekly={weekly}
              />
            ) : (
              <MetricBar
                key={key}
                label={def.label}
                value={value}
                target={target}
                unit={def.unit}
                kind={def.kind}
                colorVar={def.colorVar}
              />
            );
          })}
        </div>
        {showLogHint ? (
          <p className="flex items-center justify-end gap-0.5 text-xs text-muted-foreground">
            View full log <ChevronRight className="size-3.5" />
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
