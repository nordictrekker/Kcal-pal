import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "../login/actions";
import { dayBounds, sumTotals } from "@/lib/food";
import type { FoodEntry, Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { MacroTotals } from "./macro-totals";
import { EntryList } from "./entry-list";
import { OuraCard, type OuraSnapshot } from "./oura-card";
import { WeightCard, type WeightSnapshot } from "./weight-card";
import { WaterCard } from "./water-card";
import { PhaseFloral } from "./florals";
import {
  phaseForCycleDay,
  cycleDayFromPeriodStart,
  derivedPhases,
  type Phase,
  type CycleSettings,
} from "@/lib/cycle";
import { lastNDays } from "@/lib/stats";
import {
  applyPhaseModifiers,
  describeAdjustments,
  normalizeModifiers,
} from "@/lib/phase-modifiers";
import { pickInsight, avgDailySteps } from "@/lib/insights";
import { buildTrends } from "@/lib/trends";
import { computeTargets } from "@/lib/targets";
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
      .select("date,sleep_score,hrv_avg,readiness_score,total_calories")
      .eq("user_id", user.id)
      .gte("date", fourteenDaysAgoDate)
      .order("date", { ascending: false }),
    supabase
      .from("body_weights")
      .select("weight_lbs,measured_at")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false })
      .limit(1),
    supabase
      .from("apple_health_data")
      .select("value,recorded_at")
      .eq("user_id", user.id)
      .eq("metric", "steps")
      .gte("recorded_at", sevenDaysAgo),
    supabase
      .from("water_logs")
      .select("ml,logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", fourteenDaysAgo),
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
      }
    : null;

  // Cycle is fully automated now: derived from last_period_start (kept
  // current by Apple Health flow ingest). Adjust the date in Settings if
  // the auto-tracker drifts. No cycle info if the user opted out or hasn't
  // logged a period start yet.
  let cycleDay: number | null = null;
  let cyclePhase: Phase | null = null;
  if (p?.track_cycle && p.last_period_start) {
    cycleDay = cycleDayFromPeriodStart(p.last_period_start, cycleSettings, today);
    cyclePhase = cycleDay ? phaseForCycleDay(cycleDay, cycleSettings) : null;
  }

  const weightMostRecent = (weightRows ?? [])[0] ?? null;
  const weightSnapshot: WeightSnapshot = weightMostRecent
    ? {
        weight_lbs: Number(weightMostRecent.weight_lbs),
        measured_at: weightMostRecent.measured_at as string,
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
  const waterAll = (waterRows ?? []).map((r) => ({
    ml: Number(r.ml),
    logged_at: r.logged_at as string,
  }));
  const waterTodayMl = waterAll
    .filter((w) => new Date(w.logged_at) >= startOfToday)
    .reduce((sum, w) => sum + w.ml, 0);
  const waterTargetMl = p?.daily_water_target_ml ?? 2400;

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

  // Greeting + phase blurb. Tiny, warm, not chatty.
  const now = new Date();
  const hour = now.getHours();
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
    hydration: { todayMl: waterTodayMl, targetMl: waterTargetMl },
    todayMacros: totals,
    targets,
    trends,
    now,
  });

  return (
    <main
      data-phase={cyclePhase ?? undefined}
      className="mx-auto max-w-md p-4 space-y-5 pb-24"
    >
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

      {ouraEnabled ? <OuraCard data={ouraSnapshot} /> : null}
      <WeightCard latest={weightSnapshot} />
      <WaterCard todayMl={waterTodayMl} targetMl={waterTargetMl} />

      <MacroTotals
        totals={totals}
        targets={targets}
        phaseAdjustment={phaseAdjustment}
        targetNote={
          computedTargets.source !== "manual" ? computedTargets.note : null
        }
      />

      <EntryList entries={list} />

      <nav className="flex justify-center gap-4 pt-2 text-sm text-muted-foreground">
        <Link href="/weekly" className="underline-offset-4 hover:underline">
          Weekly
        </Link>
        <Link href="/import" className="underline-offset-4 hover:underline">
          Import Health
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
