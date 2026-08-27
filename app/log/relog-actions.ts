"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MEALS, defaultMeal, nutrientColumns } from "@/lib/food";
import { parseTextMeal } from "@/lib/anthropic";
import { enrichMicrosWithUsda } from "@/lib/fdc";
import type { Meal } from "@/lib/types";

export type RelogResult = { ok: boolean; error?: string };

function isMeal(v: string): v is Meal {
  return (MEALS as string[]).includes(v);
}

// One-tap "log again": copy a previous entry into a new row, keeping the FULL
// nutrient breakdown (macros, micros, trans fat, plants, component breakdown)
// so the repeat log is as rich as the original — saved meals only carry macros.
export async function relogEntry(
  entryId: string,
  meal?: string,
  logDate?: string | null,
): Promise<RelogResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: src, error: readErr } = await supabase
    .from("food_entries")
    .select(
      "meal,description,source,serving_size,calories,protein_g,carbs_g,fat_g,fiber_g,saturated_fat_g,trans_fat_g,cholesterol_mg,iron_mg,calcium_mg,magnesium_mg,vitamin_d_mcg,omega3_mg,folate_mcg,choline_mg,iodine_mcg,plants,raw_ai_response",
    )
    .eq("id", entryId)
    .eq("user_id", user.id)
    .single();
  if (readErr || !src) return { ok: false, error: "Entry not found." };

  const m: Meal =
    meal && isMeal(meal) ? meal : (src.meal as Meal | null) ?? defaultMeal();

  // Same convention as the text log: a valid past date lands at noon UTC of
  // that day; otherwise the entry is stamped now.
  const todayKey = new Date().toISOString().slice(0, 10);
  const consumedAt =
    logDate && /^\d{4}-\d{2}-\d{2}$/.test(logDate) && logDate < todayKey
      ? `${logDate}T12:00:00.000Z`
      : null;

  const { error: insertErr } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal: m,
    description: src.description,
    source: src.source,
    serving_size: src.serving_size,
    calories: src.calories,
    protein_g: src.protein_g,
    carbs_g: src.carbs_g,
    fat_g: src.fat_g,
    fiber_g: src.fiber_g,
    saturated_fat_g: src.saturated_fat_g,
    trans_fat_g: src.trans_fat_g,
    cholesterol_mg: src.cholesterol_mg,
    iron_mg: src.iron_mg,
    calcium_mg: src.calcium_mg,
    magnesium_mg: src.magnesium_mg,
    vitamin_d_mcg: src.vitamin_d_mcg,
    omega3_mg: src.omega3_mg,
    folate_mcg: src.folate_mcg,
    choline_mg: src.choline_mg,
    iodine_mcg: src.iodine_mcg,
    plants: src.plants,
    raw_ai_response: src.raw_ai_response,
    ...(consumedAt ? { consumed_at: consumedAt } : {}),
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  revalidatePath("/today");
  revalidatePath("/log");
  return { ok: true };
}

// One-tap log for a Settings-declared supplement. Fast path: copy the LATEST
// logged entry matching the name (corrections carry over). First-ever log:
// run the full AI parse server-side with the supplement label web-search
// forced (declared names like "prenatal" or "NAC" don't always hit the
// trigger regex), then insert — one tap either way.
export async function relogLatestByName(
  name: string,
  meal?: string,
  logDate?: string | null,
): Promise<RelogResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Empty name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Escape LIKE wildcards in the user-supplied name.
  const pattern = `%${trimmed.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { data: match } = await supabase
    .from("food_entries")
    .select("id")
    .eq("user_id", user.id)
    .ilike("description", pattern)
    .order("consumed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (match) return relogEntry(match.id as string, meal, logDate);

  const result = await parseTextMeal(trimmed, [], {
    forceSupplementSearch: true,
  });
  if (!result.ok) {
    return { ok: false, error: `Couldn't look that up: ${result.error}` };
  }
  const enriched = await enrichMicrosWithUsda(supabase, result.data);

  const m: Meal = meal && isMeal(meal) ? meal : defaultMeal();
  const todayKey = new Date().toISOString().slice(0, 10);
  const consumedAt =
    logDate && /^\d{4}-\d{2}-\d{2}$/.test(logDate) && logDate < todayKey
      ? `${logDate}T12:00:00.000Z`
      : null;

  const { error: insertErr } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal: m,
    description: trimmed,
    source: "text",
    ...nutrientColumns(enriched),
    raw_ai_response: (result.raw as object) ?? null,
    edited_by_user: false,
    ...(consumedAt ? { consumed_at: consumedAt } : {}),
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  revalidatePath("/today");
  revalidatePath("/log");
  return { ok: true };
}
