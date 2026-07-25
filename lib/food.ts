import type { Meal, ParsedNutrition } from "./types";

// Map an AI parse to the food_entries nutrient columns (one place, so every
// log path — text, photo, re-analyze — stores the same fields).
export function nutrientColumns(d: ParsedNutrition) {
  return {
    calories: d.calories,
    protein_g: d.protein_g,
    carbs_g: d.carbs_g,
    fat_g: d.fat_g,
    fiber_g: d.fiber_g,
    saturated_fat_g: d.saturated_fat_g,
    trans_fat_g: d.trans_fat_g,
    cholesterol_mg: d.cholesterol_mg,
    iron_mg: d.iron_mg,
    calcium_mg: d.calcium_mg,
    magnesium_mg: d.magnesium_mg,
    vitamin_d_mcg: d.vitamin_d_mcg,
    omega3_mg: d.omega3_mg,
    folate_mcg: d.folate_mcg,
    choline_mg: d.choline_mg,
    iodine_mcg: d.iodine_mcg,
    plants: d.plants,
    serving_size: d.serving_size || null,
  };
}

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

export function isMeal(v: string): v is Meal {
  return (MEALS as readonly string[]).includes(v);
}

export type Totals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  // Extended nutrients — present on consumed totals (summed from entries),
  // absent on target objects (those only carry the personalized macros).
  saturated_fat_g?: number;
  trans_fat_g?: number;
  cholesterol_mg?: number;
  iron_mg?: number;
  calcium_mg?: number;
  magnesium_mg?: number;
  vitamin_d_mcg?: number;
  omega3_mg?: number;
  folate_mcg?: number;
  choline_mg?: number;
  iodine_mcg?: number;
};

// One entry's nutrient values, all nullable (AI may not estimate everything).
export type NutrientRow = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  saturated_fat_g?: number | null;
  trans_fat_g?: number | null;
  cholesterol_mg?: number | null;
  iron_mg?: number | null;
  calcium_mg?: number | null;
  magnesium_mg?: number | null;
  vitamin_d_mcg?: number | null;
  omega3_mg?: number | null;
  folate_mcg?: number | null;
  choline_mg?: number | null;
  iodine_mcg?: number | null;
};

// Suggest a meal slot from the local hour (used to pre-select the picker).
export function defaultMeal(date = new Date()): Meal {
  const h = date.getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

// Pick the user's past entries most relevant to a new description, so the AI
// can stay consistent with how they log (and honour their corrections).
// Relevance = shared significant words; user-corrected and recent entries win.
export type HistoryEntry = {
  description: string;
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  edited_by_user: boolean;
};

const HISTORY_STOPWORDS = new Set([
  "with", "and", "the", "from", "plus", "extra", "some", "half", "large",
  "small", "medium", "very", "this", "that", "had", "for", "one", "two",
  "three", "double", "single",
]);

function significantTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !HISTORY_STOPWORDS.has(w)),
  );
}

export function selectRelevantHistory(
  description: string,
  entries: HistoryEntry[],
  limit = 8,
): HistoryEntry[] {
  const qt = significantTokens(description);
  if (qt.size === 0) return [];
  const scored = entries
    .map((e) => {
      const et = significantTokens(e.description);
      let overlap = 0;
      for (const t of qt) if (et.has(t)) overlap++;
      return { e, overlap };
    })
    .filter((x) => x.overlap > 0);
  // Corrections first, then strongest overlap (input order is recency).
  scored.sort(
    (a, b) =>
      Number(b.e.edited_by_user) - Number(a.e.edited_by_user) ||
      b.overlap - a.overlap,
  );
  return scored.slice(0, limit).map((x) => x.e);
}

// Sum a list of entries into daily totals. Null macros count as 0 so a
// failed parse doesn't poison the totals, but it's surfaced separately.
export function sumTotals(entries: NutrientRow[]): Totals {
  return entries.reduce<Totals>(
    (acc, e) => ({
      calories: acc.calories + (e.calories ?? 0),
      protein_g: acc.protein_g + (e.protein_g ?? 0),
      carbs_g: acc.carbs_g + (e.carbs_g ?? 0),
      fat_g: acc.fat_g + (e.fat_g ?? 0),
      fiber_g: acc.fiber_g + (e.fiber_g ?? 0),
      saturated_fat_g: (acc.saturated_fat_g ?? 0) + (e.saturated_fat_g ?? 0),
      trans_fat_g: (acc.trans_fat_g ?? 0) + (e.trans_fat_g ?? 0),
      cholesterol_mg: (acc.cholesterol_mg ?? 0) + (e.cholesterol_mg ?? 0),
      iron_mg: (acc.iron_mg ?? 0) + (e.iron_mg ?? 0),
      calcium_mg: (acc.calcium_mg ?? 0) + (e.calcium_mg ?? 0),
      magnesium_mg: (acc.magnesium_mg ?? 0) + (e.magnesium_mg ?? 0),
      vitamin_d_mcg: (acc.vitamin_d_mcg ?? 0) + (e.vitamin_d_mcg ?? 0),
      omega3_mg: (acc.omega3_mg ?? 0) + (e.omega3_mg ?? 0),
      folate_mcg: (acc.folate_mcg ?? 0) + (e.folate_mcg ?? 0),
      choline_mg: (acc.choline_mg ?? 0) + (e.choline_mg ?? 0),
      iodine_mcg: (acc.iodine_mcg ?? 0) + (e.iodine_mcg ?? 0),
    }),
    {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      saturated_fat_g: 0,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      iron_mg: 0,
      calcium_mg: 0,
      magnesium_mg: 0,
      vitamin_d_mcg: 0,
      omega3_mg: 0,
      folate_mcg: 0,
      choline_mg: 0,
      iodine_mcg: 0,
    },
  );
}

// Local-day [start, end) ISO bounds for "today" queries.
export function dayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
