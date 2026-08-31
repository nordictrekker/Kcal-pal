import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedNutrition } from "./types";

// USDA FoodData Central micronutrient enrichment.
//
// Claude estimates calories + macros well, but its from-memory micronutrient
// figures drift. Here we look up each AI-identified item in FDC, take its real
// per-100 g nutrient profile, scale by the item's estimated grams, and sum —
// replacing the AI's micro estimates with database-backed values. Items FDC
// can't resolve fall back to the AI's calorie-proportional share, so the result
// is always the best available source per item. Macros/calories are left to the
// AI (its portion logic is the source of truth there).
//
// Gated entirely on USDA_FDC_API_KEY: with no key, entries keep AI estimates
// and no network/DB work happens. Results are cached in `fdc_cache` (shared
// reference data) so repeat foods are instant and we stay under FDC's limits.

const FDC_SEARCH = "https://api.nal.usda.gov/fdc/v1/foods/search";

// The extended ("micro") fields we source from FDC. Calories, macros and fiber
// stay with the AI.
type MicroSet = {
  saturated_fat_g: number;
  cholesterol_mg: number;
  iron_mg: number;
  calcium_mg: number;
  magnesium_mg: number;
  vitamin_d_mcg: number;
  omega3_mg: number;
  folate_mcg: number;
  choline_mg: number;
  iodine_mcg: number;
};

const ZERO: MicroSet = {
  saturated_fat_g: 0,
  cholesterol_mg: 0,
  iron_mg: 0,
  calcium_mg: 0,
  magnesium_mg: 0,
  vitamin_d_mcg: 0,
  omega3_mg: 0,
  folate_mcg: 0,
  choline_mg: 0,
  iodine_mcg: 0,
};

// FDC nutrientNumber → our field. FDC reports each in the unit we store, per
// 100 g (Foundation / SR Legacy / Survey foods).
const DIRECT: Record<string, keyof MicroSet> = {
  "606": "saturated_fat_g", // Fatty acids, total saturated (g)
  "601": "cholesterol_mg", // Cholesterol (mg)
  "303": "iron_mg", // Iron, Fe (mg)
  "301": "calcium_mg", // Calcium, Ca (mg)
  "304": "magnesium_mg", // Magnesium, Mg (mg)
  "328": "vitamin_d_mcg", // Vitamin D (D2 + D3) (µg)
  "421": "choline_mg", // Choline, total (mg)
  "314": "iodine_mcg", // Iodine, I (µg)
};

// Folate: prefer DFE (435, dietary folate equivalents) over total (417) when
// both are present — DFE is the unit the target is expressed in.
const FOLATE_DFE = "435";
const FOLATE_TOTAL = "417";

// Omega-3 fatty acids (reported in g) — summed and converted to mg.
const OMEGA3 = new Set(["851", "629", "621", "631"]); // ALA, EPA, DHA, DPA

type FdcNutrient = { nutrientNumber?: string; value?: number };

function extractPer100g(foodNutrients: FdcNutrient[]): MicroSet {
  const m: MicroSet = { ...ZERO };
  let omega3g = 0;
  let folateTotal = 0;
  let folateDfe = 0;
  for (const n of foodNutrients ?? []) {
    const num = String(n.nutrientNumber ?? "");
    const val = typeof n.value === "number" ? n.value : Number(n.value);
    if (!Number.isFinite(val)) continue;
    if (DIRECT[num]) m[DIRECT[num]] = val;
    else if (OMEGA3.has(num)) omega3g += val;
    else if (num === FOLATE_DFE) folateDfe = val;
    else if (num === FOLATE_TOTAL) folateTotal = val;
  }
  m.omega3_mg = omega3g * 1000;
  m.folate_mcg = folateDfe > 0 ? folateDfe : folateTotal;
  return m;
}

// Words that mark a concentrated/dry form. A match containing one is only
// acceptable when the query itself mentions it — otherwise per-100 g values
// of a powder get multiplied by a liquid/prepared weight (the "nutrition
// shake matched a fortified powder" bug: 17x iron).
const FORM_WORDS = /\b(powder|powdered|dry|dried|dehydrated|concentrate|concentrated|mix|instant|unprepared|meal supplement)\b/i;
const STOPWORDS = new Set([
  "with", "and", "the", "from", "food", "fresh", "raw", "plain", "style",
]);

// Pick the first search candidate that (a) shares at least one meaningful
// token with the query and (b) doesn't introduce a concentrated form the
// query never mentioned. Exported for tests.
export function pickFdcCandidate<T extends { description?: string }>(
  query: string,
  foods: T[],
): T | null {
  const q = query.toLowerCase();
  const qTokens = q
    .split(/[^a-zà-ÿ0-9]+/i)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
  for (const f of foods) {
    const d = (f.description ?? "").toLowerCase();
    if (!d) continue;
    if (FORM_WORDS.test(d) && !FORM_WORDS.test(q)) continue;
    if (qTokens.length > 0 && !qTokens.some((t) => d.includes(t))) continue;
    return f;
  }
  return null;
}

