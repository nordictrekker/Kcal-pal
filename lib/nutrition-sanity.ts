import type { ParsedNutrition, ParsedItem } from "./types";

// Hard consistency rules for nutrition numbers, applied to EVERY parse result
// and every enrichment result before anything is stored. These are not
// estimates — they are impossibilities being rejected:
//   - no negative amounts;
//   - saturated fat and trans fat cannot exceed total fat (a "1 cup chicken
//     thigh, 20 g fat, 23.7 g saturated" entry shipped to a user once).
// When a value breaks a rule it is clamped to the bound (the bound is a fact,
// not a guess); the AI's fallback estimate is otherwise left alone.

function nonNeg(v: number | null | undefined): typeof v {
  return typeof v === "number" && v < 0 ? 0 : v;
}

function capAtFat(
  v: number | null | undefined,
  fat: number | null | undefined,
): typeof v {
  if (typeof v !== "number") return v;
  if (typeof fat === "number" && v > fat) return fat;
  return v;
}

export function enforceNutrientConsistency(d: ParsedNutrition): ParsedNutrition {
  const numericKeys = [
    "calories", "protein_g", "carbs_g", "fat_g", "fiber_g",
    "saturated_fat_g", "trans_fat_g", "cholesterol_mg", "iron_mg",
    "calcium_mg", "magnesium_mg", "vitamin_d_mcg", "omega3_mg",
    "folate_mcg", "choline_mg", "iodine_mcg",
  ] as const;

  const out: ParsedNutrition = { ...d };
  for (const k of numericKeys) {
    (out as Record<string, unknown>)[k] = nonNeg(out[k]);
  }
  out.saturated_fat_g = capAtFat(out.saturated_fat_g, out.fat_g) as number;
  out.trans_fat_g = capAtFat(out.trans_fat_g, out.fat_g) as number;

  out.items = (d.items ?? []).map((it): ParsedItem => {
    const item: ParsedItem = { ...it };
    for (const k of numericKeys) {
      const v = (item as Record<string, unknown>)[k];
      if (typeof v === "number" && v < 0) {
        (item as Record<string, unknown>)[k] = 0;
      }
    }
    item.saturated_fat_g = capAtFat(item.saturated_fat_g, item.fat_g) ?? item.saturated_fat_g;
    item.trans_fat_g = capAtFat(item.trans_fat_g, item.fat_g) ?? item.trans_fat_g;
    return item;
  });
  return out;
}
