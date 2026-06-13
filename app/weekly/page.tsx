import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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

export const dynamic = "force-dynamic";

const DISPLAY_DAYS = 14;
const WINDOW = 7;

export default async function WeeklyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const days = lastNDays(DISPLAY_DAYS);
  const since = `${days[0]}T00:00:00.000Z`;

  const [{ data: foods }, { data: oura }, { data: weights }] =
    await Promise.all([
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
    ]);

  // Aggregate food per day.
  const calByDay = new Map<string, number>();
  const proByDay = new Map<string, number>();
  for (const f of foods ?? []) {
    const day = localDay(f.consumed_at as string);
    calByDay.set(day, (calByDay.get(day) ?? 0) + ((f.calories as number) ?? 0));
    proByDay.set(day, (proByDay.get(day) ?? 0) + ((f.protein_g as number) ?? 0));
  }

  // Sleep + HRV per day (already one row per day).
  const sleepByDay = new Map<string, number | null>();
  const hrvByDay = new Map<string, number | null>();
  for (const o of oura ?? []) {
    sleepByDay.set(o.date as string, (o.sleep_score as number | null) ?? null);
    hrvByDay.set(o.date as string, (o.hrv_avg as number | null) ?? null);
  }

  // Weight: average of any readings that day.
  const weightBuckets = new Map<string, number[]>();
  for (const w of weights ?? []) {
    const day = localDay(w.measured_at as string);
    const arr = weightBuckets.get(day) ?? [];
    arr.push((w.weight_lbs as number) ?? 0);
    weightBuckets.set(day, arr);
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

  // Correlation: protein on day N vs HRV on day N+1.
  const corrPairs = days.slice(0, -1).map((d, i) => ({
    x: proByDay.has(d) ? proByDay.get(d)! : null,
    y: hrvByDay.get(days[i + 1]) ?? null,
  }));
  const corr = pearson(corrPairs);

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Weekly</h1>
        <Link
          href="/today"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Today →
        </Link>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          7-day rolling averages
        </h2>
        <LineChart
          series={rollingAverage(calSeries, WINDOW)}
          label="Calories"
          unit=" kcal"
        />
        <LineChart
          series={rollingAverage(proSeries, WINDOW)}
          label="Protein"
          unit="g"
        />
        <LineChart
          series={rollingAverage(sleepSeries, WINDOW)}
          label="Sleep score"
        />
        <LineChart
          series={rollingAverage(hrvSeries, WINDOW)}
          label="HRV"
          unit="ms"
        />
        <LineChart
          series={rollingAverage(weightSeries, WINDOW)}
          label="Weight"
          unit=" lb"
        />
      </section>

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
