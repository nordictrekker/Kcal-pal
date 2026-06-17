import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dayBounds, sumTotals } from "@/lib/food";
import { describeDrink } from "@/lib/alcohol";
import { mean } from "@/lib/stats";
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
import type { FoodEntry, Profile } from "@/lib/types";
import { MacroTotals } from "../macro-totals";
import { EntryList } from "../entry-list";

export const dynamic = "force-dynamic";

// Full food log for today: tap any entry to expand its component macros.
export default async function SummaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { start, end } = dayBounds();
  const todayKey = new Date().toISOString().slice(0, 10);
  const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const sevenDaysAgoDate = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [
    { data: profile },
    { data: rows },
    { data: drinkRows },
    { data: weightRows },
    { data: ouraRows },
    { data: recentFood },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("consumed_at", start)
      .lt("consumed_at", end)
      .order("consumed_at", { ascending: true }),
    supabase
      .from("alcohol_logs")
      .select("id,drink_type,volume_ml,calories,standard_drinks,logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", start)
      .lt("logged_at", end)
      .order("logged_at", { ascending: true }),
    supabase
      .from("body_weights")
      .select("weight_lbs,measured_at")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false })
      .limit(1),
    supabase
      .from("oura_daily")
      .select("date,total_calories")
      .eq("user_id", user.id)
      .gte("date", sevenDaysAgoDate)
      .order("date", { ascending: false }),
    supabase
      .from("food_entries")
      .select("consumed_at,calories,carbs_g")
      .eq("user_id", user.id)
      .gte("consumed_at", eightDaysAgo),
  ]);

  const p = profile as Profile | null;
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

  // Resolve targets exactly like the home card (same inputs → same numbers).
  const cycleSettings: CycleSettings = {
    cycleLength: p?.avg_cycle_length ?? 28,
    periodLength: p?.avg_period_length ?? 5,
  };
  let cyclePhase = null as ReturnType<typeof phaseForCycleDay> | null;
  if (p?.track_cycle && p.last_period_start) {
    const cd = cycleDayFromPeriodStart(p.last_period_start, cycleSettings, todayKey);
    cyclePhase = cd ? phaseForCycleDay(cd, cycleSettings) : null;
  }
  const ouraTdeeValues = (ouraRows ?? [])
    .slice(0, 7)
    .map((o) => o.total_calories as number | null)
    .filter((v): v is number => v != null && v > 0);
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
      weightLbs: weightRows?.[0]
        ? Number(weightRows[0].weight_lbs)
        : null,
      activityLevel: p?.activity_level ?? null,
      goal: p?.goal ?? null,
      proteinPerKg: p?.protein_per_kg ?? null,
      ouraTdee7d: ouraTdeeValues.length ? mean(ouraTdeeValues) : null,
    },
    phase: cyclePhase,
    phaseModifiers: normalizeModifiers(p?.phase_modifiers),
    recent: recentIntakeFromRows(
      (recentFood ?? []).map((f) => ({
        consumed_at: f.consumed_at as string,
        calories: (f.calories as number | null) ?? null,
        carbs_g: (f.carbs_g as number | null) ?? null,
      })),
      todayKey,
      7,
    ),
  });
  const targets = resolved.targets;

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-24">
      <header className="space-y-1">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft className="size-4" /> Today
        </Link>
        <h1 className="font-serif text-3xl font-medium leading-tight">
          Today&apos;s log
        </h1>
        <p className="text-xs text-muted-foreground">{dateLabel}</p>
      </header>

      <MacroTotals
        totals={totals}
        targets={targets}
        phaseAdjustment={resolved.phaseAdjustment}
        targetNote={resolved.calorieNote}
        balanceNote={resolved.balanceNote}
      />

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
        href="/log"
        className="fixed inset-x-0 bottom-4 mx-auto flex h-12 w-[calc(100%-2rem)] max-w-md items-center justify-center rounded-full bg-primary font-medium text-primary-foreground shadow-lg"
      >
        + Log food
      </Link>
    </main>
  );
}
