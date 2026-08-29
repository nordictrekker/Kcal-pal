"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/actions";
import { sumTotals, type Totals } from "@/lib/food";
import { isoYearWeek } from "@/lib/digest";
import {
  generateFoodInsights,
  type FoodInsightInput,
  type InsightNutrient,
} from "@/lib/food-insights";
import {
  buildComponentContributors,
  mergeContributorsByLabel,
  contributionsForField,
} from "@/lib/contributions";
import { normalizeModifiers } from "@/lib/phase-modifiers";
import {
  cycleDayFromPeriodStart,
  phaseForCycleDay,
  type CycleSettings,
} from "@/lib/cycle";
import { resolveDailyTargets } from "@/lib/daily-targets";
import { localDayKey, localDayBoundsUTC, addDaysToKey } from "@/lib/timezone";
import { METRICS, metricValueAndTarget, type MetricKey } from "@/lib/nutrients";
import type { FoodEntry, Profile } from "@/lib/types";

export type InsightState =
  | { status: "ready"; summary: string; generatedAt: string }
  | { status: "empty" }
  | { status: "error"; error: string };

// Nutrients the insights cover, and whether falling short of the goal is worth
// a "lift" suggestion (true for protein/fiber/micros; carbs & fat being under
// goal isn't a deficiency to chase).
const INSIGHT_METRICS: { key: MetricKey; aimToHit: boolean }[] = [
  { key: "protein", aimToHit: true },
  { key: "carbs", aimToHit: false },
  { key: "fat", aimToHit: false },
  { key: "fiber", aimToHit: true },
  { key: "iron", aimToHit: true },
  { key: "calcium", aimToHit: true },
  { key: "magnesium", aimToHit: true },
  { key: "vitamin_d", aimToHit: true },
  { key: "omega3", aimToHit: true },
];

export async function getCachedFoodInsight(): Promise<InsightState> {
  const auth = await requireUser();
  if (!auth.ok) return { status: "error", error: "Not signed in." };
  const { supabase, user } = auth;

  const { data } = await supabase
    .from("food_insights")
    .select("summary,generated_at")
    .eq("user_id", user.id)
    .eq("year_week", isoYearWeek())
    .maybeSingle();

  if (!data) return { status: "empty" };
  return {
    status: "ready",
    summary: data.summary as string,
    generatedAt: data.generated_at as string,
  };
}

function scaleTotals(t: Totals, factor: number): Totals {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "number") out[k] = v * factor;
  }
  return out as Totals;
}

