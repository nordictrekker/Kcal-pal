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
import {
  isPhase,
  phaseForCycleDay,
  predictCycleDay,
} from "@/lib/cycle";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { start, end } = dayBounds();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: entries },
    { data: ouraRows },
    { data: cycleRows },
    { data: weightRows },
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
      .from("oura_daily")
      .select("date,sleep_score,hrv_avg,readiness_score")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(1),
    supabase
      .from("cycle_days")
      .select("date,cycle_day,phase")
      .eq("user_id", user.id)
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(1),
    supabase
      .from("body_weights")
      .select("weight_lbs,measured_at")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false })
      .limit(1),
  ]);

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

  // Only render the integration cards if the credentials are configured.
  // Avoids a screaming red "not set" banner on the dashboard for things
  // the user hasn't opted into.
  const ouraEnabled = Boolean(process.env.OURA_PERSONAL_ACCESS_TOKEN);

  const targets = {
    calories: p?.daily_calorie_target ?? 2000,
    protein_g: p?.daily_protein_target_g ?? 130,
    carbs_g: p?.daily_carb_target_g ?? 220,
    fat_g: p?.daily_fat_target_g ?? 70,
    fiber_g: p?.daily_fiber_target_g ?? 30,
  };

  return (
    <main className="mx-auto max-w-md p-4 space-y-6 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Today</h1>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </header>

      {ouraEnabled ? <OuraCard data={ouraSnapshot} /> : null}
      <WeightCard latest={weightSnapshot} />
      <CycleCard initial={cycleSnapshot} />

      <MacroTotals totals={totals} targets={targets} />

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
