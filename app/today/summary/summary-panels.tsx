"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { MacroTotals } from "../macro-totals";
import { NutrientBreakdown } from "../nutrient-breakdown";
import { METRICS, metricValueAndTarget, type MetricKey } from "@/lib/nutrients";
import type { Totals } from "@/lib/food";
import type { ContribEntry } from "@/lib/contributions";

type DataSet = {
  totals: Totals;
  targets: Totals;
  contribEntries: ContribEntry[];
};

type WeekData = DataSet & { daysLogged: number };

type Notes = {
  phaseAdjustment: { phase: string; description: string } | null;
  targetNote: string | null;
  recoveryNote: string | null;
  balanceNote: string | null;
};

// The nutrient half of the food-log page. When a 7-day dataset is supplied
// (today only), a toggle flips the calorie card and every macro/micro bar
// between today and the 7-day daily average. In average mode the expandable
// breakdowns show the week's top-5 contributing foods.
export function SummaryPanels({
  macroKeys,
  microKeys,
  today,
  week,
  notes,
  weeklyExtras,
  weekInsight,
  dayChildren,
}: {
  macroKeys: MetricKey[];
  microKeys: MetricKey[];
  today: DataSet;
  week: WeekData | null;
  notes: Notes;
  weeklyExtras: ReactNode;
  // Generate-on-demand AI insights card, shown only in 7-day-average mode.
  weekInsight: ReactNode;
  dayChildren: ReactNode;
}) {
  const [mode, setMode] = useState<"today" | "week">("today");
  const isWeek = mode === "week" && week != null;
  const active: DataSet = isWeek ? week! : today;

  return (
    <div className="space-y-5">
      {week ? (
        <div className="flex rounded-lg border p-0.5 text-sm">
          {(["today", "week"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-md py-1.5 font-medium transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "today" ? "Today" : "7-day average"}
            </button>
          ))}
        </div>
      ) : null}

      {isWeek ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          Daily average over the last 7 days · {week!.daysLogged} of 7 days
          logged.
        </p>
      ) : null}

      <MacroTotals
        totals={active.totals}
        targets={active.targets}
        metrics={macroKeys}
        entries={active.contribEntries}
        weekly={isWeek}
        phaseAdjustment={isWeek ? null : notes.phaseAdjustment}
        targetNote={isWeek ? null : notes.targetNote}
        recoveryNote={isWeek ? null : notes.recoveryNote}
        balanceNote={isWeek ? null : notes.balanceNote}
      />

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Micronutrients</h2>
        {microKeys.map((key) => {
          const def = METRICS[key];
          const { value, target } = metricValueAndTarget(
            def,
            active.totals,
            active.targets,
          );
          return (
            <NutrientBreakdown
              key={key}
              label={def.label}
              value={value}
              target={target}
              unit={def.unit}
              kind={def.kind}
              colorVar={def.colorVar}
              field={def.field as string}
              entries={active.contribEntries}
              weekly={isWeek}
            />
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          {isWeek ? "Averaged over the last 7 days. " : ""}Estimated from your
          logs against general daily references for women.{" "}
          <Link href="/reanalyze" className="underline underline-offset-2">
            Re-analyze logs
          </Link>
        </p>
      </section>

      {weeklyExtras}

      {isWeek ? weekInsight : dayChildren}
    </div>
  );
}
