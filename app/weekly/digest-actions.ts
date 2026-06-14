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
import {
  isPhase,
  phaseForCycleDay,
  cycleDayFromPeriodStart,
  type Phase,
  type CycleSettings,
} from "@/lib/cycle";
import { avgDailySteps } from "@/lib/insights";
import { computeTargets } from "@/lib/targets";
import type { Profile } from "@/lib/types";

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
      .select("*")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("food_entries")
      .select("consumed_at,calories,protein_g,carbs_g,fat_g,fiber_g")
      .eq("user_id", user.id)
      .gte("consumed_at", fourteenDaysAgo),
    supabase
      .from("oura_daily")
      .select("date,sleep_score,hrv_avg,readiness_score,total_calories")
      .eq("user_id", user.id)
      .gte("date", fourteenDaysAgoDate)
      .order("date", { ascending: false }),
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

  const prof = profile as Profile | null;
  const manualTargets = {
    calories: prof?.daily_calorie_target ?? 2000,
    protein_g: prof?.daily_protein_target_g ?? 130,
    carbs_g: prof?.daily_carb_target_g ?? 220,
    fat_g: prof?.daily_fat_target_g ?? 70,
    fiber_g: prof?.daily_fiber_target_g ?? 30,
  };
  const waterTargetMl = prof?.daily_water_target_ml ?? 2400;

  // Latest weight + Oura burn → smart targets, so the digest's under/over
  // counts match what the user actually sees on Today.
  const wAsc = weights ?? [];
  const latestWeightLbs = wAsc.length
    ? Number(wAsc[wAsc.length - 1].weight_lbs as number)
    : null;
  const ouraTdeeValues = (oura ?? [])
    .slice(0, 7)
    .map((o) => o.total_calories as number | null)
    .filter((v): v is number => v != null && v > 0);
  const ouraTdee7d = ouraTdeeValues.length
    ? ouraTdeeValues.reduce((a, b) => a + b, 0) / ouraTdeeValues.length
    : null;
  const targets = computeTargets({
    mode: prof?.target_mode ?? "manual",
    manual: manualTargets,
    sex: prof?.sex ?? null,
    dateOfBirth: prof?.date_of_birth ?? null,
    heightIn: prof?.height_in ?? null,
    weightLbs: latestWeightLbs,
    activityLevel: prof?.activity_level ?? null,
    goal: prof?.goal ?? null,
    proteinPerKg: prof?.protein_per_kg ?? null,
    ouraTdee7d,
  }).targets;

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

  // Phase + cycle day: prefer the automated derivation from last_period_start
  // (matches Today), falling back to the most recent manual cycle row.
  const cycleSettings: CycleSettings = {
    cycleLength: prof?.avg_cycle_length ?? 28,
    periodLength: prof?.avg_period_length ?? 5,
  };
  let phase: Phase | null = null;
  let cycleDay: number | null = null;
  if (prof?.track_cycle && prof.last_period_start) {
    cycleDay = cycleDayFromPeriodStart(prof.last_period_start, cycleSettings, today);
    phase = cycleDay ? phaseForCycleDay(cycleDay, cycleSettings) : null;
  } else {
    const latestCycle = (cycle ?? [])[0] ?? null;
    const phaseRaw =
      latestCycle && typeof latestCycle.phase === "string"
        ? latestCycle.phase
        : null;
    phase = phaseRaw && isPhase(phaseRaw) ? phaseRaw : null;
    cycleDay = (latestCycle?.cycle_day as number | null) ?? null;
  }

  // Weight: latest + 7-day delta from earliest reading in the window.
  const earliestWeight = wAsc.length
    ? Number(wAsc[0].weight_lbs as number)
    : null;
  const latestWeight = latestWeightLbs;
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
