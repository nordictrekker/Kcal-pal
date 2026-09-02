"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MEALS, defaultMeal } from "@/lib/food";
import {
  TEMPLATE_SELECT,
  nutrientsFrom,
  missingMicros,
  type NutrientRow as Row,
} from "@/lib/saved-meals";
import type { Meal } from "@/lib/types";

export type SavedMealActionResult = { ok: boolean; error?: string };

function isMeal(v: string): v is Meal {
  return (MEALS as string[]).includes(v);
}

// Save a logged food entry as a reusable quick-add, copying the entry's whole
// nutrient breakdown (macros, micros, plants, component breakdown) so the
// template re-logs as faithfully as "log again" does.
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
    .select(`description,${TEMPLATE_SELECT}` as "*")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .single();
  if (readErr || !entry) return { ok: false, error: "Entry not found." };

  const { error } = await supabase.from("saved_meals").insert({
    user_id: user.id,
    label: trimmed,
    description: (entry as Row).description as string,
    ...nutrientsFrom(entry as Row),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/log");
  return { ok: true };
}

// Rename a saved meal. The label is the only thing shown in the list, so a
// typo'd or mismatched one (a yogurt saved as "Breakfast oats") is otherwise
// only fixable by deleting and re-saving.
export async function renameSavedMeal(
  savedMealId: string,
  label: string,
): Promise<SavedMealActionResult> {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Give it a name." };
  if (trimmed.length > 80) return { ok: false, error: "Name too long (max 80)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("saved_meals")
    .update({ label: trimmed, updated_at: new Date().toISOString() })
    .eq("id", savedMealId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/log");
  return { ok: true };
}

// Log a saved meal — copies its full nutrition into a new food_entries row.
// `meal` is the meal slot (breakfast/lunch/etc.); we pick a sensible default
// from the current hour if not provided. `logDate` back-dates the entry, same
// convention as the text log: a past YYYY-MM-DD lands at noon UTC of that day.
export async function quickAddSavedMeal(
  savedMealId: string,
  meal?: string,
  logDate?: string | null,
): Promise<SavedMealActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const m: Meal = meal && isMeal(meal) ? meal : defaultMeal();

  const { data: tplRaw, error: readErr } = await supabase
    .from("saved_meals")
    .select(`description,use_count,${TEMPLATE_SELECT}` as "*")
    .eq("id", savedMealId)
    .eq("user_id", user.id)
    .single();
  if (readErr || !tplRaw) return { ok: false, error: "Saved meal not found." };

  const tpl = tplRaw as Row;
  let nutrients = nutrientsFrom(tpl);

  // Self-heal legacy macro-only templates: pull the micros from the entry this
  // template was saved from and write them back, so this repair happens once.
  if (missingMicros(tpl)) {
    const { data: src } = await supabase
      .from("food_entries")
      .select(TEMPLATE_SELECT as "*")
      .eq("user_id", user.id)
      .eq("description", tpl.description as string)
      .order("edited_by_user", { ascending: false })
      .order("consumed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (src && !missingMicros(src as Row)) {
      nutrients = nutrientsFrom(src as Row);
      // Keep the template's own serving size if it has one.
      nutrients.serving_size =
        (tpl.serving_size as string | null) ?? nutrients.serving_size;
      await supabase
        .from("saved_meals")
        .update({ ...nutrients, updated_at: new Date().toISOString() })
        .eq("id", savedMealId)
        .eq("user_id", user.id);
    }
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const consumedAt =
    logDate && /^\d{4}-\d{2}-\d{2}$/.test(logDate) && logDate < todayKey
      ? `${logDate}T12:00:00.000Z`
      : null;

  const { error: insertErr } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal: m,
    description: tpl.description as string,
    source: "text",
    ...nutrients,
    ...(consumedAt ? { consumed_at: consumedAt } : {}),
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  // Bump usage stats for sort order.
  await supabase
    .from("saved_meals")
    .update({
      use_count: ((tpl.use_count as number) ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", savedMealId)
    .eq("user_id", user.id);

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
