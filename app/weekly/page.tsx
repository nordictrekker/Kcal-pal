import Link from "next/link";
import { createClient, getAuthedUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  lastNDays,
  rollingAverage,
  pearson,
  describeCorrelation,
  localDay,
  mean,
  type DayValue,
} from "@/lib/stats";
import { LineChart, ScatterChart } from "./charts";
import { DigestCard } from "./digest-card";
import { getCachedDigest } from "./digest-actions";
import { RangeTabs } from "./range-tabs";
import { CycleCompareCard } from "./cycle-compare";
import type { Profile } from "@/lib/types";
import {
  allPeriodStarts,
  cycleAggregates,
  phaseBaselines,
  type FlowSample,
} from "@/lib/cycles";
import { PhaseBaselinesCard } from "./phase-baselines";
import { CorrelationsCard, type Corr } from "./correlations";
import type { CycleSettings } from "@/lib/cycle";

export const dynamic = "force-dynamic";

const RANGES = {
  "14": { displayDays: 14, window: 7, label: "14 days" },
  "30": { displayDays: 30, window: 7, label: "30 days" },
  "90": { displayDays: 90, window: 14, label: "90 days" },
} as const;
type RangeKey = keyof typeof RANGES;

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const supabase = await createClient();
  const user = await getAuthedUser(supabase);
  if (!user) redirect("/login");

  const params = await searchParams;
  const rangeKey: RangeKey =
    params.range && params.range in RANGES ? (params.range as RangeKey) : "14";
  const range = RANGES[rangeKey];

  const days = lastNDays(range.displayDays);
  const since = `${days[0]}T00:00:00.000Z`;

  // Cycle compare window is fixed at ~270 days so cross-cycle deltas are
  // available regardless of which range tab is active.
  const cycleSince = new Date(Date.now() - 270 * 86_400_000).toISOString();
  const cycleSinceDate = cycleSince.slice(0, 10);

  const digestState = await getCachedDigest();

  const [
    { data: profile },
    { data: foods },
    { data: oura },
    { data: weights },
    { data: water },
    { data: alcohol },
    { data: flowRows },
    { data: cycleFood },
    { data: cycleOura },
    { data: cycleWater },
    { data: cycleWeights },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase
      .from("food_entries")
      .select("consumed_at,calories,protein_g")
      .eq("user_id", user.id)
      .gte("consumed_at", since),
    supabase
      .from("oura_daily")
      .select("date,sleep_score,hrv_avg")
      .eq("user_id", user.id)
      .gte("date", days[0]),
    supabase
      .from("body_weights")
      .select("measured_at,weight_lbs")
      .eq("user_id", user.id)
      .gte("measured_at", since),
    supabase
      .from("water_logs")
      .select("ml,logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", since),
    supabase
      .from("alcohol_logs")
      .select("standard_drinks,logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", since),
    supabase
      .from("apple_health_data")
      .select("value,recorded_at")
      .eq("user_id", user.id)
      .eq("metric", "menstrual_flow")
      .gte("recorded_at", cycleSince)
      .order("recorded_at", { ascending: true }),
    // Cycle-compare data over the wider window. Separate queries since
    // the per-range food/oura/weight above is scoped tightly for charts.
    supabase
      .from("food_entries")
      .select("consumed_at,calories,protein_g,carbs_g,fat_g,fiber_g")
      .eq("user_id", user.id)
      .gte("consumed_at", cycleSince),
    supabase
      .from("oura_daily")
      .select("date,sleep_score,hrv_avg,readiness_score")
      .eq("user_id", user.id)
      .gte("date", cycleSinceDate),
    supabase
      .from("water_logs")
      .select("ml,logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", cycleSince),
    supabase
      .from("body_weights")
      .select("measured_at,weight_lbs")
      .eq("user_id", user.id)
      .gte("measured_at", cycleSince),
  ]);

  const p = profile as Profile | null;

  // Aggregate food per day for the active range.
  const calByDay = new Map<string, number>();
  const proByDay = new Map<string, number>();
  for (const f of foods ?? []) {
    const day = localDay(f.consumed_at as string);
    calByDay.set(day, (calByDay.get(day) ?? 0) + ((f.calories as number) ?? 0));
    proByDay.set(day, (proByDay.get(day) ?? 0) + ((f.protein_g as number) ?? 0));
  }

  // Sleep + HRV per day.
  const sleepByDay = new Map<string, number | null>();
  const hrvByDay = new Map<string, number | null>();
  for (const o of oura ?? []) {
    sleepByDay.set(o.date as string, (o.sleep_score as number | null) ?? null);
    hrvByDay.set(o.date as string, (o.hrv_avg as number | null) ?? null);
  }

  // Weight per day (average of readings).
  const weightBuckets = new Map<string, number[]>();
  for (const w of weights ?? []) {
    const day = localDay(w.measured_at as string);
    const arr = weightBuckets.get(day) ?? [];
    arr.push((w.weight_lbs as number) ?? 0);
    weightBuckets.set(day, arr);
  }

  // Water per day.
  const waterByDay = new Map<string, number>();
  for (const w of water ?? []) {
    const day = localDay(w.logged_at as string);
    waterByDay.set(day, (waterByDay.get(day) ?? 0) + Number(w.ml));
  }

  const series = (
    pick: (day: string) => number | null,
  ): DayValue[] => days.map((d) => ({ date: d, value: pick(d) }));

  const calSeries = series((d) => (calByDay.has(d) ? calByDay.get(d)! : null));
  const proSeries = series((d) => (proByDay.has(d) ? proByDay.get(d)! : null));
  const sleepSeries = series((d) => sleepByDay.get(d) ?? null);
  const hrvSeries = series((d) => hrvByDay.get(d) ?? null);
  const weightSeries = series((d) => {
    const arr = weightBuckets.get(d);
    return arr && arr.length ? mean(arr) : null;
  });
  const waterSeries = series((d) => waterByDay.get(d) ?? null);

  // Correlation: protein on day N vs HRV on day N+1.
  const corrPairs = days.slice(0, -1).map((d, i) => ({
    x: proByDay.has(d) ? proByDay.get(d)! : null,
    y: hrvByDay.get(days[i + 1]) ?? null,
  }));
  const corr = pearson(corrPairs);

  // Cross-cycle aggregates. Built off the 270-day window so the compare
  // card has access to at least one complete prior cycle whenever data
  // exists, no matter the chart range above.
  const cycleSettings: CycleSettings = {
    cycleLength: p?.avg_cycle_length ?? 28,
    periodLength: p?.avg_period_length ?? 5,
  };
  const flowSamples: FlowSample[] = (flowRows ?? []).map((r) => ({
    value: Number(r.value),
    recorded_at: r.recorded_at as string,
  }));
  const starts = allPeriodStarts(flowSamples);

  const foodByDay = new Map<
    string,
    { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }
  >();
  for (const f of cycleFood ?? []) {
    const d = localDay(f.consumed_at as string);
    const cur = foodByDay.get(d) ?? {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
    };
    cur.calories += (f.calories as number | null) ?? 0;
    cur.protein_g += (f.protein_g as number | null) ?? 0;
    cur.carbs_g += (f.carbs_g as number | null) ?? 0;
    cur.fat_g += (f.fat_g as number | null) ?? 0;
    cur.fiber_g += (f.fiber_g as number | null) ?? 0;
    foodByDay.set(d, cur);
  }

  const ouraByDayCmp = (cycleOura ?? []).map((o) => ({
    date: o.date as string,
    sleep_score: (o.sleep_score as number | null) ?? null,
    hrv_avg: (o.hrv_avg as number | null) ?? null,
    readiness_score: (o.readiness_score as number | null) ?? null,
  }));

  const waterCmp = new Map<string, number>();
  for (const w of cycleWater ?? []) {
    const d = localDay(w.logged_at as string);
    waterCmp.set(d, (waterCmp.get(d) ?? 0) + Number(w.ml));
  }

  const weightCmp = new Map<string, number>();
  for (const w of cycleWeights ?? []) {
    const d = localDay(w.measured_at as string);
    // Last reading of the day wins (avoids fractional avg distortions).
    weightCmp.set(d, Number(w.weight_lbs));
  }

  const cycleArgs = {
    periodStarts: starts,
    settings: cycleSettings,
    foodByDay: Array.from(foodByDay, ([date, m]) => ({ date, ...m })),
    ouraByDay: ouraByDayCmp,
    waterByDay: Array.from(waterCmp, ([date, ml]) => ({ date, ml })),
  };
  const cycles = cycleAggregates({
    ...cycleArgs,
    weightByDay: Array.from(weightCmp, ([date, lbs]) => ({ date, lbs })),
  });
  const baselines = phaseBaselines(cycleArgs);

  // Personalized next-day correlations over the wide (270d) window — more
  // pairs = more trustworthy r. Day N predictor → day N+1 outcome.
  const cmpDays = lastNDays(270);
  const sleepCmp = new Map<string, number | null>();
  const readinessCmp = new Map<string, number | null>();
  const hrvCmp = new Map<string, number | null>();
  for (const o of ouraByDayCmp) {
    sleepCmp.set(o.date, o.sleep_score);
    readinessCmp.set(o.date, o.readiness_score);
    hrvCmp.set(o.date, o.hrv_avg);
  }
  const calCmp = new Map<string, number>();
  const carbCmp = new Map<string, number>();
  const protCmp = new Map<string, number>();
  for (const [date, m] of foodByDay) {
    calCmp.set(date, m.calories);
    carbCmp.set(date, m.carbs_g);
    protCmp.set(date, m.protein_g);
  }
  const nextDayPairs = (
    xByDay: ReadonlyMap<string, number | null>,
    yByDay: ReadonlyMap<string, number | null>,
  ) =>
    cmpDays.slice(0, -1).map((d, i) => ({
      x: xByDay.get(d) ?? null,
      y: yByDay.get(cmpDays[i + 1]) ?? null,
    }));
  const corrs: Corr[] = [
    { id: "sleep_carbs", ...pearson(nextDayPairs(sleepCmp, carbCmp)) },
    { id: "sleep_cal", ...pearson(nextDayPairs(sleepCmp, calCmp)) },
    { id: "water_readiness", ...pearson(nextDayPairs(waterCmp, readinessCmp)) },
    { id: "protein_hrv", ...pearson(nextDayPairs(protCmp, hrvCmp)) },
  ];

  // Weekly alcohol tally (last 7 days), independent of the range tab.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const drinkRows = (alcohol ?? []) as Array<{
    standard_drinks: number;
    logged_at: string;
  }>;
  const last7Drinks = drinkRows.filter((d) => new Date(d.logged_at) >= weekAgo);
  const weekDrinks =
    Math.round(
      last7Drinks.reduce((s, d) => s + Number(d.standard_drinks), 0) * 10,
    ) / 10;
  const drinkingDays = new Set(last7Drinks.map((d) => localDay(d.logged_at)))
    .size;
  const afDays = 7 - drinkingDays;

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-medium">Trends</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Link href="/recap" className="underline-offset-4 hover:underline">
            90-day recap
          </Link>
          <Link href="/today" className="underline-offset-4 hover:underline">
            Today →
          </Link>
        </div>
      </header>

      <DigestCard initial={digestState} />

      <RangeTabs active={rangeKey} />

      {drinkRows.length > 0 ? (
        <section className="space-y-1 rounded-lg border p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">Alcohol this week</h2>
            <span className="font-serif text-2xl tabular-nums">
              {weekDrinks}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {weekDrinks === 1 ? "standard drink" : "standard drinks"} over{" "}
            {drinkingDays} {drinkingDays === 1 ? "day" : "days"}
            {afDays > 0
              ? ` · ${afDays} alcohol-free ${afDays === 1 ? "day" : "days"}`
              : ""}
            .
          </p>
          <p className="text-[11px] text-muted-foreground">
            A standard drink ≈ 14 g alcohol. Many guidelines suggest keeping it
            under ~7 a week.
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {range.window}-day rolling averages · {range.label}
        </h2>
        <LineChart
          series={rollingAverage(calSeries, range.window)}
          label="Calories"
          unit=" kcal"
        />
        <LineChart
          series={rollingAverage(proSeries, range.window)}
          label="Protein"
          unit="g"
        />
        <LineChart
          series={rollingAverage(sleepSeries, range.window)}
          label="Sleep score"
        />
        <LineChart
          series={rollingAverage(hrvSeries, range.window)}
          label="HRV"
          unit="ms"
        />
        <LineChart
          series={rollingAverage(weightSeries, range.window)}
          label="Weight"
          unit=" lb"
        />
        <LineChart
          series={rollingAverage(waterSeries, range.window)}
          label="Water"
          unit=" ml"
        />
      </section>

      <PhaseBaselinesCard baselines={baselines} />

      <CycleCompareCard cycles={cycles} />

      <CorrelationsCard corrs={corrs} />

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Correlation
        </h2>
        <ScatterChart
          pairs={corrPairs}
          xLabel="Protein"
          yLabel="Next-day HRV"
          caption={`${describeCorrelation(corr.r)} · ${corr.n} day pairs`}
        />
      </section>
    </main>
  );
}
