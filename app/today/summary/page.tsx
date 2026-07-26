import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import {
  localDayKey,
  localDayBoundsUTC,
  addDaysToKey,
} from "@/lib/timezone";
import {
  MACRO_METRIC_KEYS,
  MICRO_METRIC_KEYS,
  PLANT_DIVERSITY_GOAL,
} from "@/lib/nutrients";
import { cleanPlants } from "@/lib/plants";
import {
  buildComponentContributors,
  mergeContributorsByLabel,
  type EntryForContrib,
} from "@/lib/contributions";
import type { Totals } from "@/lib/food";
import type { FoodEntry, Profile } from "@/lib/types";
import { EntryList } from "../entry-list";
import { SummaryPanels } from "./summary-panels";
import { FoodInsightCard } from "./insight-card";
import type { InsightState } from "./insight-actions";
import { isoYearWeek } from "@/lib/digest";

export const dynamic = "force-dynamic";

// Slim a stored entry down to what the contributor breakdown needs.
function toContribInput(e: FoodEntry): EntryForContrib {
  return {
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
  };
}

// Scale every numeric field of a totals object (e.g. ×1/7 for a daily average).
function scaleTotals(t: Totals, factor: number): Totals {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "number") out[k] = v * factor;
  }
  return out as Totals;
}

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

  // 7-day average window (only used for the Today⇄7-day-average toggle, which
  // only appears on today). The 7 local day-keys ending today, and the UTC
  // bounds covering them for the entry query.
  const weekDayKeys = Array.from({ length: 7 }, (_, i) =>
    addDaysToKey(todayKey, -(6 - i)),
  );
  const weekWindowStart = localDayBoundsUTC(tz, weekDayKeys[0]).start;
  const weekWindowEnd = localDayBoundsUTC(tz, todayKey).end;

  const [
    { data: rows },
    { data: drinkRows },
    { data: weightRows },
    { data: ouraRows },
    { data: stepRows },
    { data: recentFood },
    { data: dayStatusRows },
    { data: plantRows },
    { data: weekRows },
    { data: weekDrinkRows },
    { data: insightRow },
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
    // Full entries over the 7-day window, for the average view's totals and
    // top-contributor breakdowns (fetched only when viewing today).
    isToday
      ? supabase
          .from("food_entries")
          .select("*")
          .eq("user_id", user.id)
          .gte("consumed_at", weekWindowStart)
          .lt("consumed_at", weekWindowEnd)
          .order("consumed_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    isToday
      ? supabase
          .from("alcohol_logs")
          .select("calories,logged_at")
          .eq("user_id", user.id)
          .gte("logged_at", weekWindowStart)
          .lt("logged_at", weekWindowEnd)
      : Promise.resolve({ data: [] }),
    // Cached food-insights note for the current week (today only) — fetched in
    // parallel here instead of a follow-up round trip after this Promise.all.
    isToday
      ? supabase
          .from("food_insights")
          .select("summary,generated_at")
          .eq("user_id", user.id)
          .eq("year_week", isoYearWeek())
          .maybeSingle()
      : Promise.resolve({ data: null }),
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
  const contribEntries = buildComponentContributors(entries.map(toContribInput));

  // Cycle phase for the target day.
  const cycleSettings: CycleSettings = {
    cycleLength: p?.avg_cycle_length ?? 28,
    periodLength: p?.avg_period_length ?? 5,
  };
  const phaseModifiers = normalizeModifiers(p?.phase_modifiers);
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
    weightLbs: weightRows?.[0] ? Number(weightRows[0].weight_lbs) : null,
    activityLevel: p?.activity_level ?? null,
    goal: p?.goal ?? null,
    proteinPerKg: p?.protein_per_kg ?? null,
    ouraTdee7d: ouraTdeeValues.length ? mean(ouraTdeeValues) : null,
  };

  const resolved = resolveDailyTargets({
    targetInputs,
    phase: cyclePhase,
    phaseModifiers,
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

  // 7-day average dataset for the Today⇄7-day-average toggle (today only). The
  // calorie/macro/micro values are daily averages over the window; the targets
  // are the per-day goals (cycle-phase aware) averaged; the contributors are the
  // week's component foods merged by name and scaled to a per-day average.
  let week: {
    totals: Totals;
    targets: Totals;
    contribEntries: typeof contribEntries;
    daysLogged: number;
  } | null = null;
  if (isToday) {
    const weekEntries = (weekRows ?? []) as FoodEntry[];
    const weekDrinks = (weekDrinkRows ?? []) as Array<{
      calories: number;
      logged_at: string;
    }>;

    // Average the per-day macro goals across the window (micros use static
    // references, resolved later from the metric registry).
    const goalSum = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
    let daysLogged = 0;
    for (const day of weekDayKeys) {
      const { start, end } = localDayBoundsUTC(tz, day);
      const sMs = Date.parse(start);
      const eMs = Date.parse(end);
      const logged =
        weekEntries.some((e) => {
          const t = Date.parse(e.consumed_at);
          return t >= sMs && t < eMs;
        }) ||
        weekDrinks.some((d) => {
          const t = Date.parse(d.logged_at);
          return t >= sMs && t < eMs;
        });
      if (logged) daysLogged += 1;

      let phase = null as ReturnType<typeof phaseForCycleDay> | null;
      if (p?.track_cycle && p.last_period_start) {
        const cd = cycleDayFromPeriodStart(p.last_period_start, cycleSettings, day);
        phase = cd ? phaseForCycleDay(cd, cycleSettings) : null;
      }
      const r = resolveDailyTargets({
        targetInputs: { ...targetInputs, ouraTdee7d: null },
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
    const weekAlcoholCal = weekDrinks.reduce((s, d) => s + Number(d.calories), 0);
    const weekAvgTotals = scaleTotals(
      { ...weekFoodTotals, calories: weekFoodTotals.calories + weekAlcoholCal },
      1 / 7,
    );
    const weekAvgTargets: Totals = {
      calories: Math.round(goalSum.calories / 7),
      protein_g: goalSum.protein_g / 7,
      carbs_g: goalSum.carbs_g / 7,
      fat_g: goalSum.fat_g / 7,
      fiber_g: goalSum.fiber_g / 7,
    };
    const weekContribEntries = mergeContributorsByLabel(
      buildComponentContributors(weekEntries.map(toContribInput)),
      1 / 7,
    );

    week = {
      totals: weekAvgTotals,
      targets: weekAvgTargets,
      contribEntries: weekContribEntries,
      daysLogged,
    };
  }

  // Cached food-insights note for the current week (today view only); the card
  // can (re)generate it on demand.
  const weekInsightInitial: InsightState = insightRow
    ? {
        status: "ready",
        summary: insightRow.summary as string,
        generatedAt: insightRow.generated_at as string,
      }
    : { status: "empty" };

  // Distinct plants this week (positive, additive diversity goal). Flavourings
  // and seasonings (coffee, vanilla, herbs & spices) are filtered out so only
  // meaningful servings of fruit/veg/whole-plant foods count.
  const weeklyPlants = cleanPlants(
    (plantRows ?? []).flatMap((r) =>
      Array.isArray(r.plants) ? (r.plants as string[]) : [],
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
        {/* Step day-by-day through past logs to review or edit entries. */}
        <nav className="flex items-center justify-between gap-2">
          <Link
            href={`/today/summary?date=${addDaysToKey(targetDay, -1)}`}
            aria-label="Previous day"
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Prev
          </Link>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
          {isToday ? (
            <span
              aria-hidden
              className="inline-flex min-h-9 items-center gap-1 px-2 text-sm text-transparent"
            >
              Next <ChevronRight className="size-4" />
            </span>
          ) : (
            <Link
              href={`/today/summary?date=${addDaysToKey(targetDay, 1)}`}
              aria-label="Next day"
              className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Next <ChevronRight className="size-4" />
            </Link>
          )}
        </nav>
      </header>

      <SummaryPanels
        macroKeys={MACRO_METRIC_KEYS}
        microKeys={MICRO_METRIC_KEYS}
        today={{ totals, targets, contribEntries }}
        week={week}
        notes={{
          phaseAdjustment: resolved.phaseAdjustment,
          targetNote: resolved.calorieNote,
          recoveryNote: resolved.recoveryNote,
          balanceNote: resolved.balanceNote,
        }}
        weeklyExtras={
          /* Plant diversity — a positive, additive weekly goal. */
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
                Different fruits, vegetables, legumes, nuts & seeds each count
                once when you eat enough to meaningfully add vitamins, minerals,
                or fibre. Grains, flavourings & seasonings (coffee, vanilla,
                herbs &amp; spices) don&apos;t count.
              </p>
            )}
          </section>
        }
        weekInsight={<FoodInsightCard initial={weekInsightInitial} />}
        dayChildren={
          <>
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
                        {(
                          Math.round(Number(d.standard_drinks) * 10) / 10
                        ).toFixed(1)}{" "}
                        drinks
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        }
      />

      <Link
        href={isToday ? "/log" : `/log?date=${targetDay}`}
        className="fixed inset-x-0 bottom-4 mx-auto flex h-12 w-[calc(100%-2rem)] max-w-md items-center justify-center rounded-full bg-primary font-medium text-primary-foreground shadow-lg"
      >
        + Log {isToday ? "food" : "to this day"}
      </Link>
    </main>
  );
}
