"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildTrends } from "@/lib/trends";
import {
  generateDigest,
  isoYearWeek,
  weekLabel,
  type DigestInput,
} from "@/lib/digest";
import { isPhase } from "@/lib/cycle";
import { avgDailySteps } from "@/lib/insights";

const STALE_MS = 60 * 60 * 1000; // 1 hour — same-week digests can refresh

export type DigestState =
  | { status: "ready"; summary: string; generatedAt: string; cached: boolean }
  | { status: "empty" }
  | { status: "error"; error: string };

// Pull cached digest for the current week; null if none stored or it's
// older than STALE_MS (so a same-day re-visit reuses; tomorrow re-renders).
export async function getCachedDigest(): Promise<DigestState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "Not signed in." };

  const yw = isoYearWeek();
  const { data } = await supabase
    .from("weekly_digests")
    .select("summary,generated_at")
    .eq("user_id", user.id)
    .eq("year_week", yw)
    .maybeSingle();

  if (!data) return { status: "empty" };
  const ageMs = Date.now() - new Date(data.generated_at as string).getTime();
  if (ageMs > STALE_MS) return { status: "empty" };
  return {
    status: "ready",
    summary: data.summary as string,
    generatedAt: data.generated_at as string,
    cached: true,
  };
}

// Generate (and cache) the digest for the current week. Idempotent at
// the table level via upsert on the (user_id, year_week) primary key.
export async function regenerateDigest(): Promise<DigestState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "Not signed in." };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date(
    Date.now() - 14 * 86_400_000,
  ).toISOString();
  const fourteenDaysAgoDate = fourteenDaysAgo.slice(0, 10);
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 86_400_000,
  ).toISOString();

  const [
    { data: profile },
    { data: food },
    { data: oura },
    { data: cycle },
    { data: water },
    { data: weights },
    { data: steps },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("daily_calorie_target,daily_protein_target_g,daily_carb_target_g,daily_fat_target_g,daily_fiber_target_g,daily_water_target_ml")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("food_entries")
      .select("consumed_at,calories,protein_g,carbs_g,fat_g,fiber_g")
      .eq("user_id", user.id)
      .gte("consumed_at", fourteenDaysAgo),
    supabase
      .from("oura_daily")
      .select("date,sleep_score,hrv_avg,readiness_score")
      .eq("user_id", user.id)
      .gte("date", fourteenDaysAgoDate),
    supabase
      .from("cycle_days")
      .select("date,cycle_day,phase")
      .eq("user_id", user.id)
      .gte("date", fourteenDaysAgoDate)
      .lte("date", today)
      .order("date", { ascending: false }),
    supabase
      .from("water_logs")
      .select("ml,logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", fourteenDaysAgo),
    supabase
      .from("body_weights")
      .select("weight_lbs,measured_at")
      .eq("user_id", user.id)
      .gte("measured_at", fourteenDaysAgo)
      .order("measured_at", { ascending: true }),
    supabase
      .from("apple_health_data")
      .select("value,recorded_at")
      .eq("user_id", user.id)
      .eq("metric", "steps")
      .gte("recorded_at", sevenDaysAgo),
  ]);

  const targets = {
    calories: (profile?.daily_calorie_target as number) ?? 2000,
    protein_g: (profile?.daily_protein_target_g as number) ?? 130,
    carbs_g: (profile?.daily_carb_target_g as number) ?? 220,
    fat_g: (profile?.daily_fat_target_g as number) ?? 70,
    fiber_g: (profile?.daily_fiber_target_g as number) ?? 30,
  };
  const waterTargetMl = (profile?.daily_water_target_ml as number) ?? 2400;

  const trends = buildTrends({
    food: (food ?? []).map((f) => ({
      consumed_at: f.consumed_at as string,
      calories: (f.calories as number | null) ?? null,
      protein_g: (f.protein_g as number | null) ?? null,
      carbs_g: (f.carbs_g as number | null) ?? null,
      fat_g: (f.fat_g as number | null) ?? null,
      fiber_g: (f.fiber_g as number | null) ?? null,
    })),
    oura: (oura ?? []).map((o) => ({
      date: o.date as string,
      sleep_score: (o.sleep_score as number | null) ?? null,
      hrv_avg: (o.hrv_avg as number | null) ?? null,
      readiness_score: (o.readiness_score as number | null) ?? null,
    })),
    cycle: (cycle ?? []).map((c) => ({
      date: c.date as string,
      phase: (c.phase as string | null) ?? null,
    })),
    water: (water ?? []).map((w) => ({
      ml: Number(w.ml),
      logged_at: w.logged_at as string,
    })),
    targets,
    today: now,
  });

  // Phase + cycle day from the most recent stored row.
  const latestCycle = (cycle ?? [])[0] ?? null;
  const phaseRaw =
    latestCycle && typeof latestCycle.phase === "string"
      ? latestCycle.phase
      : null;
  const phase = phaseRaw && isPhase(phaseRaw) ? phaseRaw : null;
  const cycleDay = (latestCycle?.cycle_day as number | null) ?? null;

  // Weight: latest + 7-day delta from earliest reading in the window.
  const w = weights ?? [];
  const latestWeight = w.length
    ? Number(w[w.length - 1].weight_lbs as number)
    : null;
  const earliestWeight = w.length
    ? Number(w[0].weight_lbs as number)
    : null;
  const weekDeltaLbs =
    latestWeight !== null && earliestWeight !== null
      ? Number((latestWeight - earliestWeight).toFixed(1))
      : null;

  const { avg: stepsAvg7d } = avgDailySteps(
    (steps ?? []).map((r) => ({
      value: Number(r.value),
      recorded_at: r.recorded_at as string,
    })),
  );

  const avgWaterMl7 = trends.avgWaterMl7;

  const input: DigestInput = {
    weekLabel: weekLabel(now),
    phase,
    cycleDay,
    trends,
    hydration: { targetMl: waterTargetMl, avgMl7: avgWaterMl7 },
    weight: { latestLbs: latestWeight, weekDeltaLbs },
    activity: { stepsAvg7d },
  };

  const result = await generateDigest(input);
  if (!result.ok) return { status: "error", error: result.error };

  const yw = isoYearWeek(now);
  const generatedAt = new Date().toISOString();
  const { error } = await supabase.from("weekly_digests").upsert({
    user_id: user.id,
    year_week: yw,
    summary: result.summary,
    generated_at: generatedAt,
  });
  if (error) return { status: "error", error: error.message };

  revalidatePath("/weekly");
  return {
    status: "ready",
    summary: result.summary,
    generatedAt,
    cached: false,
  };
}
