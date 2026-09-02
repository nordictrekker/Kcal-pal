import Link from "next/link";
import { createClient, getAuthedUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile } from "@/lib/types";
import { allPeriodStarts, cycleAggregates, type FlowSample } from "@/lib/cycles";
import type { CycleSettings } from "@/lib/cycle";
import { mean, localDay } from "@/lib/stats";
import { RecapView } from "./recap-view";

export const dynamic = "force-dynamic";

export default async function RecapPage() {
  const supabase = await createClient();
  const user = await getAuthedUser(supabase);
  if (!user) redirect("/login");

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const ninetyDaysAgoDate = ninetyDaysAgo.slice(0, 10);
  const cycleSince = new Date(Date.now() - 270 * 86_400_000).toISOString();
  const cycleSinceDate = cycleSince.slice(0, 10);

  const [
    { data: profile },
    { data: food },
    { data: oura },
    { data: water },
    { data: weights },
    { data: flowRows },
    { data: cycleFood },
    { data: cycleOura },
    { data: cycleWater },
    { data: cycleWeights },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase
      .from("food_entries")
      .select("consumed_at,calories,protein_g,carbs_g,fat_g,fiber_g")
      .eq("user_id", user.id)
      .gte("consumed_at", ninetyDaysAgo),
    supabase
      .from("oura_daily")
      .select("date,sleep_score,hrv_avg,readiness_score,total_calories,resting_hr,total_sleep_min")
      .eq("user_id", user.id)
      .gte("date", ninetyDaysAgoDate),
    supabase
      .from("water_logs")
      .select("ml,logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", ninetyDaysAgo),
    supabase
      .from("body_weights")
      .select("measured_at,weight_lbs")
      .eq("user_id", user.id)
      .gte("measured_at", ninetyDaysAgo)
      .order("measured_at", { ascending: true }),
    supabase
      .from("apple_health_data")
      .select("value,recorded_at")
      .eq("user_id", user.id)
      .eq("metric", "menstrual_flow")
      .gte("recorded_at", cycleSince)
      .order("recorded_at", { ascending: true }),
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

  // 90-day averages.
  const foodByDay = new Map<
    string,
    { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }
  >();
  for (const f of food ?? []) {
    const d = localDay(f.consumed_at as string);
    const cur = foodByDay.get(d) ?? {
      calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0,
    };
    cur.calories += (f.calories as number | null) ?? 0;
    cur.protein_g += (f.protein_g as number | null) ?? 0;
    cur.carbs_g += (f.carbs_g as number | null) ?? 0;
    cur.fat_g += (f.fat_g as number | null) ?? 0;
    cur.fiber_g += (f.fiber_g as number | null) ?? 0;
    foodByDay.set(d, cur);
  }
  const loggedDays = Array.from(foodByDay.values());

  const ouraRows = oura ?? [];
  const sleepVals = ouraRows
    .map((o) => o.sleep_score as number | null)
    .filter((v): v is number => v != null);
  const hrvVals = ouraRows
    .map((o) => o.hrv_avg as number | null)
    .filter((v): v is number => v != null);
  const readyVals = ouraRows
    .map((o) => o.readiness_score as number | null)
    .filter((v): v is number => v != null);
  const rhrVals = ouraRows
    .map((o) => o.resting_hr as number | null)
    .filter((v): v is number => v != null);
  const tdeeVals = ouraRows
    .map((o) => o.total_calories as number | null)
    .filter((v): v is number => v != null);
  const sleepMinVals = ouraRows
    .map((o) => o.total_sleep_min as number | null)
    .filter((v): v is number => v != null);

  const waterByDay = new Map<string, number>();
  for (const w of water ?? []) {
    const d = localDay(w.logged_at as string);
    waterByDay.set(d, (waterByDay.get(d) ?? 0) + Number(w.ml));
  }

  // Weight trajectory.
  const weightSorted = (weights ?? []).slice();
  const weightStart =
    weightSorted.length > 0 ? Number(weightSorted[0].weight_lbs) : null;
  const weightEnd =
    weightSorted.length > 0
      ? Number(weightSorted[weightSorted.length - 1].weight_lbs)
      : null;
  const weightDelta =
    weightStart != null && weightEnd != null ? weightEnd - weightStart : null;

  // Cycle history over 270 days for compare context in the recap.
  const cycleSettings: CycleSettings = {
    cycleLength: p?.avg_cycle_length ?? 28,
    periodLength: p?.avg_period_length ?? 5,
  };
  const flowSamples: FlowSample[] = (flowRows ?? []).map((r) => ({
    value: Number(r.value),
    recorded_at: r.recorded_at as string,
  }));
  const starts = allPeriodStarts(flowSamples);
  const cycleFoodByDay = new Map<
    string,
    { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }
  >();
  for (const f of cycleFood ?? []) {
    const d = localDay(f.consumed_at as string);
    const cur = cycleFoodByDay.get(d) ?? {
      calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0,
    };
    cur.calories += (f.calories as number | null) ?? 0;
    cur.protein_g += (f.protein_g as number | null) ?? 0;
    cur.carbs_g += (f.carbs_g as number | null) ?? 0;
    cur.fat_g += (f.fat_g as number | null) ?? 0;
    cur.fiber_g += (f.fiber_g as number | null) ?? 0;
    cycleFoodByDay.set(d, cur);
  }
  const cycleOuraIn = (cycleOura ?? []).map((o) => ({
    date: o.date as string,
    sleep_score: (o.sleep_score as number | null) ?? null,
    hrv_avg: (o.hrv_avg as number | null) ?? null,
    readiness_score: (o.readiness_score as number | null) ?? null,
  }));
  const cycleWaterByDay = new Map<string, number>();
  for (const w of cycleWater ?? []) {
    const d = localDay(w.logged_at as string);
    cycleWaterByDay.set(d, (cycleWaterByDay.get(d) ?? 0) + Number(w.ml));
  }
  const cycleWeightByDay = new Map<string, number>();
  for (const w of cycleWeights ?? []) {
    const d = localDay(w.measured_at as string);
    cycleWeightByDay.set(d, Number(w.weight_lbs));
  }
  const cycles = cycleAggregates({
    periodStarts: starts,
    settings: cycleSettings,
    foodByDay: Array.from(cycleFoodByDay, ([date, m]) => ({ date, ...m })),
    ouraByDay: cycleOuraIn,
    waterByDay: Array.from(cycleWaterByDay, ([date, ml]) => ({ date, ml })),
    weightByDay: Array.from(cycleWeightByDay, ([date, lbs]) => ({ date, lbs })),
  });
  const cycleLengths = cycles.filter((c) => c.length != null).map((c) => c.length!);

  const summary = {
    rangeStart: ninetyDaysAgoDate,
    rangeEnd: new Date().toISOString().slice(0, 10),
    daysLogged: loggedDays.length,
    food: {
      avgCalories: loggedDays.length ? mean(loggedDays.map((d) => d.calories)) : null,
      avgProtein: loggedDays.length ? mean(loggedDays.map((d) => d.protein_g)) : null,
      avgCarbs: loggedDays.length ? mean(loggedDays.map((d) => d.carbs_g)) : null,
      avgFat: loggedDays.length ? mean(loggedDays.map((d) => d.fat_g)) : null,
      avgFiber: loggedDays.length ? mean(loggedDays.map((d) => d.fiber_g)) : null,
    },
    recovery: {
      avgSleep: sleepVals.length ? mean(sleepVals) : null,
      avgHrv: hrvVals.length ? mean(hrvVals) : null,
      avgReadiness: readyVals.length ? mean(readyVals) : null,
      avgRestingHr: rhrVals.length ? mean(rhrVals) : null,
      avgTotalSleepMin: sleepMinVals.length ? mean(sleepMinVals) : null,
      avgDailyBurn: tdeeVals.length ? mean(tdeeVals) : null,
    },
    hydration: {
      avgMl: waterByDay.size ? mean(Array.from(waterByDay.values())) : null,
      daysLogged: waterByDay.size,
      targetMl: p?.daily_water_target_ml ?? 2400,
    },
    weight: {
      start: weightStart,
      end: weightEnd,
      deltaLbs: weightDelta,
    },
    cycles: {
      count: starts.length,
      avgLength: cycleLengths.length ? mean(cycleLengths) : null,
      shortest: cycleLengths.length ? Math.min(...cycleLengths) : null,
      longest: cycleLengths.length ? Math.max(...cycleLengths) : null,
      latest: cycles[cycles.length - 1] ?? null,
      previous: cycles[cycles.length - 2] ?? null,
    },
    profile: {
      first_name: p?.first_name ?? null,
      goal: p?.goal ?? null,
      activity_level: p?.activity_level ?? null,
      track_cycle: p?.track_cycle ?? false,
    },
  };

  return (
    <main className="mx-auto max-w-2xl p-4 print:max-w-none">
      <header className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="font-serif text-3xl font-medium">90-day recap</h1>
        <Link
          href="/weekly"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back
        </Link>
      </header>

      <RecapView summary={summary} />
    </main>
  );
}
