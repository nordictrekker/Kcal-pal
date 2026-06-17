"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TargetsResult = { ok: boolean; error?: string };

const FIELDS = [
  ["daily_calorie_target", 800, 6000],
  ["daily_protein_target_g", 0, 500],
  ["daily_carb_target_g", 0, 1000],
  ["daily_fat_target_g", 0, 500],
  ["daily_fiber_target_g", 0, 200],
] as const;

const OZ_TO_ML = 29.5735;

export async function updateTargets(
  formData: FormData,
): Promise<TargetsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const patch: Record<string, number | string> = {};

  // Water goal mode: 'auto' derives it from weight + activity (the smart
  // goal), 'manual' uses the ounce value below.
  const modeRaw = String(formData.get("water_goal_mode") ?? "").trim();
  if (modeRaw === "auto" || modeRaw === "manual") {
    patch.water_goal_mode = modeRaw;
  }

  for (const [name, lo, hi] of FIELDS) {
    const raw = String(formData.get(name) ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < lo || n > hi) {
      return { ok: false, error: `${name} must be an integer in [${lo}, ${hi}].` };
    }
    patch[name] = n;
  }

  // Water is entered in ounces but stored in millilitres so the schema
  // stays unit-agnostic. Convert here, not in the UI.
  const waterRaw = String(formData.get("daily_water_target_oz") ?? "").trim();
  if (waterRaw !== "") {
    const oz = Number(waterRaw);
    if (!Number.isInteger(oz) || oz < 0 || oz > 250) {
      return {
        ok: false,
        error: "daily_water_target_oz must be an integer in [0, 250].",
      };
    }
    patch.daily_water_target_ml = Math.round(oz * OZ_TO_ML);
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
