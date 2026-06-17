"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseTextMeal } from "@/lib/anthropic";
import { isMeal, selectRelevantHistory } from "@/lib/food";
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
  const dateRaw = String(formData.get("date") ?? "").trim();
  const todayKey = new Date().toISOString().slice(0, 10);
  const consumedAt =
    /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) && dateRaw <= todayKey && dateRaw !== todayKey
      ? `${dateRaw}T12:00:00.000Z`
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  // Feed the AI the user's prior logs for similar items so estimates stay
  // consistent and their corrections stick.
  const { data: histRows } = await supabase
    .from("food_entries")
    .select("description,serving_size,calories,protein_g,carbs_g,fat_g,edited_by_user")
    .eq("user_id", user.id)
    .order("consumed_at", { ascending: false })
    .limit(200);
  const history = selectRelevantHistory(
    description,
    (histRows ?? []).map((r) => ({
      description: r.description as string,
      serving_size: (r.serving_size as string | null) ?? null,
      calories: (r.calories as number | null) ?? null,
      protein_g: (r.protein_g as number | null) ?? null,
      carbs_g: (r.carbs_g as number | null) ?? null,
      fat_g: (r.fat_g as number | null) ?? null,
      edited_by_user: Boolean(r.edited_by_user),
    })),
  );

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
  revalidatePath("/today/summary");
  return { ok: true };
}
