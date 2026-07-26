"use client";

import { useRef, useState } from "react";
import { Pantry } from "./pantry";
import { LogForm } from "./log-form";
import { SavedMeals, type SavedMealItem } from "./saved-meals";
import { RecentMeals } from "./recent-meals";
import type { RecentMeal } from "@/lib/recent-meals";
import type { FrequentItem } from "@/lib/pantry";
import type { Meal } from "@/lib/types";

// Orders the log-food flow: meal + "what did you eat" form first, then
// zero-setup "log again" (recent whole meals, no saving required), then saved
// meals, then the auto-detected pantry. Tapping a pantry chip fills the
// description box (and focuses it) ready to tweak and submit.
export function LogComposer({
  frequentItems,
  savedItems,
  recentMeals,
  supplements,
  defaultMeal,
  logDate,
}: {
  frequentItems: FrequentItem[];
  savedItems: SavedMealItem[];
  recentMeals: RecentMeal[];
  supplements: string[];
  defaultMeal: Meal;
  logDate?: string | null;
}) {
  const [description, setDescription] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function pick(desc: string) {
    setDescription(desc);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  return (
    <div className="space-y-6">
      <LogForm
        defaultMeal={defaultMeal}
        logDate={logDate}
        value={description}
        onValueChange={setDescription}
        textareaRef={textareaRef}
      />

      <RecentMeals items={recentMeals} logDate={logDate} />

      <SavedMeals items={savedItems} />

      <Pantry items={frequentItems} supplements={supplements} onPick={pick} logDate={logDate} />
    </div>
  );
}
