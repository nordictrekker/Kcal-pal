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

// Cholesterol is synthesised only by animals — no plant food contains any.
// A logged "1 banana" came back with 9.4 mg and a plate of broccoli, carrot
// and celery with 5 mg; both are physically impossible, not estimates.
//
// This is deliberately an ALLOW-list of unambiguous plant foods rather than a
// deny-list of animal ones: the rule may only fire when we are certain, so an
// unrecognised or mixed dish keeps whatever was estimated. Anything naming an
// animal product is excluded outright as a second guard, which also covers
// compound names like "banana milkshake" or "broccoli cheddar soup".
const ANIMAL_REF =
  /\b(egg|chicken|beef|pork|fish|salmon|tuna|shrimp|prawn|meat|turkey|lamb|duck|bacon|ham|sausage|cheese|butter|ghee|cream|creme|crème|yogh?urt|yoghourt|milk|whey|casein|lard|tallow|gelatin|honey|anchov|sardin|crab|lobster|oyster|squid|octopus|caviar|custard|mayo|aioli|pancetta|prosciutto|chorizo|salami|broth|stock|bone|liver|pate|pâté|kefir|skyr|quark|ricotta|mozzarella|parmesan|feta|halloumi)/i;

const PLANT_ONLY_REF =
  /\b(banana|apple|orange|pear|peach|plum|grape|berry|berries|strawberr|blueberr|raspberr|blackberr|melon|watermelon|mango|pineapple|kiwi|papaya|apricot|cherry|cherries|fig|date|prune|raisin|broccoli|carrot|celery|cucumber|lettuce|spinach|kale|cabbage|cauliflower|courgette|zucchini|aubergine|eggplant|pepper|tomato|onion|garlic|leek|asparagus|artichoke|beet|beetroot|radish|turnip|parsnip|squash|pumpkin|sweet potato|potato|corn|pea|peas|bean|beans|lentil|chickpea|hummus|tofu|tempeh|edamame|almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|peanut|brazil nut|nut|seed|oat|oats|rice|quinoa|barley|buckwheat|couscous|bulgur|avocado|olive|coconut|mushroom|coffee|espresso|americano|tea|water|juice|kombucha)/i;

// Quantities, units and neutral descriptors that say nothing about whether a
// food is animal-derived. Anything left over must be a recognised plant.
const NEUTRAL_TOKEN =
  /^(?:\d+(?:[./]\d+)?|[½¼¾⅓⅔]|cup|cups|tbsp|tbs|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|kg|ml|l|oz|lb|slice|slices|stick|sticks|piece|pieces|serving|servings|handful|bowl|plate|glass|can|cans|bunch|clove|cloves|head|sprig|leaf|leaves|half|whole|medium|large|small|mini|baby|double|single|raw|fresh|frozen|dried|roasted|steamed|grilled|boiled|baked|chopped|sliced|diced|shredded|organic|plain|ripe|unsweetened|red|green|purple|yellow|white|black|orange|and|with|of|a|an|the)$/i;

// True only when EVERY significant word in the name is a recognised plant food
// or a neutral descriptor. An unrecognised word means unknown composition, so
// the rule stands down — "broccoli cheddar soup" must not be treated as plant
// food just because "broccoli" appears in it.
export function isPlantOnly(name: string): boolean {
  if (!name || !name.trim()) return false;
  if (ANIMAL_REF.test(name)) return false;

  const tokens = name
    .toLowerCase()
    .split(/[\s,()\[\]/\\\r\n.+—–-]+/)
    .map((t) => t.replace(/[^a-z0-9½¼¾⅓⅔]/g, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return false;

  let sawPlant = false;
  for (const t of tokens) {
    if (NEUTRAL_TOKEN.test(t)) continue;
    if (PLANT_ONLY_REF.test(t)) {
      sawPlant = true;
      continue;
    }
    return false; // an unrecognised word — composition unknown
  }
  return sawPlant;
}

// Energy implied by the macros (Atwater: 4 kcal/g protein and carb, 9 kcal/g
// fat). Used to detect a record whose calories and macros cannot both be right
// — see `energyDisagreesWithMacros`.
export function atwaterCalories(d: {
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}): number {
  const p = typeof d.protein_g === "number" ? d.protein_g : 0;
  const c = typeof d.carbs_g === "number" ? d.carbs_g : 0;
  const f = typeof d.fat_g === "number" ? d.fat_g : 0;
  return 4 * p + 4 * c + 9 * f;
}

// True when stated calories and the macro breakdown are too far apart to both
// be correct. Tolerance is generous — fibre, sugar alcohols, alcohol itself and
// label rounding all move the number legitimately — so this only fires on a
// genuine contradiction, e.g. a scanned oats record stating 180 kcal whose
// macros account for 83.
export function energyDisagreesWithMacros(d: {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}): boolean {
  if (typeof d.calories !== "number" || d.calories <= 0) return false;
  const implied = atwaterCalories(d);
  // Alcohol carries 7 kcal/g and is not in the macro breakdown, so a drink can
  // legitimately read high. Only flag when the gap is large in both directions.
  return Math.abs(d.calories - implied) > Math.max(60, 0.35 * d.calories);
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
    // A plant component cannot carry cholesterol.
    if (typeof item.cholesterol_mg === "number" && isPlantOnly(item.name)) {
      item.cholesterol_mg = 0;
    }
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

  // Entry-level cholesterol: zero only when EVERY component is a recognised
  // plant food (or there are no components and the serving text itself is
  // unambiguously plant). One unrecognised component is enough to leave the
  // estimate alone — the rule fires only on certainty.
  if (typeof out.cholesterol_mg === "number" && out.cholesterol_mg > 0) {
    const names = out.items.map((i) => i.name).filter((n) => n && n.trim());
    const allPlant =
      names.length > 0
        ? names.every((n) => isPlantOnly(n))
        : isPlantOnly(out.serving_size ?? "");
    if (allPlant) out.cholesterol_mg = 0;
  }

  return out;
}
