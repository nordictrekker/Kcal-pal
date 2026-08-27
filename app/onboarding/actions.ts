"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OnboardingPayload = {
  first_name: string;
  date_of_birth: string; // YYYY-MM-DD
  sex: "female" | "male" | "other";
  height_in: number;
  weight_lbs: number;
  activity_level: string;
  goal: "lose" | "maintain" | "gain" | "muscle";
  goal_weight_lbs: number | null;
  target_mode: "auto" | "manual";
  track_cycle: boolean;
  body_build?: string | null;
  last_period_start: string | null; // YYYY-MM-DD
  avg_cycle_length: number;
  avg_period_length: number;
  // Optional home base picked via city search.
  home?: { label: string; tz: string; lat: number; lng: number } | null;
};

export type OnboardingResult = { ok: boolean; error?: string };

const ACTIVITY = ["sedentary", "light", "moderate", "active", "very_active"];
const GOALS = ["lose", "maintain", "gain", "muscle"];
const SEXES = ["female", "male", "other"];

export async function completeOnboarding(
  p: OnboardingPayload,
): Promise<OnboardingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Validation — reject anything we'd refuse to base targets on.
  const name = p.first_name?.trim() ?? "";
  if (!name) return { ok: false, error: "Please enter your name." };
  if (!SEXES.includes(p.sex)) return { ok: false, error: "Pick a sex." };
  if (!ACTIVITY.includes(p.activity_level))
    return { ok: false, error: "Pick an activity level." };
  if (!GOALS.includes(p.goal)) return { ok: false, error: "Pick a goal." };

  const dob = Date.parse(`${p.date_of_birth}T00:00:00Z`);
  if (!Number.isFinite(dob)) return { ok: false, error: "Enter your birth date." };
  const age = (Date.now() - dob) / (365.25 * 86_400_000);
  if (age < 12 || age > 100)
    return { ok: false, error: "That birth date looks off." };

  if (!Number.isFinite(p.height_in) || p.height_in < 36 || p.height_in > 90)
    return { ok: false, error: "Enter a height between 3' and 7'6\"." };
  if (!Number.isFinite(p.weight_lbs) || p.weight_lbs < 50 || p.weight_lbs > 600)
    return { ok: false, error: "Enter a weight in pounds." };

  let lastPeriod: string | null = null;
  if (p.track_cycle && p.last_period_start) {
    const t = Date.parse(`${p.last_period_start}T00:00:00Z`);
    if (!Number.isFinite(t))
      return { ok: false, error: "That period start date looks off." };
    if (t > Date.now() + 86_400_000)
      return { ok: false, error: "Period start can't be in the future." };
    lastPeriod = p.last_period_start;
  }

  const cycleLen = Math.min(45, Math.max(21, Math.round(p.avg_cycle_length || 28)));
  const periodLen = Math.min(10, Math.max(2, Math.round(p.avg_period_length || 5)));

  // Goal weight is optional — maintainers usually skip; losers/gainers fill it.
  let goalWeight: number | null = null;
  if (p.goal_weight_lbs != null && Number.isFinite(p.goal_weight_lbs)) {
    if (p.goal_weight_lbs < 50 || p.goal_weight_lbs > 600) {
      return { ok: false, error: "Goal weight looks off." };
    }
    goalWeight = p.goal_weight_lbs;
  }

  // Optional home base from the city search. Stored as home so travel
  // detection has a correct baseline even for someone who signs up abroad.
  const home =
    p.home && p.home.tz && Number.isFinite(p.home.lat) && Number.isFinite(p.home.lng)
      ? {
          home_tz: p.home.tz,
          home_label: p.home.label,
          home_lat: p.home.lat,
          home_lng: p.home.lng,
          travel_status: "home" as const,
        }
      : {};

  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      first_name: name,
      date_of_birth: p.date_of_birth,
      sex: p.sex,
      height_in: p.height_in,
      activity_level: p.activity_level,
      goal: p.goal,
      goal_weight_lbs: goalWeight,
      target_mode: p.target_mode,
      track_cycle: p.sex === "male" ? false : p.track_cycle,
      body_build: ["lean", "average", "muscular", "higher_fat"].includes(p.body_build ?? "")
        ? p.body_build
        : null,
      last_period_start: lastPeriod,
      avg_cycle_length: cycleLen,
      avg_period_length: periodLen,
      ...home,
      onboarding_completed: true,
    })
    .eq("user_id", user.id);

  if (profErr) return { ok: false, error: profErr.message };

  // Seed a body-weight reading so auto-targets and the weight card have data.
  await supabase.from("body_weights").insert({
    user_id: user.id,
    weight_lbs: p.weight_lbs,
    source: "onboarding",
  });

  revalidatePath("/today");
  revalidatePath("/settings");
  return { ok: true };
}
