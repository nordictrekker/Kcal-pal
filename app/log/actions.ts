"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseTextMeal } from "@/lib/anthropic";
import { MEALS } from "@/lib/food";
import type { Meal } from "@/lib/types";

export type LogState = {
  ok: boolean;
  error?: string;
  warning?: string;
};

function isMeal(v: string): v is Meal {
  return (MEALS as string[]).includes(v);
}

export async function logTextMeal(
  _prev: LogState,
  formData: FormData,
): Promise<LogState> {
  const description = String(formData.get("description") ?? "").trim();
  const mealRaw = String(formData.get("meal") ?? "");

  if (!description) {
    return { ok: false, error: "Describe what you ate." };
  }
  const meal: Meal = isMeal(mealRaw) ? mealRaw : "snack";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const result = await parseTextMeal(description);

  // Never fabricate macros: on failure, save the entry with null macros and
  // surface the error so I can fix it manually.
  const base = {
    user_id: user.id,
    meal,
    description,
    source: "text" as const,
    raw_ai_response: (result.raw as object) ?? null,
  };

  if (!result.ok) {
    const { error } = await supabase.from("food_entries").insert({
      ...base,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      serving_size: null,
    });
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      warning: `Saved without macros — parsing failed: ${result.error}`,
    };
  }

  const d = result.data;
  const { error } = await supabase.from("food_entries").insert({
    ...base,
    calories: d.calories,
    protein_g: d.protein_g,
    carbs_g: d.carbs_g,
    fat_g: d.fat_g,
    fiber_g: d.fiber_g,
    serving_size: d.serving_size || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  return { ok: true };
}
