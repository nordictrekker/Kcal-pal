"use client";

import { useRef, useState } from "react";
import { Pantry } from "./pantry";
import { LogForm } from "./log-form";
import { SavedMeals, type SavedMealItem } from "./saved-meals";
import type { FrequentItem } from "@/lib/pantry";
import type { Meal } from "@/lib/types";

// Orders the log-food flow: meal + "what did you eat" form first, then saved
// meals, then the auto-detected pantry. Tapping a pantry chip fills the
// description box (and focuses it) ready to tweak and submit.
export function LogComposer({
  frequentItems,
  savedItems,
  defaultMeal,
  logDate,
}: {
  frequentItems: FrequentItem[];
  savedItems: SavedMealItem[];
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

      <SavedMeals items={savedItems} />

      <Pantry items={frequentItems} onPick={pick} logDate={logDate} />
    </div>
  );
}
