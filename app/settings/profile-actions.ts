"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileResult = { ok: boolean; error?: string };

const ACTIVITY = ["sedentary", "light", "moderate", "active", "very_active"];
const GOALS = ["lose", "maintain", "gain"];
const SEXES = ["female", "male", "other"];

// Update the body + goal + cycle fields that drive smarter targets and
// cycle automation. All fields optional — only present keys are written.
export async function updateProfileSettings(
  formData: FormData,
): Promise<ProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const patch: Record<string, unknown> = {};

  const firstName = String(formData.get("first_name") ?? "").trim();
  if (firstName) patch.first_name = firstName;

  const dob = String(formData.get("date_of_birth") ?? "").trim();
  if (dob) {
    const t = Date.parse(`${dob}T00:00:00Z`);
    if (!Number.isFinite(t)) return { ok: false, error: "Invalid birth date." };
    patch.date_of_birth = dob;
  }

  const sex = String(formData.get("sex") ?? "").trim();
  if (sex) {
    if (!SEXES.includes(sex)) return { ok: false, error: "Invalid sex." };
    patch.sex = sex;
  }

  const heightRaw = String(formData.get("height_in") ?? "").trim();
  if (heightRaw) {
    const h = Number(heightRaw);
    if (!Number.isFinite(h) || h < 36 || h > 90)
      return { ok: false, error: "Height out of range." };
    patch.height_in = h;
  }

  const activity = String(formData.get("activity_level") ?? "").trim();
  if (activity) {
    if (!ACTIVITY.includes(activity))
      return { ok: false, error: "Invalid activity level." };
    patch.activity_level = activity;
  }

  const goal = String(formData.get("goal") ?? "").trim();
  if (goal) {
    if (!GOALS.includes(goal)) return { ok: false, error: "Invalid goal." };
    patch.goal = goal;
  }

  const targetMode = String(formData.get("target_mode") ?? "").trim();
  if (targetMode) {
    if (targetMode !== "auto" && targetMode !== "manual")
      return { ok: false, error: "Invalid target mode." };
    patch.target_mode = targetMode;
  }

  const proteinPerKg = String(formData.get("protein_per_kg") ?? "").trim();
  if (proteinPerKg) {
    const v = Number(proteinPerKg);
    if (!Number.isFinite(v) || v < 1 || v > 3)
      return { ok: false, error: "Protein per kg must be 1.0–3.0." };
    patch.protein_per_kg = v;
  }

  const goalWeight = String(formData.get("goal_weight_lbs") ?? "").trim();
  if (goalWeight) {
    const v = Number(goalWeight);
    if (!Number.isFinite(v) || v < 50 || v > 600)
      return { ok: false, error: "Goal weight must be between 50 and 600 lb." };
    patch.goal_weight_lbs = v;
  }

  // Cycle settings.
  const trackCycle = formData.get("track_cycle");
  if (trackCycle !== null) patch.track_cycle = trackCycle === "on" || trackCycle === "true";
  // Male profiles never track a cycle — enforce server-side so every consumer
  // (today, summary, recap, insights) sees cycle features off.
  if (patch.sex === "male") {
    patch.track_cycle = false;
    patch.last_period_start = null;
  }

  const periodStart = String(formData.get("last_period_start") ?? "").trim();
  if (periodStart) {
    const t = Date.parse(`${periodStart}T00:00:00Z`);
    if (!Number.isFinite(t))
      return { ok: false, error: "Invalid period start date." };
    patch.last_period_start = periodStart;
  }

  const cycleLen = String(formData.get("avg_cycle_length") ?? "").trim();
  if (cycleLen) {
    const v = Number(cycleLen);
    if (!Number.isInteger(v) || v < 21 || v > 45)
      return { ok: false, error: "Cycle length must be 21–45 days." };
    patch.avg_cycle_length = v;
  }

  const periodLen = String(formData.get("avg_period_length") ?? "").trim();
  if (periodLen) {
    const v = Number(periodLen);
    if (!Number.isInteger(v) || v < 2 || v > 10)
      return { ok: false, error: "Period length must be 2–10 days." };
    patch.avg_period_length = v;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No changes." };
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/settings");
  return { ok: true };
}
