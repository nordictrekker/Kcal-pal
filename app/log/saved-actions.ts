"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MEALS, defaultMeal } from "@/lib/food";
import { logQueryError } from "@/lib/log";
import type { Meal } from "@/lib/types";

export type SavedMealActionResult = { ok: boolean; error?: string };

function isMeal(v: string): v is Meal {
  return (MEALS as string[]).includes(v);
}

// Save a logged food entry as a reusable quick-add.
export async function saveEntryAsTemplate(
  entryId: string,
  label: string,
): Promise<SavedMealActionResult> {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Give it a label." };
  if (trimmed.length > 80)
    return { ok: false, error: "Label too long (max 80)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: entry, error: readErr } = await supabase
    .from("food_entries")
    .select(
      "description,calories,protein_g,carbs_g,fat_g,fiber_g,serving_size",
    )
    .eq("id", entryId)
    .eq("user_id", user.id)
    .single();
  if (readErr || !entry) return { ok: false, error: "Entry not found." };

  const { error } = await supabase.from("saved_meals").insert({
    user_id: user.id,
    label: trimmed,
    description: entry.description as string,
    calories: entry.calories,
    protein_g: entry.protein_g,
    carbs_g: entry.carbs_g,
    fat_g: entry.fat_g,
    fiber_g: entry.fiber_g,
    serving_size: entry.serving_size,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/log");
  return { ok: true };
}

// Log a saved meal — copies its macros into a new food_entries row.
// `meal` is the meal slot (breakfast/lunch/etc.); we pick a sensible
// default from the current hour if not provided.
export async function quickAddSavedMeal(
  savedMealId: string,
  meal?: string,
): Promise<SavedMealActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const m: Meal = meal && isMeal(meal) ? meal : defaultMeal();

  const { data: tpl, error: readErr } = await supabase
    .from("saved_meals")
    .select(
      "description,calories,protein_g,carbs_g,fat_g,fiber_g,serving_size,use_count",
    )
    .eq("id", savedMealId)
    .eq("user_id", user.id)
    .single();
  if (readErr || !tpl) return { ok: false, error: "Saved meal not found." };

  const { error: insertErr } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal: m,
    description: tpl.description as string,
    source: "text",
    calories: tpl.calories,
    protein_g: tpl.protein_g,
    carbs_g: tpl.carbs_g,
    fat_g: tpl.fat_g,
    fiber_g: tpl.fiber_g,
    serving_size: tpl.serving_size,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  // Bump usage stats for sort order — the meal is already logged, so a failure
  // here only costs sort accuracy.
  const { error: bumpErr } = await supabase
    .from("saved_meals")
    .update({
      use_count: ((tpl.use_count as number) ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", savedMealId)
    .eq("user_id", user.id);
  logQueryError("savedMeals.bumpUseCount", bumpErr, { savedMealId });

  revalidatePath("/today");
  revalidatePath("/log");
  return { ok: true };
}

export async function deleteSavedMeal(
  savedMealId: string,
): Promise<SavedMealActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("saved_meals")
    .delete()
    .eq("id", savedMealId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/log");
  return { ok: true };
}
