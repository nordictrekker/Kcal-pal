import type { ParsedNutrition, ParsedItem } from "./types";

// Hard consistency rules for nutrition numbers, applied to EVERY parse result
// and every enrichment result before anything is stored. These are not
// estimates — they are impossibilities being rejected:
//   - no negative amounts;
//   - saturated fat and trans fat cannot exceed total fat (a "1 cup chicken
//     thigh, 20 g fat, 23.7 g saturated" entry shipped to a user once);
//   - saturated fat cannot be an implausible SHARE of total fat. Real foods
//     top out around 60-65% saturated (butter ~63%, coconut oil ~87% is the
//     rare exception, named explicitly below). A mixed plate of bread,
//     avocado and egg whites logging 10.1 g saturated of 12 g total fat
//     (84%) is impossible: avocado fat is mostly monounsaturated and egg
//     whites have no fat at all. Sat-fat share is capped by what the food
//     actually is.
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

// Foods whose fat genuinely IS mostly saturated — these keep a high ceiling.
const HIGH_SAT_FOODS =
  /\b(coconut|butter|ghee|palm|lard|tallow|suet|cocoa butter|heavy cream|clotted cream|copha)\b/i;

// Default ceiling for saturated fat as a share of total fat. Chosen above
// butterfat (~63%) so ordinary rich foods pass untouched, while physically
// impossible shares get corrected.
const SAT_SHARE_MAX = 0.65;
const SAT_SHARE_MAX_HIGH = 0.95;

// Exported for tests. Caps saturated fat to a plausible share of total fat,
// given what the food is. Returns the (possibly reduced) value.
export function capSaturatedShare(
  saturated: number | null | undefined,
  fat: number | null | undefined,
  name: string,
): number | null | undefined {
  if (typeof saturated !== "number" || typeof fat !== "number") return saturated;
  if (fat <= 0) return saturated;
  const max = HIGH_SAT_FOODS.test(name) ? SAT_SHARE_MAX_HIGH : SAT_SHARE_MAX;
  const ceiling = fat * max;
  return saturated > ceiling ? Math.round(ceiling * 10) / 10 : saturated;
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
    // Per-component share cap, using the component's own name: avocado and
    // olive oil can't be mostly saturated; butter and coconut can.
    item.saturated_fat_g =
      (capSaturatedShare(item.saturated_fat_g, item.fat_g, item.name) as
        | number
        | undefined) ?? item.saturated_fat_g;
    return item;
  });

  // Entry-level share cap. When components carry their own saturated values,
  // prefer their (already capped) sum — it reflects what the food actually is
  // rather than a whole-meal guess.
  const itemSat = out.items.reduce(
    (sum, i) => sum + (typeof i.saturated_fat_g === "number" ? i.saturated_fat_g : 0),
    0,
  );
  const anyItemSat = out.items.some((i) => typeof i.saturated_fat_g === "number");
  if (anyItemSat && typeof out.saturated_fat_g === "number") {
    if (out.saturated_fat_g > itemSat) {
      out.saturated_fat_g = Math.round(itemSat * 10) / 10;
    }
  }
  out.saturated_fat_g =
    (capSaturatedShare(
      out.saturated_fat_g,
      out.fat_g,
      out.items.map((i) => i.name).join(" "),
    ) as number) ?? out.saturated_fat_g;

  return out;
}
