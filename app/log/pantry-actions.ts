"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isMeal, defaultMeal } from "@/lib/food";
import type { Meal } from "@/lib/types";

export type PantryActionResult = { ok: boolean; error?: string };

// Instantly re-log a frequent food by copying the nutrients from the user's
// most recent matching entry — no AI call, no re-parsing. Used by the pantry
// chips' quick-add ("＋") button.
export async function quickLogFrequent(
  description: string,
  meal?: string,
  date?: string,
): Promise<PantryActionResult> {
  const desc = (description ?? "").trim();
  if (!desc) return { ok: false, error: "Missing item." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Pull the most recent log of this exact food to reuse its nutrient profile.
  const { data: prior, error: readErr } = await supabase
    .from("food_entries")
    .select(
      "meal,calories,protein_g,carbs_g,fat_g,fiber_g,saturated_fat_g,cholesterol_mg,iron_mg,calcium_mg,magnesium_mg,vitamin_d_mcg,omega3_mg,plants,serving_size",
    )
    .eq("user_id", user.id)
    .eq("description", desc)
    .order("consumed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!prior) return { ok: false, error: "No prior log to copy." };

  const m: Meal = meal && isMeal(meal) ? meal : ((prior.meal as Meal) ?? defaultMeal());

  // Optional back-date (mirrors logTextMeal): anchor to local noon of the day.
  const todayKey = new Date().toISOString().slice(0, 10);
  const consumedAt =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayKey
      ? `${date}T12:00:00.000Z`
      : null;

  const { error: insertErr } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal: m,
    description: desc,
    source: "text",
    calories: prior.calories,
    protein_g: prior.protein_g,
    carbs_g: prior.carbs_g,
    fat_g: prior.fat_g,
    fiber_g: prior.fiber_g,
    saturated_fat_g: prior.saturated_fat_g,
    cholesterol_mg: prior.cholesterol_mg,
    iron_mg: prior.iron_mg,
    calcium_mg: prior.calcium_mg,
    magnesium_mg: prior.magnesium_mg,
    vitamin_d_mcg: prior.vitamin_d_mcg,
    omega3_mg: prior.omega3_mg,
    plants: prior.plants,
    serving_size: prior.serving_size,
    ...(consumedAt ? { consumed_at: consumedAt } : {}),
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  revalidatePath("/today");
  revalidatePath("/today/summary");
  revalidatePath("/log");
  return { ok: true };
}