// Gather the last 7 days, build the standout/lagging nutrient picture, ask Opus
// for the note, and cache it for the current ISO week.
export async function regenerateFoodInsight(): Promise<InsightState> {
  const auth = await requireUser();
  if (!auth.ok) return { status: "error", error: "Not signed in." };
  const { supabase, user } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  const p = profile as Profile | null;
  const tz = p?.timezone ?? null;

  const todayKey = localDayKey(tz);
  const dayKeys = Array.from({ length: 7 }, (_, i) =>
    addDaysToKey(todayKey, -(6 - i)),
  );
  const windowStart = localDayBoundsUTC(tz, dayKeys[0]).start;
  const windowEnd = localDayBoundsUTC(tz, todayKey).end;

  const [{ data: weekRows }, { data: weightRows }] = await Promise.all([
    supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("consumed_at", windowStart)
      .lt("consumed_at", windowEnd)
      .order("consumed_at", { ascending: true }),
    supabase
      .from("body_weights")
      .select("weight_lbs,measured_at")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false })
      .limit(1),
  ]);

  const weekEntries = (weekRows ?? []) as FoodEntry[];

  if (weekEntries.length === 0) {
    return {
      status: "error",
      error: "No food logged in the last 7 days yet — log a few meals first.",
    };
  }

  const latestWeight = weightRows?.[0]
    ? Number(weightRows[0].weight_lbs)
    : null;
  const cycleSettings: CycleSettings = {
    cycleLength: p?.avg_cycle_length ?? 28,
    periodLength: p?.avg_period_length ?? 5,
  };
  const phaseModifiers = normalizeModifiers(p?.phase_modifiers);
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
    bodyBuild: p?.body_build ?? null,
    proteinPerKg: p?.protein_per_kg ?? null,
    ouraTdee7d: null,
  };

  // Per-day macro goals averaged (cycle-phase aware) + days logged.
  const goalSum = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
  let daysLogged = 0;
  for (const day of dayKeys) {
    const { start, end } = localDayBoundsUTC(tz, day);
    const sMs = Date.parse(start);
    const eMs = Date.parse(end);
    const logged = weekEntries.some((e) => {
      const t = Date.parse(e.consumed_at);
      return t >= sMs && t < eMs;
    });
    if (logged) daysLogged += 1;

    let phase = null as ReturnType<typeof phaseForCycleDay> | null;
    if (p?.track_cycle && p.last_period_start) {
      const cd = cycleDayFromPeriodStart(p.last_period_start, cycleSettings, day);
      phase = cd ? phaseForCycleDay(cd, cycleSettings) : null;
    }
    const r = resolveDailyTargets({
      targetInputs,
      phase,
      phaseModifiers,
      recent: [],
      weightTrendLbsPerWeek: null,
      recovery: null,
    });
    goalSum.calories += r.targets.calories;
    goalSum.protein_g += r.targets.protein_g;
    goalSum.carbs_g += r.targets.carbs_g;
    goalSum.fat_g += r.targets.fat_g;
    goalSum.fiber_g += r.targets.fiber_g;
  }

  const weekFoodTotals = sumTotals(weekEntries);
  const weekAvgTotals = scaleTotals(weekFoodTotals, 1 / 7);
  const weekAvgTargets: Totals = {
    calories: Math.round(goalSum.calories / 7),
    protein_g: goalSum.protein_g / 7,
    carbs_g: goalSum.carbs_g / 7,
    fat_g: goalSum.fat_g / 7,
    fiber_g: goalSum.fiber_g / 7,
  };

  const merged = mergeContributorsByLabel(
    buildComponentContributors(
      weekEntries.map((e) => ({
        id: e.id,
        description: e.description,
        meal: e.meal,
        raw_ai_response: e.raw_ai_response,
        totals: {
          protein_g: e.protein_g,
          carbs_g: e.carbs_g,
          fat_g: e.fat_g,
          fiber_g: e.fiber_g,
          saturated_fat_g: e.saturated_fat_g,
          trans_fat_g: e.trans_fat_g,
          cholesterol_mg: e.cholesterol_mg,
          iron_mg: e.iron_mg,
          calcium_mg: e.calcium_mg,
          magnesium_mg: e.magnesium_mg,
          vitamin_d_mcg: e.vitamin_d_mcg,
          omega3_mg: e.omega3_mg,
          folate_mcg: e.folate_mcg,
          choline_mg: e.choline_mg,
          iodine_mcg: e.iodine_mcg,
        },
      })),
    ),
    1 / 7,
  );

  const nutrients: InsightNutrient[] = INSIGHT_METRICS.map(
    ({ key, aimToHit }) => {
      const def = METRICS[key];
      const { value, target } = metricValueAndTarget(
        def,
        weekAvgTotals,
        weekAvgTargets,
        p?.sex ?? null,
      );
      const pct = target > 0 ? value / target : 0;
      const topFoods = contributionsForField(def.field as string, merged)
        .slice(0, 3)
        .map((c) => ({ name: c.label, perDay: c.amount }));
      return {
        label: def.label,
        unit: def.unit,
        avgPerDay: value,
        goal: target,
        pctOfGoal: pct,
        lagging: aimToHit && pct < 0.85,
        topFoods,
      };
    },
  );

  const input: FoodInsightInput = { daysLogged, nutrients };
  const result = await generateFoodInsights(input);
  if (!result.ok) return { status: "error", error: result.error };

  const generatedAt = new Date().toISOString();
  const { error } = await supabase.from("food_insights").upsert({
    user_id: user.id,
    year_week: isoYearWeek(),
    summary: result.summary,
    generated_at: generatedAt,
  });
  if (error) return { status: "error", error: error.message };

  revalidatePath("/today/summary");
  return { status: "ready", summary: result.summary, generatedAt };
}
