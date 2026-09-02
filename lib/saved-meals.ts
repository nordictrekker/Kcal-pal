// Saved meals (quick-add templates). Templates originally stored only the five
// macros, so quick-adding one silently dropped every micronutrient and the
// component breakdown that carries portion detail. These helpers define the
// nutrient surface a template copies and detect the legacy macro-only rows.

export type NutrientRow = Record<string, unknown>;

// Keep in sync with the columns on food_entries (and with TEMPLATE_SELECT in
// app/log/saved-actions.ts — the test asserts the two match).
export const TEMPLATE_NUTRIENT_COLUMNS = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "saturated_fat_g",
  "trans_fat_g",
  "cholesterol_mg",
  "iron_mg",
  "calcium_mg",
  "magnesium_mg",
  "vitamin_d_mcg",
  "omega3_mg",
  "folate_mcg",
  "choline_mg",
  "iodine_mcg",
  "plants",
  "serving_size",
] as const;

// Written out literally rather than joined, so supabase-js can parse the
// select string and type the returned row.
export const TEMPLATE_SELECT =
  "calories,protein_g,carbs_g,fat_g,fiber_g,saturated_fat_g,trans_fat_g,cholesterol_mg,iron_mg,calcium_mg,magnesium_mg,vitamin_d_mcg,omega3_mg,folate_mcg,choline_mg,iodine_mcg,plants,serving_size,raw_ai_response";

// Pull the copyable nutrition off a food_entries or saved_meals row. Absent
// fields become explicit nulls so a copy never inherits a stale value.
export function nutrientsFrom(row: NutrientRow): NutrientRow {
  const out: NutrientRow = {};
  for (const col of TEMPLATE_NUTRIENT_COLUMNS) out[col] = row[col] ?? null;
  out.raw_ai_response = (row.raw_ai_response as object | null) ?? null;
  return out;
}

// A template saved before migration 0029 has macros but no micros at all.
// Every real food reports at least one of these four, so all-null means the
// row predates the widening rather than describing a genuinely empty food.
export function missingMicros(row: NutrientRow): boolean {
  return (
    row.iron_mg == null &&
    row.calcium_mg == null &&
    row.cholesterol_mg == null &&
    row.magnesium_mg == null
  );
}
