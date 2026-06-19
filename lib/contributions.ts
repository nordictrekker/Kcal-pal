import type { Meal } from "./types";

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
