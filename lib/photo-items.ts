// Per-component portion adjustment for a parsed meal.
//
// Photo logging was abandoned after five uses, every one of which needed
// correcting by hand. The failure wasn't only the estimate — it was that
// fixing it meant leaving the confirm screen, opening the entry editor and
// retyping whole-meal totals. The model is usually right about WHAT is on the
// plate and wrong about HOW MUCH, so the fix is to make portion the thing you
// adjust, per component, and recompute the totals from the parts.

import type { ParsedItem, ParsedNutrition } from "./types";

// Every numeric field on a component that scales linearly with portion.
const SCALABLE_FIELDS = [
  "calories", "protein_g", "carbs_g", "fat_g", "fiber_g",
  "saturated_fat_g", "trans_fat_g", "cholesterol_mg", "iron_mg",
  "calcium_mg", "magnesium_mg", "vitamin_d_mcg", "omega3_mg",
  "folate_mcg", "choline_mg", "iodine_mcg",
] as const;

export type EditableItem = ParsedItem & {
  // Stable key for React across reorders/removals.
  key: string;
  // Portion multiplier applied to the model's estimate. 1 = as parsed.
  multiplier: number;
  removed: boolean;
};

// Portion choices offered per component. Deliberately coarse: the useful
// correction is "that's about half what I ate", not a gram-level slider, and
// coarse taps are far faster on a phone.
export const PORTION_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3] as const;

export function toEditableItems(items: ParsedItem[]): EditableItem[] {
  return items.map((it, i) => ({
    ...it,
    key: `${i}-${it.name}`,
    multiplier: 1,
    removed: false,
  }));
}

function round(v: number): number {
  // Sub-10 values keep a decimal so 0.2 g of saturated fat doesn't vanish.
  return Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v);
}

// One component at its adjusted portion. Absent fields stay absent — a missing
// value is not the same as zero, and inventing one is exactly what we don't do.
export function scaleItem(item: EditableItem): ParsedItem {
  const out = { ...item } as Record<string, unknown>;
  delete out.key;
  delete out.multiplier;
  delete out.removed;
  for (const f of SCALABLE_FIELDS) {
    const v = (item as Record<string, unknown>)[f];
    if (typeof v === "number") out[f] = round(v * item.multiplier);
  }
  if (typeof item.grams === "number") {
    out.grams = round(item.grams * item.multiplier);
  }
  // Reflect the adjustment in the human-readable quantity so the saved entry
  // reads honestly ("2 x 1 cup rice") rather than silently disagreeing with
  // its own numbers.
  if (item.multiplier !== 1 && item.quantity) {
    out.quantity = `${formatMultiplier(item.multiplier)} ${item.quantity}`;
  }
  return out as unknown as ParsedItem;
}

export function formatMultiplier(m: number): string {
  if (m === 0.25) return "¼×";
  if (m === 0.5) return "½×";
  if (m === 0.75) return "¾×";
  if (m === 1.5) return "1½×";
  return `${m}×`;
}

// Meal totals recomputed from the kept components at their adjusted portions.
// This replaces the model's own totals: once a portion is changed or an item
// removed, the original totals describe a meal that isn't on the plate.
export function totalsFromItems(
  items: EditableItem[],
): Pick<ParsedNutrition, (typeof SCALABLE_FIELDS)[number]> {
  const totals: Record<string, number> = {};
  for (const f of SCALABLE_FIELDS) totals[f] = 0;

  for (const item of items) {
    if (item.removed) continue;
    for (const f of SCALABLE_FIELDS) {
      const v = (item as Record<string, unknown>)[f];
      if (typeof v === "number") totals[f] += v * item.multiplier;
    }
  }
  for (const f of SCALABLE_FIELDS) totals[f] = round(totals[f]);
  return totals as Pick<ParsedNutrition, (typeof SCALABLE_FIELDS)[number]>;
}

// Description rebuilt from what's actually kept, so removing an item removes
// it from the text too.
export function descriptionFromItems(items: EditableItem[]): string {
  return items
    .filter((i) => !i.removed)
    .map((i) => {
      const q = i.multiplier === 1 ? i.quantity : `${formatMultiplier(i.multiplier)} ${i.quantity}`;
      return q ? `${q} ${i.name}`.trim() : i.name;
    })
    .join(", ");
}

// Plants surviving the edit — a removed component's plants shouldn't keep
// counting toward plant diversity.
export function plantsFromItems(
  items: EditableItem[],
  allPlants: string[],
): string[] {
  const keptNames = items
    .filter((i) => !i.removed)
    .map((i) => i.name.toLowerCase())
    .join(" ");
  if (items.every((i) => !i.removed)) return allPlants;
  return allPlants.filter((p) => keptNames.includes(p.toLowerCase()));
}
