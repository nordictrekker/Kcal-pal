"use server";

import { requireUser, revalidatePaths } from "@/lib/actions";
import { parseTextMeal } from "@/lib/anthropic";
import { enrichMicrosWithUsda } from "@/lib/fdc";
import { backdatedConsumedAt } from "@/lib/form-values";
import { isMeal, loadRelevantHistory, nutrientColumns } from "@/lib/food";
import type { Meal } from "@/lib/types";

export type LogState = {
  ok: boolean;
  error?: string;
  warning?: string;
};

// Cap pasted/typed descriptions so the row size limit can never be hit.
const MAX_DESC = 1000;

export async function logTextMeal(
  _prev: LogState,
  formData: FormData,
): Promise<LogState> {
  const description = String(formData.get("description") ?? "").trim();
  const mealRaw = String(formData.get("meal") ?? "");

  if (!description) {
    return { ok: false, error: "Describe what you ate." };
  }
  if (description.length > MAX_DESC) {
    return { ok: false, error: `Description too long (max ${MAX_DESC} chars).` };
  }
  const meal: Meal = isMeal(mealRaw) ? mealRaw : "snack";

  // Optional back-date (adding to a past day from the dated log view). Anchored
  // to local noon so it lands inside the chosen day regardless of timezone.
  const consumedAt = backdatedConsumedAt(
    String(formData.get("date") ?? "").trim(),
  );

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Feed the AI the user's prior logs for similar items so estimates stay
  // consistent and their corrections stick.
  const history = await loadRelevantHistory(supabase, user.id, description);

  const result = await parseTextMeal(description, history);

  // Never fabricate macros: on failure, save the entry with null macros and
  // surface the error so I can fix it manually.
  const base = {
    user_id: user.id,
    meal,
    description,
    source: "text" as const,
    raw_ai_response: (result.raw as object) ?? null,
    ...(consumedAt ? { consumed_at: consumedAt } : {}),
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

  // Replace the AI's micronutrient estimates with USDA FoodData Central data
  // where we can resolve the items (no-op without an API key).
  // Supplement components keep their label numbers (USDA has foods, not
  // supplement labels); the ordinary foods in the same entry are still
  // enriched.
  const d = await enrichMicrosWithUsda(supabase, result.data, { description });
  const { error } = await supabase.from("food_entries").insert({
    ...base,
    ...nutrientColumns(d),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePaths("/today", "/today/summary");
  return { ok: true };
}
