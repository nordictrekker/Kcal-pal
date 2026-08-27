"use server";

import { requireUser, revalidatePaths, type ActionResult } from "@/lib/actions";
import { parseNumber, type NumberRange } from "@/lib/form-values";
import { ozToMl } from "@/lib/hydration";

export type TargetsResult = ActionResult;

const FIELDS: Array<[string, NumberRange]> = [
  ["daily_calorie_target", { min: 800, max: 6000, integer: true }],
  ["daily_protein_target_g", { min: 0, max: 500, integer: true }],
  ["daily_carb_target_g", { min: 0, max: 1000, integer: true }],
  ["daily_fat_target_g", { min: 0, max: 500, integer: true }],
  ["daily_fiber_target_g", { min: 0, max: 200, integer: true }],
];

export async function updateTargets(
  formData: FormData,
): Promise<TargetsResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const patch: Record<string, number | string> = {};

  // Water goal mode: 'auto' derives it from weight + activity (the smart
  // goal), 'manual' uses the ounce value below.
  const modeRaw = String(formData.get("water_goal_mode") ?? "").trim();
  if (modeRaw === "auto" || modeRaw === "manual") {
    patch.water_goal_mode = modeRaw;
  }

  for (const [name, range] of FIELDS) {
    const parsed = parseNumber(formData.get(name), range);
    if (!parsed.ok) {
      if (parsed.empty) continue;
      return {
        ok: false,
        error: `${name} must be an integer in [${range.min}, ${range.max}].`,
      };
    }
    patch[name] = parsed.value;
  }

  // Water is entered in ounces but stored in millilitres so the schema
  // stays unit-agnostic. Convert here, not in the UI.
  const oz = parseNumber(formData.get("daily_water_target_oz"), {
    min: 0,
    max: 250,
    integer: true,
  });
  if (!oz.ok && !oz.empty) {
    return {
      ok: false,
      error: "daily_water_target_oz must be an integer in [0, 250].",
    };
  }
  if (oz.ok) patch.daily_water_target_ml = ozToMl(oz.value);

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No changes." };
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePaths("/today", "/settings");
  return { ok: true };
}
