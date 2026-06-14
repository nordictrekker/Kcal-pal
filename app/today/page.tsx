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
import { CycleCard, type CycleSnapshot } from "./cycle-card";
import { WeightCard, type WeightSnapshot } from "./weight-card";
import { WaterCard } from "./water-card";
import { PhaseFloral } from "./florals";
import {
  isPhase,
  phaseForCycleDay,
  predictCycleDay,
} from "@/lib/cycle";
import {
  applyPhaseModifiers,
  describeAdjustments,
  normalizeModifiers,
} from "@/lib/phase-modifiers";
import { pickInsight, avgDailySteps } from "@/lib/insights";
import { buildTrends } from "@/lib/trends";

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
    { data: trendCycle },
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
      .select("date,sleep_score,hrv_avg,readiness_score")
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
  const cycleRows = trendCycle;

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

  // Cycle snapshot: prefer today's stored row; otherwise project forward
  // from the most recent entry so the widget pre-fills with a sensible
  // guess instead of asking for a fresh count every day.
  const cycleMostRecent = (cycleRows ?? [])[0] ?? null;
  let cycleSnapshot: CycleSnapshot;
  if (cycleMostRecent && cycleMostRecent.date === today) {
    const phaseRaw =
      typeof cycleMostRecent.phase === "string" ? cycleMostRecent.phase : null;
    cycleSnapshot = {
      day: (cycleMostRecent.cycle_day as number | null) ?? null,
      phase: phaseRaw && isPhase(phaseRaw) ? phaseRaw : null,
      source: "today",
    };
  } else if (cycleMostRecent) {
    const projected = predictCycleDay(
      {
        date: cycleMostRecent.date as string,
        cycle_day: cycleMostRecent.cycle_day as number | null,
      },
      today,
    );
    cycleSnapshot = {
      day: projected,
      phase: projected ? phaseForCycleDay(projected) : null,
      source: "predicted",
    };
  } else {
    cycleSnapshot = { day: null, phase: null, source: "empty" };
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
  const p = profile as Profile | null;

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

  const baseTargets = {
    calories: p?.daily_calorie_target ?? 2000,
    protein_g: p?.daily_protein_target_g ?? 130,
    carbs_g: p?.daily_carb_target_g ?? 220,
    fat_g: p?.daily_fat_target_g ?? 70,
    fiber_g: p?.daily_fiber_target_g ?? 30,
  };

  // If we have a current cycle phase, adjust targets by the per-phase
  // modifiers stored in the profile. No-op if phase is unknown.
  const phaseModifiers = normalizeModifiers(p?.phase_modifiers);
  const currentPhase = cycleSnapshot.phase;
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
  const greeting =
    hour < 5 ? "Late night"
    : hour < 12 ? "Good morning"
    : hour < 17 ? "Good afternoon"
    : hour < 22 ? "Good evening"
    : "Late night";

  // Trend memory: 14-day rollups so the insight engine can spot patterns
  // (third luteal day in a row over carbs, protein-drought streaks, etc.)
  // instead of judging today in isolation.
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
    cycle: (trendCycle ?? []).map((c) => ({
      date: c.date as string,
      phase: (c.phase as string | null) ?? null,
    })),
    water: waterAll,
    targets: baseTargets,
    today: now,
  });

  // Holistic insight — pulls from phase, recovery, activity, macros, trends,
  // hydration. Falls back to null on the rare case nothing matches (shouldn't —
  // there's a neutral default rule).
  const insight = pickInsight({
    phase: cycleSnapshot.phase,
    cycleDay: cycleSnapshot.day,
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
      data-phase={cycleSnapshot.phase ?? undefined}
      className="mx-auto max-w-md p-4 space-y-5 pb-24"
    >
      <header className="relative space-y-2">
        {cycleSnapshot.phase ? (
          <PhaseFloral
            phase={cycleSnapshot.phase}
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
            {cycleSnapshot.phase && cycleSnapshot.day ? (
              <p className="text-xs text-muted-foreground">
                <span className="capitalize">{cycleSnapshot.phase}</span>
                <span className="text-foreground/50"> · day {cycleSnapshot.day}</span>
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
      <CycleCard initial={cycleSnapshot} />

      <MacroTotals
        totals={totals}
        targets={targets}
        phaseAdjustment={phaseAdjustment}
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
