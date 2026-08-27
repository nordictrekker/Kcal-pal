import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTextMeal } from "./anthropic";
import { nutrientColumns } from "./food";
import { logQueryError } from "./log";
import type { ParsedNutrition } from "./types";

// Cached label nutrition for a declared supplement. Researched once (label
// web-search) when the supplement is added in Settings, stored on
// supplement_profiles, and reused for every one-tap log afterwards. FDC
// enrichment is deliberately NOT applied: USDA has generic foods, not
// supplement labels, and would overwrite the label-accurate values.

export function supplementNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Sanitize a stored jsonb nutrients blob back into insertable columns.
// Everything numeric is passed through; plants forced empty (supplements
// aren't produce); serving_size kept as text.
export function profileNutrientColumns(
  nutrients: unknown,
): Record<string, number | string[] | string | null> {
  const n = (nutrients ?? {}) as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    calories: num(n.calories),
    protein_g: num(n.protein_g),
    carbs_g: num(n.carbs_g),
    fat_g: num(n.fat_g),
    fiber_g: num(n.fiber_g),
    saturated_fat_g: num(n.saturated_fat_g),
    trans_fat_g: num(n.trans_fat_g),
    cholesterol_mg: num(n.cholesterol_mg),
    iron_mg: num(n.iron_mg),
    calcium_mg: num(n.calcium_mg),
    magnesium_mg: num(n.magnesium_mg),
    vitamin_d_mcg: num(n.vitamin_d_mcg),
    omega3_mg: num(n.omega3_mg),
    folate_mcg: num(n.folate_mcg),
    choline_mg: num(n.choline_mg),
    iodine_mcg: num(n.iodine_mcg),
    plants: [],
    serving_size: typeof n.serving_size === "string" ? n.serving_size : null,
  };
}

// Parse a supplement's label (forced web-search) and cache it. Returns the
// parsed nutrition, or null when parsing fails (callers fall back).
export async function parseAndStoreSupplementProfile(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<{ data: ParsedNutrition; raw: unknown } | null> {
  const result = await parseTextMeal(name, [], { forceSupplementSearch: true });
  if (!result.ok) return null;
  const { error } = await supabase.from("supplement_profiles").upsert(
    {
      user_id: userId,
      name: name.trim(),
      name_key: supplementNameKey(name),
      nutrients: nutrientColumns(result.data),
      raw: (result.raw as object) ?? null,
    },
    { onConflict: "user_id,name_key" },
  );
  // The parse still stands even if caching it failed — the next log re-parses.
  logQueryError("supplementProfiles.cacheWrite", error, { name });
  return { data: result.data, raw: result.raw };
}
