import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sumTotals } from "@/lib/food";
import { describeDrink } from "@/lib/alcohol";
import { mean } from "@/lib/stats";
import { avgDailySteps } from "@/lib/insights";
import { weightTrendLbsPerWeek } from "@/lib/targets";
import { normalizeModifiers } from "@/lib/phase-modifiers";
import {
  cycleDayFromPeriodStart,
  phaseForCycleDay,
  type CycleSettings,
} from "@/lib/cycle";
import {
  resolveDailyTargets,
  recentIntakeFromRows,
} from "@/lib/daily-targets";
import { localDayKey, localDayBoundsUTC } from "@/lib/timezone";
import {
  METRICS,
  metricValueAndTarget,
  MACRO_METRIC_KEYS,
  MICRO_METRIC_KEYS,
  PLANT_DIVERSITY_GOAL,
} from "@/lib/nutrients";
import { buildComponentContributors } from "@/lib/contributions";
import type { FoodEntry, Profile } from "@/lib/types";
import { MacroTotals } from "../macro-totals";
import { NutrientBreakdown } from "../nutrient-breakdown";
import { EntryList } from "../entry-list";

export const dynamic = "force-dynamic";

// Food log for a day (today by default, or ?date=YYYY-MM-DD to review a past
// day). Tap any entry to expand its component macros.
export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Profile first — it carries the timezone that defines "today" and the day
  // query bounds.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  const p = profile as Profile | null;
  const tz = p?.timezone ?? null;

  const { date } = await searchParams;
  const todayKey = localDayKey(tz);
  const valid = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayKey;
  const targetDay = valid ? date! : todayKey;
  const isToday = targetDay === todayKey;
  const { start: dayStart, end: dayEnd } = localDayBoundsUTC(tz, targetDay);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const sevenDaysAgoDate = sevenDaysAgo.slice(0, 10);

  const [
    { data: rows },
    { data: drinkRows },
    { data: weightRows },
    { data: ouraRows },
    { data: stepRows },
    { data: recentFood },
    { data: dayStatusRows },
    { data: plantRows },
  ] = await Promise.all([
    supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("consumed_at", dayStart)
      .lt("consumed_at", dayEnd)
      .order("consumed_at", { ascending: true }),
    supabase
      .from("alcohol_logs")
      .select("id,drink_type,volume_ml,calories,standard_drinks,logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", dayStart)
      .lt("logged_at", dayEnd)
      .order("logged_at", { ascending: true }),
    supabase
      .from("body_weights")
      .select("weight_lbs,measured_at")
      .eq("user_id", user.id)
      .gte("measured_at", new Date(Date.now() - 60 * 86_400_000).toISOString())
      .order("measured_at", { ascending: false }),
    supabase
      .from("oura_daily")
      .select("date,total_calories,readiness_score")
      .eq("user_id", user.id)
      .gte("date", sevenDaysAgoDate)
      .order("date", { ascending: false }),
    supabase
      .from("apple_health_data")
      .select("value,recorded_at")
      .eq("user_id", user.id)
      .eq("metric", "steps")
      .gte("recorded_at", sevenDaysAgo),
    supabase
      .from("food_entries")
      .select("consumed_at,calories,carbs_g")
      .eq("user_id", user.id)
      .gte("consumed_at", new Date(Date.now() - 21 * 86_400_000).toISOString()),
    supabase
      .from("day_log_status")
      .select("day,status")
      .eq("user_id", user.id)
      .gte("day", new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10)),
    // Distinct plants over the last 7 days for the plant-diversity goal.
    supabase
      .from("food_entries")
      .select("plants")
      .eq("user_id", user.id)
      .gte("consumed_at", sevenDaysAgo),
  ]);

  const entries = (rows ?? []) as FoodEntry[];
  const drinks = (drinkRows ?? []) as Array<{
    id: string;
    drink_type: string;
    volume_ml: number;
    calories: number;
    standard_drinks: number;
  }>;
  const alcoholCalories = Math.round(
    drinks.reduce((s, d) => s + Number(d.calories), 0),
  );
  const foodTotals = sumTotals(entries);
  const totals = {
    ...foodTotals,
    calories: foodTotals.calories + alcoholCalories,
  };

  // Component-level contributors powering the expandable "what contributed to
  // this nutrient" breakdowns. Each entry is split into its individual foods
  // (from the stored AI items), attributed per component and reconciled to the
  // entry's stored totals.
  const contribEntries = buildComponentContributors(
    entries.map((e) => ({
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
        cholesterol_mg: e.cholesterol_mg,
        iron_mg: e.iron_mg,
        calcium_mg: e.calcium_mg,
        magnesium_mg: e.magnesium_mg,
        vitamin_d_mcg: e.vitamin_d_mcg,
        omega3_mg: e.omega3_mg,
      },
    })),
  );

  // Cycle phase for the target day.
  const cycleSettings: CycleSettings = {
    cycleLength: p?.avg_cycle_length ?? 28,
    periodLength: p?.avg_period_length ?? 5,
  };
  let cyclePhase = null as ReturnType<typeof phaseForCycleDay> | null;
  if (p?.track_cycle && p.last_period_start) {
    const cd = cycleDayFromPeriodStart(p.last_period_start, cycleSettings, targetDay);
    cyclePhase = cd ? phaseForCycleDay(cd, cycleSettings) : null;
  }

  const ouraTdeeValues = (ouraRows ?? [])
    .slice(0, 7)
    .map((o) => o.total_calories as number | null)
    .filter((v): v is number => v != null && v > 0);
  const trend = weightTrendLbsPerWeek(
    (weightRows ?? []).map((w) => ({
      measured_at: w.measured_at as string,
      weight_lbs: Number(w.weight_lbs),
    })),
  );
  const { avg: stepsAvg7d, yesterday: stepsYesterday } = avgDailySteps(
    (stepRows ?? []).map((r) => ({
      value: Number(r.value),
      recorded_at: r.recorded_at as string,
    })),
  );
  const incompleteDays = new Set(
    (dayStatusRows ?? [])
      .filter((d) => d.status === "partial" || d.status === "skipped")
      .map((d) => d.day as string),
  );

  // For today, resolve with the full adaptive engine so the numbers match the
  // home card exactly. For a past day, just base + that day's phase.
  const resolved = resolveDailyTargets({
    targetInputs: {
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
      weightLbs: weightRows?.[0] ? Number(weightRows[0].weight_lbs) : null,
      activityLevel: p?.activity_level ?? null,
      goal: p?.goal ?? null,
      proteinPerKg: p?.protein_per_kg ?? null,
      ouraTdee7d: ouraTdeeValues.length ? mean(ouraTdeeValues) : null,
    },
    phase: cyclePhase,
    phaseModifiers: normalizeModifiers(p?.phase_modifiers),
    recent: isToday
      ? recentIntakeFromRows(
          (recentFood ?? []).map((f) => ({
            consumed_at: f.consumed_at as string,
            calories: (f.calories as number | null) ?? null,
            carbs_g: (f.carbs_g as number | null) ?? null,
          })),
          todayKey,
          14,
          incompleteDays,
          tz,
        )
      : [],
    weightTrendLbsPerWeek: isToday ? (trend?.lbsPerWeek ?? null) : null,
    recovery: isToday
      ? {
          readiness: (ouraRows ?? [])[0]?.readiness_score ?? null,
          stepsYesterday,
          avgSteps: stepsAvg7d,
        }
      : null,
  });
  const targets = resolved.targets;

  // Distinct plants this week (positive, additive diversity goal).
  const weeklyPlants = Array.from(
    new Set(
      (plantRows ?? []).flatMap((r) =>
        Array.isArray(r.plants)
          ? (r.plants as string[]).map((p) => p.trim().toLowerCase()).filter(Boolean)
          : [],
      ),
    ),
  ).sort();

  const dateLabel = new Date(`${targetDay}T12:00:00Z`).toLocaleDateString(
    undefined,
    { weekday: "long", month: "long", day: "numeric" },
  );

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-24">
      <header className="space-y-1">
        <Link
          href="/today"
          className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft className="size-4" /> Today
        </Link>
        <h1 className="font-serif text-3xl font-medium leading-tight">
          {isToday ? "Today's log" : "Log"}
        </h1>
        <p className="text-xs text-muted-foreground">{dateLabel}</p>
      </header>

      <Link
        href="/today/week"
        className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm font-medium hover:bg-muted"
      >
        <span>Last 7 days · averages vs goals</span>
        <span className="text-muted-foreground">→</span>
      </Link>

      <MacroTotals
        totals={totals}
        targets={targets}
        metrics={MACRO_METRIC_KEYS}
        entries={contribEntries}
        phaseAdjustment={resolved.phaseAdjustment}
        targetNote={resolved.calorieNote}
        recoveryNote={resolved.recoveryNote}
        balanceNote={resolved.balanceNote}
      />

      {/* Cycle-relevant micronutrients (AI-estimated, directional). */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Micronutrients</h2>
        {MICRO_METRIC_KEYS.map((key) => {
          const def = METRICS[key];
          const { value, target } = metricValueAndTarget(def, totals, targets);
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
              entries={contribEntries}
            />
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          Estimated from your logs against general daily references for women.{" "}
          <Link href="/reanalyze" className="underline underline-offset-2">
            Re-analyze logs
          </Link>
        </p>
      </section>

      {/* Plant diversity — a positive, additive weekly goal. */}
      <section className="space-y-2 rounded-lg border p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Plants this week</h2>
          <span className="font-serif text-2xl tabular-nums">
            {weeklyPlants.length}
            <span className="text-sm text-muted-foreground">
              {" "}/ {PLANT_DIVERSITY_GOAL}
            </span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-[var(--macro-fiber)] transition-all duration-500"
            style={{
              width: `${Math.min(100, (weeklyPlants.length / PLANT_DIVERSITY_GOAL) * 100)}%`,
            }}
          />
        </div>
        {weeklyPlants.length > 0 ? (
          <p className="text-[11px] capitalize text-muted-foreground">
            {weeklyPlants.join(" · ")}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Different fruits, veg, legumes, nuts, seeds, whole grains, herbs &
            spices each count once. Variety feeds a healthier gut.
          </p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Tap an entry to see what each part contributed.
      </p>

      <EntryList entries={entries} />

      {drinks.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Alcohol · {alcoholCalories} kcal
          </h2>
          <div className="divide-y rounded-lg border">
            {drinks.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {describeDrink(d.drink_type, Number(d.volume_ml))}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {Math.round(Number(d.calories))} kcal ·{" "}
                  {(Math.round(Number(d.standard_drinks) * 10) / 10).toFixed(1)}{" "}
                  drinks
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Link
        href={isToday ? "/log" : `/log?date=${targetDay}`}
        className="fixed inset-x-0 bottom-4 mx-auto flex h-12 w-[calc(100%-2rem)] max-w-md items-center justify-center rounded-full bg-primary font-medium text-primary-foreground shadow-lg"
      >
        + Log {isToday ? "food" : "to this day"}
      </Link>
    </main>
  );
}
