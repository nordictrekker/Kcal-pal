import type { Meal } from "./types";
import { extractComponents } from "./food-items";

// The nutrient fields the breakdown bars use (everything except calories).
const FIELDS = [
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
] as const;

// A slim per-entry record carrying just what the contributor breakdown needs:
// the entry's label/meal plus its nutrient field values. Built on the summary
// page from the day's food_entries and handed to the client breakdown UI.
export type ContribEntry = {
  id: string;
  label: string;
  meal: Meal | null;
  values: Record<string, number | null | undefined>;
};

export type Contribution = {
  id: string;
  label: string;
  meal: Meal | null;
  amount: number;
};

// Which logged entries contributed to a given nutrient field, largest first.
// Entries that contributed nothing (null/0) are dropped.
export function contributionsForField(
  field: string,
  entries: ContribEntry[],
): Contribution[] {
  return entries
    .map((e) => ({
      id: e.id,
      label: e.label,
      meal: e.meal,
      amount: Number(e.values[field] ?? 0),
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

// A logged entry plus its stored per-nutrient totals, ready to be split into
// its component foods.
export type EntryForContrib = {
  id: string;
  description: string;
  meal: Meal | null;
  raw_ai_response: unknown;
  totals: Record<string, number | null | undefined>;
};

// Break each logged entry into its individual component foods and attribute
// nutrients per component — so a yogurt+kiwi+coffee log shows the yogurt under
// protein, the kiwi under carbs/fiber, etc., instead of one opaque slice.
//
// Each component's share of a nutrient is its own itemized value, scaled so the
// components sum exactly to the entry's stored total for that nutrient (the
// total may be USDA-enriched and differ from the raw AI item sum). When a
// nutrient wasn't itemized per component (older logs only broke out macros),
// the entry total is allocated across components by their calorie share, so the
// breakdown is still component-level rather than collapsing back to the whole log.
export function buildComponentContributors(
  entries: EntryForContrib[],
): ContribEntry[] {
  const out: ContribEntry[] = [];

  for (const entry of entries) {
    const comps = extractComponents(entry.raw_ai_response);

    // No component breakdown available → the whole entry is one contributor.
    if (comps.length === 0) {
      out.push({
        id: entry.id,
        label: entry.description,
        meal: entry.meal,
        values: { ...entry.totals },
      });
      continue;
    }

    const calorieWeights = comps.map((c) => Number(c.calories) || 0);
    const calorieSum = calorieWeights.reduce((s, w) => s + w, 0);

    // Start each component with empty values, then fill field by field.
    const compValues: Record<string, number>[] = comps.map(() => ({}));

    for (const field of FIELDS) {
      const entryTotal = Number(entry.totals[field] ?? 0);
      if (entryTotal <= 0) continue;

      const weights = comps.map(
        (c) => Number((c as Record<string, unknown>)[field]) || 0,
      );
      let wSum = weights.reduce((s, w) => s + w, 0);
      let basis = weights;

      // Field not itemized → fall back to calorie-proportional allocation,
      // then to an even split if there are no calories either.
      if (wSum <= 0) {
        if (calorieSum > 0) {
          basis = calorieWeights;
          wSum = calorieSum;
        } else {
          basis = comps.map(() => 1);
          wSum = comps.length;
        }
      }

      comps.forEach((_, i) => {
        compValues[i][field] = (basis[i] / wSum) * entryTotal;
      });
    }

    comps.forEach((c, i) => {
      out.push({
        id: `${entry.id}:${i}`,
        label: c.name,
        meal: entry.meal,
        values: compValues[i],
      });
    });
  }

  return out;
}

// Collapse a long contributor list to the top N slices plus a grouped
// "Other" remainder, so the pie/table stay legible.
export function topWithOther(
  contributions: Contribution[],
  max = 6,
): Contribution[] {
  if (contributions.length <= max) return contributions;
  const top = contributions.slice(0, max - 1);
  const restAmount = contributions
    .slice(max - 1)
    .reduce((s, c) => s + c.amount, 0);
  return [
    ...top,
    { id: "__other__", label: "Other", meal: null, amount: restAmount },
  ];
}

// Merge component contributors that are the same food (by case-insensitive
// label) into one, summing their nutrient values — so a yogurt eaten five times
// across the week shows as a single contributor, not five near-identical slices.
// `scale` rescales every value (e.g. 1/7 to turn a weekly sum into a daily
// average).
export function mergeContributorsByLabel(
  entries: ContribEntry[],
  scale = 1,
): ContribEntry[] {
  const map = new Map<string, ContribEntry>();
  for (const e of entries) {
    const key = e.label.trim().toLowerCase();
    let merged = map.get(key);
    if (!merged) {
      merged = { id: key, label: e.label.trim(), meal: null, values: {} };
      map.set(key, merged);
    }
    for (const [field, v] of Object.entries(e.values)) {
      if (v == null) continue;
      merged.values[field] = Number(merged.values[field] ?? 0) + Number(v);
    }
  }
  const out = Array.from(map.values());
  if (scale !== 1) {
    for (const e of out) {
      for (const field of Object.keys(e.values)) {
        e.values[field] = Number(e.values[field] ?? 0) * scale;
      }
    }
  }
  return out;
}

