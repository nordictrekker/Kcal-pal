import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "../login/actions";
import { dayBounds, sumTotals } from "@/lib/food";
import type { FoodEntry, Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { MacroTotals } from "./macro-totals";
import { OuraCard, type OuraSnapshot } from "./oura-card";
import { WeightCard, type WeightSnapshot } from "./weight-card";
import { WaterCard } from "./water-card";
import { CycleForecastCard } from "./cycle-forecast-card";
import { PhaseFloral } from "./florals";
import {
  phaseForCycleDay,
  cycleDayFromPeriodStart,
  derivedPhases,
  type Phase,
  type CycleSettings,
} from "@/lib/cycle";
import {
  allPeriodStarts,
  forecastCycle,
  cycleLengthVariance,
  type CycleForecast,
} from "@/lib/cycles";
import { lastNDays } from "@/lib/stats";
import {
  applyPhaseModifiers,
  describeAdjustments,
  normalizeModifiers,
} from "@/lib/phase-modifiers";
import { pickInsight, avgDailySteps } from "@/lib/insights";
import { buildTrends } from "@/lib/trends";
import {
  computeWaterGoalMl,
  describeWaterGoal,
  detectBeverageFluids,
  effectiveFluidMl,
} from "@/lib/hydration";
import { zonedNow } from "@/lib/timezone";
import { TimezoneSync } from "./timezone-sync";
import { computeTargets, weightTrendLbsPerWeek, projectGoalEta } from "@/lib/targets";
import { mean } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { start, end } = dayBounds();
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  // 14-day window powers the trend memory below; one query, used twice.
  const fourteenDaysAgo = new Date(
    Date.now() - 14 * 86_400_000,
  ).toISOString();
  const fourteenDaysAgoDate = fourteenDaysAgo.slice(0, 10);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    { data: profile },
    { data: trendFood },
    { data: trendOura },
    { data: weightRows },
    { data: stepRows },
    { data: waterRows },
    { data: flowRows },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase
      .from("food_entries")
      .select("consumed_at,calories,protein_g,carbs_g,fat_g,fiber_g,id,user_id,meal,description,source,photo_url,barcode,serving_size,raw_ai_response,edited_by_user,created_at")
      .eq("user_id", user.id)
      .gte("consumed_at", fourteenDaysAgo)
      .order("consumed_at", { ascending: true }),
    supabase
      .from("oura_daily")
      .select(
        "date,sleep_score,hrv_avg,readiness_score,total_calories,resilience_level,stress_high_min",
      )
      .eq("user_id", user.id)
      .gte("date", fourteenDaysAgoDate)
      .order("date", { ascending: false }),
    // Pull the last 60 days of weight readings — latest for the card,
    // the rest feed the linear-trend projection below.
    supabase
      .from("body_weights")
      .select("weight_lbs,measured_at")
      .eq("user_id", user.id)
      .gte("measured_at", new Date(Date.now() - 60 * 86_400_000).toISOString())
      .order("measured_at", { ascending: false }),
    supabase
      .from("apple_health_data")
      .select("value,recorded_at")
      .eq("user_id", user.id)
      .eq("metric", "steps")
      .gte("recorded_at", sevenDaysAgo),
    supabase
      .from("water_logs")
      .select("ml,logged_at,kind,hydration_factor")
      .eq("user_id", user.id)
      .gte("logged_at", fourteenDaysAgo),
    // Last ~9 months of menstrual flow samples → drives forecast variance
    // and cross-cycle comparisons.
    supabase
      .from("apple_health_data")
      .select("value,recorded_at")
      .eq("user_id", user.id)
      .eq("metric", "menstrual_flow")
      .gte("recorded_at", new Date(Date.now() - 270 * 86_400_000).toISOString())
      .order("recorded_at", { ascending: true }),
  ]);

  // Today's entries are a subset of the trend window — slice locally
  // instead of issuing a second query.
  const entries = (trendFood ?? []).filter(
    (e) => (e.consumed_at as string) >= start && (e.consumed_at as string) < end,
  );
  const ouraRows = trendOura;
  const p = profile as Profile | null;

  // First run → onboarding wizard. Everything below assumes we know who
  // the user is (age, weight, goal) for the smarter targets.
  if (p && !p.onboarding_completed) redirect("/onboarding");

  const cycleSettings: CycleSettings = {
    cycleLength: p?.avg_cycle_length ?? 28,
    periodLength: p?.avg_period_length ?? 5,
  };

  // Show today's Oura row if available; otherwise the most recent one
  // we have (last night's sleep may not be exported yet first thing
  // in the morning).
  const ouraMostRecent = (ouraRows ?? [])[0] ?? null;
  const ouraSnapshot: OuraSnapshot = ouraMostRecent
    ? {
        date: ouraMostRecent.date as string,
        sleep_score: ouraMostRecent.sleep_score as number | null,
        hrv_avg: ouraMostRecent.hrv_avg as number | null,
        readiness_score: ouraMostRecent.readiness_score as number | null,
        resilience_level: ouraMostRecent.resilience_level as string | null,
        stress_high_min: ouraMostRecent.stress_high_min as number | null,
      }
    : null;

  // Cycle is fully automated now: derived from last_period_start (kept
  // current by Apple Health flow ingest). Adjust the date in Settings if
  // the auto-tracker drifts. No cycle info if the user opted out or hasn't
  // logged a period start yet.
  let cycleDay: number | null = null;
  let cyclePhase: Phase | null = null;
  let cycleForecast: CycleForecast | null = null;
  if (p?.track_cycle && p.last_period_start) {
    cycleDay = cycleDayFromPeriodStart(p.last_period_start, cycleSettings, today);
    cyclePhase = cycleDay ? phaseForCycleDay(cycleDay, cycleSettings) : null;
    // Period history → personalized forecast variance. Falls back to ±3.
    const flowSamples = (flowRows ?? []).map((r) => ({
      value: Number(r.value),
      recorded_at: r.recorded_at as string,
    }));
    const starts = allPeriodStarts(flowSamples);
    const stdev = cycleLengthVariance(starts);
    const variance = stdev != null ? Math.max(1, Math.round(stdev)) : 3;
    cycleForecast = forecastCycle(
      p.last_period_start,
      cycleSettings,
      today,
      variance,
    );
  }

  const weightMostRecent = (weightRows ?? [])[0] ?? null;
  const weightSnapshot: WeightSnapshot = weightMostRecent
    ? {
        weight_lbs: Number(weightMostRecent.weight_lbs),
        measured_at: weightMostRecent.measured_at as string,
      }
    : null;

  // Weight trend over the last 60 days + projected ETA to goal (when set).
  const trend = weightTrendLbsPerWeek(
    (weightRows ?? []).map((r) => ({
      measured_at: r.measured_at as string,
      weight_lbs: Number(r.weight_lbs),
    })),
  );
  const goalEta = projectGoalEta({
    currentLbs: weightSnapshot?.weight_lbs ?? null,
    goalLbs: p?.goal_weight_lbs ?? null,
    trend,
  });
  const weightProjection =
    trend && weightSnapshot
      ? {
          lbsPerWeek: trend.lbsPerWeek,
          goalLbs: p?.goal_weight_lbs ?? null,
          etaDate: goalEta?.etaDate ?? null,
          weeksAway: goalEta?.weeksAway ?? null,
        }
      : null;

  const list = (entries ?? []) as FoodEntry[];
  const totals = sumTotals(list);

  const { avg: stepsAvg7d, yesterday: stepsYesterday } = avgDailySteps(
    (stepRows ?? []).map((r) => ({
      value: Number(r.value),
      recorded_at: r.recorded_at as string,
    })),
  );

  // Today's hydration total, plus a 14-day water history for trend memory.
  // Each row carries a hydration factor (water 1.0, coffee/tea ≈ 0.9, …); the
  // effective fluid that counts toward the goal is ml * factor.
  const waterAll = (waterRows ?? []).map((r) => ({
    ml: Number(r.ml),
    logged_at: r.logged_at as string,
    hydration_factor:
      r.hydration_factor != null ? Number(r.hydration_factor) : 1,
  }));
  const waterToday = waterAll.filter(
    (w) => new Date(w.logged_at) >= startOfToday,
  );
  // Logged fluid (water + beverage buttons), weighted by hydration factor.
  const loggedFluidMl = Math.round(effectiveFluidMl(waterToday));
  // Drinks logged as food with a meal (a latte, a protein shake) also count.
  const autoFluidMl = detectBeverageFluids(
    entries.map((e) => ({
      description: (e.description as string | null) ?? null,
      serving_size: (e.serving_size as string | null) ?? null,
    })),
  ).reduce((sum, d) => sum + d.effectiveMl, 0);
  const waterTodayMl = loggedFluidMl + autoFluidMl;
  // Fluid logged in the last 90 minutes — lets the insight tell a fresh
  // glass from a daily total still catching up.
  const recentCutoff = new Date(Date.now() - 90 * 60 * 1000);
  const recentFluidMl = Math.round(
    effectiveFluidMl(
      waterToday.filter((w) => new Date(w.logged_at) >= recentCutoff),
    ),
  );
  // Smart goal: weight + activity when in auto mode; manual target otherwise.
  const waterAuto = (p?.water_goal_mode ?? "auto") === "auto";
  const smartGoalInput = {
    weightLbs: weightSnapshot?.weight_lbs ?? null,
    avgSteps: stepsAvg7d,
  };
  const waterTargetMl = waterAuto
    ? computeWaterGoalMl(smartGoalInput)
    : (p?.daily_water_target_ml ?? 2400);
  const waterGoalNote = waterAuto ? describeWaterGoal(smartGoalInput) : undefined;

  // Only render the integration cards if the credentials are configured.
  // Avoids a screaming red "not set" banner on the dashboard for things
  // the user hasn't opted into.
  const ouraEnabled = Boolean(process.env.OURA_PERSONAL_ACCESS_TOKEN);

  const manualTargets = {
    calories: p?.daily_calorie_target ?? 2000,
    protein_g: p?.daily_protein_target_g ?? 130,
    carbs_g: p?.daily_carb_target_g ?? 220,
    fat_g: p?.daily_fat_target_g ?? 70,
    fiber_g: p?.daily_fiber_target_g ?? 30,
  };

  // Smarter targets. In auto mode this derives from biometrics + goal and
  // prefers the real 7-day Oura energy burn (total_calories) over a static
  // activity multiplier, so calories self-tune to how active the week was.
  const ouraTdeeValues = (trendOura ?? [])
    .slice(0, 7)
    .map((o) => o.total_calories as number | null)
    .filter((v): v is number => v != null && v > 0);
  const ouraTdee7d = ouraTdeeValues.length ? mean(ouraTdeeValues) : null;

  const computedTargets = computeTargets({
    mode: p?.target_mode ?? "manual",
    manual: manualTargets,
    sex: p?.sex ?? null,
    dateOfBirth: p?.date_of_birth ?? null,
    heightIn: p?.height_in ?? null,
    weightLbs: weightSnapshot?.weight_lbs ?? null,
    activityLevel: p?.activity_level ?? null,
    goal: p?.goal ?? null,
    proteinPerKg: p?.protein_per_kg ?? null,
    ouraTdee7d,
  });
  const baseTargets = computedTargets.targets;

  // If we have a current cycle phase, adjust targets by the per-phase
  // modifiers stored in the profile. No-op if phase is unknown.
  const phaseModifiers = normalizeModifiers(p?.phase_modifiers);
  const currentPhase = cyclePhase;
  const targets = applyPhaseModifiers(baseTargets, currentPhase, phaseModifiers);
  const adjustmentDescription = currentPhase
    ? describeAdjustments(phaseModifiers[currentPhase])
    : null;
  const phaseAdjustment =
    currentPhase && adjustmentDescription
      ? { phase: currentPhase, description: adjustmentDescription }
      : null;

  // Greeting + phase blurb. Tiny, warm, not chatty. `localNow` reflects the
  // user's phone timezone so time-of-day logic (greeting, hydration pacing)
  // matches their wall clock rather than the server's UTC.
  const now = new Date();
  const localNow = zonedNow(p?.timezone ?? null, now);
  const hour = localNow.getHours();
  // Travel: a stored previous zone different from the current one, set
  // recently, means the user crossed time zones.
  const travel =
    p?.previous_timezone &&
    p?.timezone &&
    p?.timezone_updated_at &&
    p.previous_timezone !== p.timezone
      ? {
          fromTz: p.previous_timezone,
          toTz: p.timezone,
          daysAgo:
            (Date.now() - new Date(p.timezone_updated_at).getTime()) /
            86_400_000,
        }
      : null;
  const timeGreeting =
    hour < 5 ? "Late night"
    : hour < 12 ? "Good morning"
    : hour < 17 ? "Good afternoon"
    : hour < 22 ? "Good evening"
    : "Late night";
  const firstName = p?.first_name?.trim();
  const greeting = firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;

  // Trend memory: 14-day rollups so the insight engine can spot patterns
  // (third luteal day in a row over carbs, protein-drought streaks, etc.)
  // instead of judging today in isolation. Phases derived from
  // last_period_start so they match the snapshot above.
  const trendDays = lastNDays(14, now);
  const trends = buildTrends({
    food: (trendFood ?? []).map((f) => ({
      consumed_at: f.consumed_at as string,
      calories: (f.calories as number | null) ?? null,
      protein_g: (f.protein_g as number | null) ?? null,
      carbs_g: (f.carbs_g as number | null) ?? null,
      fat_g: (f.fat_g as number | null) ?? null,
      fiber_g: (f.fiber_g as number | null) ?? null,
    })),
    oura: (trendOura ?? []).map((o) => ({
      date: o.date as string,
      sleep_score: (o.sleep_score as number | null) ?? null,
      hrv_avg: (o.hrv_avg as number | null) ?? null,
      readiness_score: (o.readiness_score as number | null) ?? null,
    })),
    cycle: derivedPhases(
      p?.track_cycle ? (p.last_period_start ?? null) : null,
      cycleSettings,
      trendDays,
    ),
    water: waterAll,
    targets: baseTargets,
    today: now,
  });

  // Holistic insight — pulls from phase, recovery, activity, macros, trends,
  // hydration. Falls back to null on the rare case nothing matches (shouldn't —
  // there's a neutral default rule).
  const insight = pickInsight({
    phase: cyclePhase,
    cycleDay,
    oura: {
      readiness: ouraSnapshot?.readiness_score ?? null,
      sleep: ouraSnapshot?.sleep_score ?? null,
      hrv: ouraSnapshot?.hrv_avg ?? null,
    },
    activity: { stepsAvg7d, stepsYesterday },
    hydration: {
      todayMl: waterTodayMl,
      targetMl: waterTargetMl,
      recentMl: recentFluidMl,
    },
    forecast: cycleForecast
      ? {
          daysUntilPeriod: cycleForecast.daysUntil,
          inFertileWindow: cycleForecast.inFertileWindow,
          overdue: cycleForecast.overdue,
        }
      : null,
    todayMacros: totals,
    targets,
    trends,
    travel,
    now: localNow,
  });

  return (
    <main
      data-phase={cyclePhase ?? undefined}
      className="mx-auto max-w-md p-4 space-y-5 pb-24"
    >
      <TimezoneSync storedTz={p?.timezone ?? null} />
      <header className="relative space-y-2">
        {cyclePhase ? (
          <PhaseFloral
            phase={cyclePhase}
            className="pointer-events-none absolute -right-2 -top-2 h-20 w-32 text-primary opacity-[0.12]"
          />
        ) : null}
        <div className="relative flex items-start justify-between">
          <div className="space-y-0.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {greeting}
            </p>
            <h1 className="font-serif text-3xl font-medium leading-tight">
              Today
            </h1>
            {cyclePhase && cycleDay ? (
              <p className="text-xs text-muted-foreground">
                <span className="capitalize">{cyclePhase}</span>
                <span className="text-foreground/50"> · day {cycleDay}</span>
              </p>
            ) : null}
          </div>
          <form action={signOut}>
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
        {insight ? (
          <p className="relative max-w-[34ch] font-serif text-[15px] italic leading-snug text-foreground/80">
            {insight.text}
          </p>
        ) : null}
      </header>

      <Link href="/today/summary" className="block" aria-label="View today's full log">
        <MacroTotals
          totals={totals}
          targets={targets}
          phaseAdjustment={phaseAdjustment}
          targetNote={
            computedTargets.source !== "manual" ? computedTargets.note : null
          }
          showLogHint
        />
      </Link>

      {ouraEnabled ? <OuraCard data={ouraSnapshot} /> : null}

      {cycleForecast && cycleDay ? (
        <CycleForecastCard
          forecast={cycleForecast}
          cycleDay={cycleDay}
          cycleLength={cycleSettings.cycleLength}
        />
      ) : null}

      <WaterCard
        loggedMl={loggedFluidMl}
        autoFluidMl={autoFluidMl}
        targetMl={waterTargetMl}
        goalNote={waterGoalNote}
      />

      <WeightCard latest={weightSnapshot} projection={weightProjection} />

      <nav className="flex justify-center gap-4 pt-2 text-sm text-muted-foreground">
        <Link href="/weekly" className="underline-offset-4 hover:underline">
          Trends
        </Link>
        <Link href="/recap" className="underline-offset-4 hover:underline">
          Recap
        </Link>
        <Link href="/settings" className="underline-offset-4 hover:underline">
          Settings
        </Link>
      </nav>

      <Link
        href="/log"
        className="fixed inset-x-0 bottom-4 mx-auto flex h-12 w-[calc(100%-2rem)] max-w-md items-center justify-center rounded-full bg-primary font-medium text-primary-foreground shadow-lg"
      >
        + Log food
      </Link>
    </main>
  );
}