type FdcResult = {
  matched: boolean;
  fdcId?: number;
  description?: string;
  per100g?: MicroSet;
};

async function fetchFdc(query: string): Promise<FdcResult> {
  const key = process.env.USDA_FDC_API_KEY;
  if (!key) return { matched: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${FDC_SEARCH}?api_key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        pageSize: 5,
        // Whole/prepared foods with complete micronutrient profiles. Branded is
        // excluded: it needs exact matches and its micro coverage is sparse.
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return { matched: false };
    const json = (await res.json()) as {
      foods?: Array<{
        fdcId?: number;
        description?: string;
        foodNutrients?: FdcNutrient[];
      }>;
    };
    const food = pickFdcCandidate(query, json.foods ?? []);
    if (!food) return { matched: false };
    return {
      matched: true,
      fdcId: food.fdcId,
      description: food.description,
      per100g: extractPer100g(food.foodNutrients ?? []),
    };
  } catch {
    return { matched: false };
  } finally {
    clearTimeout(timer);
  }
}

// FDC lookup with a shared-cache read-through. Misses are cached too, so an
// unknown food is only queried once.
async function lookupCached(
  supabase: SupabaseClient,
  name: string,
): Promise<{ matched: boolean; per100g?: MicroSet }> {
  const query = name.trim().toLowerCase();
  if (!query) return { matched: false };
  // Cache key is versioned (v2: candidate guards) so stale pre-guard matches
  // aren't served forever; the search itself uses the clean query.
  const cacheKey = `v2:${query}`;

  const { data: cached } = await supabase
    .from("fdc_cache")
    .select("matched, per100g")
    .eq("query", cacheKey)
    .maybeSingle();
  if (cached) {
    return {
      matched: Boolean(cached.matched),
      per100g: (cached.per100g as MicroSet | null) ?? undefined,
    };
  }

  const fresh = await fetchFdc(query);
  // Best-effort cache write — never let a cache failure break logging.
  await supabase.from("fdc_cache").upsert({
    query: cacheKey,
    fdc_id: fresh.fdcId ?? null,
    description: fresh.description ?? null,
    per100g: fresh.per100g ?? null,
    matched: fresh.matched,
    fetched_at: new Date().toISOString(),
  });
  return { matched: fresh.matched, per100g: fresh.per100g };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// Field → the absolute amount that must ALSO be exceeded before a field
// counts as suspect — keeps tiny disagreements (1 vs 5 mg calcium) untouched.
const CLAMP_FLOOR: Record<keyof MicroSet, number> = {
  saturated_fat_g: 8,
  cholesterol_mg: 150,
  iron_mg: 8,
  calcium_mg: 400,
  magnesium_mg: 150,
  vitamin_d_mcg: 8,
  omega3_mg: 800,
  folate_mcg: 300,
  choline_mg: 200,
  iodine_mcg: 80,
};

// Exported for tests. A WRONG food match (e.g. fortified powder for a liquid
// shake) inflates many nutrients at once; legitimate enrichment usually moves
// one (the AI lowballs salmon's omega-3 — that correction must survive). So:
// only when 3+ fields are each >6x the AI estimate AND material do we call
// the match implausible, and revert those fields to the AI values.
export function clampImplausible(
  acc: MicroSet,
  ai: Pick<ParsedNutrition, keyof MicroSet>,
): void {
  const suspect = (Object.keys(CLAMP_FLOOR) as Array<keyof MicroSet>).filter(
    (key) => {
      const aiVal = ai[key] ?? 0;
      return aiVal > 0 && acc[key] > 6 * aiVal && acc[key] > CLAMP_FLOOR[key];
    },
  );
  if (suspect.length < 3) return;
  for (const key of suspect) acc[key] = ai[key] ?? 0;
}

function scaleMicros(per100g: MicroSet, grams: number): MicroSet {
  const f = grams / 100;
  return {
    saturated_fat_g: round1(per100g.saturated_fat_g * f),
    cholesterol_mg: round1(per100g.cholesterol_mg * f),
    iron_mg: round1(per100g.iron_mg * f),
    calcium_mg: round1(per100g.calcium_mg * f),
    magnesium_mg: round1(per100g.magnesium_mg * f),
    vitamin_d_mcg: round1(per100g.vitamin_d_mcg * f),
    omega3_mg: Math.round(per100g.omega3_mg * f),
    folate_mcg: round1(per100g.folate_mcg * f),
    choline_mg: round1(per100g.choline_mg * f),
    iodine_mcg: round1(per100g.iodine_mcg * f),
  };
}

// Pull a gram weight out of a free-text serving size ("45 g", "1 bar (45g)").
// Returns null for non-gram units (e.g. "150 ml") since we can't scale those.
export function parseGrams(serving: string | null | undefined): number | null {
  if (!serving) return null;
  const m = serving.match(/([\d.]+)\s*g(?:ram)?s?\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// USDA micronutrients for a single named food at a given gram weight, or null
// when there's no API key, no usable weight, or FDC can't resolve the name.
// Used by the barcode flow, where there's one product and no AI micro estimate
// to fall back to.
export async function usdaMicrosForItem(
  supabase: SupabaseClient,
  name: string,
  grams: number | null,
): Promise<MicroSet | null> {
  if (!process.env.USDA_FDC_API_KEY) return null;
  if (!grams || grams <= 0) return null;
  const { matched, per100g } = await lookupCached(supabase, name);
  if (!matched || !per100g) return null;
  return scaleMicros(per100g, grams);
}


// Enrich a parsed meal's micronutrients with USDA FoodData Central data.
// Returns the input unchanged when there's no API key, no items, or nothing
// resolves — so it's always safe to call.
export async function enrichMicrosWithUsda(
  supabase: SupabaseClient,
  data: ParsedNutrition,
): Promise<ParsedNutrition> {
  if (!process.env.USDA_FDC_API_KEY) return data;
  const items = data.items ?? [];
  if (items.length === 0) return data;

  const totalCalories = items.reduce((s, i) => s + (i.calories || 0), 0);
  const acc: MicroSet = { ...ZERO };
  let anyResolved = false;
  let anyFallback = false;

  for (const item of items) {
    let resolved = false;
    if (typeof item.grams === "number" && item.grams > 0) {
      const { matched, per100g } = await lookupCached(supabase, item.name);
      if (matched && per100g) {
        const f = item.grams / 100;
        acc.saturated_fat_g += per100g.saturated_fat_g * f;
        acc.cholesterol_mg += per100g.cholesterol_mg * f;
        acc.iron_mg += per100g.iron_mg * f;
        acc.calcium_mg += per100g.calcium_mg * f;
        acc.magnesium_mg += per100g.magnesium_mg * f;
        acc.vitamin_d_mcg += per100g.vitamin_d_mcg * f;
        acc.omega3_mg += per100g.omega3_mg * f;
        acc.folate_mcg += per100g.folate_mcg * f;
        acc.choline_mg += per100g.choline_mg * f;
        acc.iodine_mcg += per100g.iodine_mcg * f;
        resolved = true;
      }
    }

    if (resolved) {
      anyResolved = true;
    } else {
      // Fall back to the AI's estimate for this item, as its share of the
      // meal's calories.
      anyFallback = true;
      if (totalCalories > 0) {
        const share = (item.calories || 0) / totalCalories;
        acc.saturated_fat_g += data.saturated_fat_g * share;
        acc.cholesterol_mg += data.cholesterol_mg * share;
        acc.iron_mg += data.iron_mg * share;
        acc.calcium_mg += data.calcium_mg * share;
        acc.magnesium_mg += data.magnesium_mg * share;
        acc.vitamin_d_mcg += data.vitamin_d_mcg * share;
        acc.omega3_mg += data.omega3_mg * share;
        acc.folate_mcg += data.folate_mcg * share;
        acc.choline_mg += data.choline_mg * share;
        acc.iodine_mcg += data.iodine_mcg * share;
      }
    }
  }

  // Nothing improved — keep the AI aggregate exactly as-is.
  if (!anyResolved) return data;

  // Plausibility guard: when USDA lands far above the AI's own estimate for a
  // nutrient (a wrong food/form match slipping through), trust the AI number.
  // Triggers only on material disagreement, so honest corrections survive.
  clampImplausible(acc, data);

  const note = anyFallback
    ? "Some micronutrients sourced from USDA FoodData Central; the rest estimated."
    : "Micronutrients sourced from USDA FoodData Central.";

  return {
    ...data,
    saturated_fat_g: round1(acc.saturated_fat_g),
    cholesterol_mg: round1(acc.cholesterol_mg),
    iron_mg: round1(acc.iron_mg),
    calcium_mg: round1(acc.calcium_mg),
    magnesium_mg: round1(acc.magnesium_mg),
    vitamin_d_mcg: round1(acc.vitamin_d_mcg),
    omega3_mg: Math.round(acc.omega3_mg),
    folate_mcg: round1(acc.folate_mcg),
    choline_mg: round1(acc.choline_mg),
    iodine_mcg: round1(acc.iodine_mcg),
    assumptions: [...data.assumptions, note],
  };
}
