import type { Meal } from "./types";

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
export function sumTotals(
  entries: Array<{
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
  }>,
): Totals {
  return entries.reduce<Totals>(
    (acc, e) => ({
      calories: acc.calories + (e.calories ?? 0),
      protein_g: acc.protein_g + (e.protein_g ?? 0),
      carbs_g: acc.carbs_g + (e.carbs_g ?? 0),
      fat_g: acc.fat_g + (e.fat_g ?? 0),
      fiber_g: acc.fiber_g + (e.fiber_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
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
