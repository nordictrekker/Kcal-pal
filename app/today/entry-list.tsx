"use client";

import type { FoodEntry, Meal } from "@/lib/types";
import { MEALS } from "@/lib/food";
import { EntryRow } from "./entry-row";

const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

export function EntryList({ entries }: { entries: FoodEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nothing logged yet today.
      </p>
    );
  }

  const byMeal = new Map<Meal, FoodEntry[]>();
  for (const e of entries) {
    const m = (e.meal ?? "snack") as Meal;
    const arr = byMeal.get(m) ?? [];
    arr.push(e);
    byMeal.set(m, arr);
  }

  return (
    <div className="space-y-5">
      {MEALS.map((meal) => {
        const items = byMeal.get(meal);
        if (!items || items.length === 0) return null;
        return (
          <section key={meal} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {MEAL_LABELS[meal]}
            </h2>
            <div className="divide-y rounded-lg border">
              {items.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
