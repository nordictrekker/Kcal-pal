"use client";

import { useRef, useState } from "react";
import { Pantry } from "./pantry";
import { LogForm } from "./log-form";
import type { FrequentItem } from "@/lib/pantry";
import type { Meal } from "@/lib/types";

// Ties the pantry chips to the type-it form so tapping a frequent food fills
// the description box (and focuses it) ready to tweak and submit.
export function LogComposer({
  frequentItems,
  defaultMeal,
  logDate,
}: {
  frequentItems: FrequentItem[];
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
    <div className="space-y-4">
      <Pantry items={frequentItems} onPick={pick} logDate={logDate} />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          or type it
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <LogForm
        defaultMeal={defaultMeal}
        logDate={logDate}
        value={description}
        onValueChange={setDescription}
        textareaRef={textareaRef}
      />
    </div>
  );
}
