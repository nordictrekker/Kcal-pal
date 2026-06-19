import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sumTotals } from "@/lib/food";
import { normalizeModifiers } from "@/lib/phase-modifiers";
import {
  cycleDayFromPeriodStart,
  phaseForCycleDay,
  type CycleSettings,
} from "@/lib/cycle";
import { resolveDailyTargets } from "@/lib/daily-targets";
import { localDayKey, localDayBoundsUTC, addDaysToKey } from "@/lib/timezone";
import {
  METRICS,
  metricValueAndTarget,
  MACRO_METRIC_KEYS,
  MICRO_METRIC_KEYS,
  type MetricKey,
} from "@/lib/nutrients";
import type { FoodEntry, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 7;

function fmt(n: number): string {
  if (n >= 100) return String(Math.round(n));
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

type RowData = {
  label: string;
  unit: string;
  kind: "goal" | "limit";
  colorVar: string;
  avg: number; // average consumed per day across the window
  goal: number; // average daily goal/limit
  daysMet: number;
  daysLogged: number;
};

function Bar({ row }: { row: RowData }) {
  const pct = row.goal > 0 ? Math.min(100, (row.avg / row.goal) * 100) : 0;
  const over = row.kind === "limit" && row.avg > row.goal;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${pct}%`,
          backgroundColor: over ? "var(--destructive)" : `var(${row.colorVar})`,
        }}
      />
    </div>
  );
}

function MetricRow({ row, showMet }: { row: RowData; showMet: boolean }) {
  const verb = row.kind === "limit" ? "Stayed under" : "Hit goal";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{row.label}</span>
        <span className="tabular-nums">
          <span className="text-foreground">{fmt(row.avg)}</span>
          <span className="text-muted-foreground">
            {" "}/ {fmt(row.goal)} {row.unit}
            <span className="text-[10px]"> /day</span>
          </span>
        </span>
      </div>
      <Bar row={row} />
      {showMet && row.daysLogged > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {verb} {row.daysMet}/{row.daysLogged}{" "}
          {row.daysLogged === 1 ? "logged day" : "logged days"}
        </p>
      ) : null}
    </div>
  );
}

export default async function WeekPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  const p = profile as Profile | null;
  const tz = p?.timezone ?? null;

  const todayKey = localDayKey(tz);
  // Oldest → newest list of the 7 local day-keys in the window.
  const dayKeys = Array.from({ length: WINDOW_DAYS }, (_, i) =>
    addDaysToKey(todayKey, -(WINDOW_DAYS - 1 - i)),
  );
  const windowStart = localDayBoundsUTC(tz, dayKeys[0]).start;
  const windowEnd = localDayBoundsUTC(tz, todayKey).end;

  const [{ data: rows }, { data: drinkRows }, { data: weightRows }] =
    await Promise.all([
      supabase
        .from("food_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("consumed_at", windowStart)
        .lt("consumed_at", windowEnd)
        .order("consumed_at", { ascending: true }),
      supabase
        .from("alcohol_logs")
        .select("calories,logged_at")
        .eq("user_id", user.id)
        .gte("logged_at", windowStart)
        .lt("logged_at", windowEnd),
      supabase
        .from("body_weights")
        .select("weight_lbs,measured_at")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: false })
        .limit(1),
    ]);

  const entries = (rows ?? []) as FoodEntry[];
  const drinks = (drinkRows ?? []) as Array<{
    calories: number;
    logged_at: string;
  }>;
  const latestWeight = weightRows?.[0]
    ? Number(weightRows[0].weight_lbs)
    : null;

  const cycleSettings: CycleSettings = {
    cycleLength: p?.avg_cycle_length ?? 28,
    periodLength: p?.avg_period_length ?? 5,
  };
  const phaseModifiers = normalizeModifiers(p?.phase_modifiers);

  // Shared target inputs — the same engine as the daily card, but without the
  // adaptive/recovery signals (this is a steady weekly reference). Cycle phase
  // is still applied per day so the goals match each day's real target.
  const targetInputs = {
    mode: p?.target_mode ?? "manual",
    manual: {
      calories: p?.daily_calorie_target ?? 2000,
      protein_g: p?.daily_protein_target_g ?? 130,
      carbs_g: p?.daily_carb_target_g ?? 220,
      fat_g: p?.daily_fat_target_g ?? 70,
      fiber_g: p?.daily_fiber_target_g ?? 30,
    },
    sex: p?.sex ?? null,
    dateOfBirth: p?.date_of_birth ?? null,
    heightIn: p?.height_in ?? null,
    weightLbs: latestWeight,
    activityLevel: p?.activity_level ?? null,
    goal: p?.goal ?? null,
    proteinPerKg: p?.protein_per_kg ?? null,
    ouraTdee7d: null,
  };

  const perDay = dayKeys.map((day) => {
    const { start, end } = localDayBoundsUTC(tz, day);
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    const inDay = (ts: string) => {
      const t = Date.parse(ts);
      return t >= startMs && t < endMs;
    };
    const dayEntries = entries.filter((e) => inDay(e.consumed_at));
    const dayDrinkCals = drinks
      .filter((d) => inDay(d.logged_at))
      .reduce((s, d) => s + Number(d.calories), 0);

    const foodTotals = sumTotals(dayEntries);
    const totals = {
      ...foodTotals,
      calories: foodTotals.calories + dayDrinkCals,
    };
    const logged = dayEntries.length > 0 || dayDrinkCals > 0;

    let phase = null as ReturnType<typeof phaseForCycleDay> | null;
    if (p?.track_cycle && p.last_period_start) {
      const cd = cycleDayFromPeriodStart(
        p.last_period_start,
        cycleSettings,
        day,
      );
      phase = cd ? phaseForCycleDay(cd, cycleSettings) : null;
    }

    const resolved = resolveDailyTargets({
      targetInputs,
      phase,
      phaseModifiers,
      recent: [],
      weightTrendLbsPerWeek: null,
      recovery: null,
    });

    return { day, totals, targets: resolved.targets, logged };
  });

  const daysLogged = perDay.filter((d) => d.logged).length;

  // Aggregate a metric (or calories) across the window into a single row.
  function aggregate(
    label: string,
    unit: string,
    kind: "goal" | "limit",
    colorVar: string,
    valueOf: (d: (typeof perDay)[number]) => { value: number; target: number },
  ): RowData {
    let sumVal = 0;
    let sumTarget = 0;
    let daysMet = 0;
    let logged = 0;
    for (const d of perDay) {
      const { value, target } = valueOf(d);
      sumVal += value;
      sumTarget += target;
      if (d.logged) {
        logged += 1;
        const met = kind === "limit" ? value <= target : value >= target;
        if (met) daysMet += 1;
      }
    }
    return {
      label,
      unit,
      kind,
      colorVar,
      avg: sumVal / WINDOW_DAYS,
      goal: sumTarget / WINDOW_DAYS,
      daysMet,
      daysLogged: logged,
    };
  }

  function metricRow(key: MetricKey): RowData {
    const def = METRICS[key];
    return aggregate(def.label, def.unit, def.kind, def.colorVar, (d) =>
      metricValueAndTarget(def, d.totals, d.targets),
    );
  }

  const caloriesRow = aggregate("Calories", "kcal", "goal", "--primary", (d) => ({
    value: d.totals.calories,
    target: d.targets.calories,
  }));
  const macroRows = MACRO_METRIC_KEYS.map(metricRow);
  const microRows = MICRO_METRIC_KEYS.map(metricRow);

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-24">
      <header className="space-y-1">
        <Link
          href="/today/summary"
          className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft className="size-4" /> Today&apos;s log
        </Link>
        <h1 className="font-serif text-3xl font-medium leading-tight">
          Last 7 days
        </h1>
        <p className="text-xs text-muted-foreground">
          Daily averages vs your goals · {daysLogged} of {WINDOW_DAYS} days
          logged
        </p>
      </header>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Energy &amp; macros</h2>
        <MetricRow row={caloriesRow} showMet={false} />
        {macroRows.map((row) => (
          <MetricRow key={row.label} row={row} showMet />
        ))}
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Micronutrients</h2>
        {microRows.map((row) => (
          <MetricRow key={row.label} row={row} showMet />
        ))}
        <p className="text-[11px] text-muted-foreground">
          Averaged over the last {WINDOW_DAYS} days. Goals follow your cycle
          phase day to day; micronutrients use general daily references for
          women.
        </p>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Want longer-term patterns?{" "}
        <Link href="/trends" className="underline underline-offset-2">
          See trends
        </Link>
      </p>
    </main>
  );
}
