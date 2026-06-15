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
