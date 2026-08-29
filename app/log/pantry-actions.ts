"use server";

import { revalidatePath } from "next/cache";
import { requireUser, type ActionResult } from "@/lib/actions";
import { isMeal, defaultMeal } from "@/lib/food";
import type { Meal } from "@/lib/types";

export type PantryActionResult = ActionResult;

export type QuickLogPayload = {
  description: string;
  meal?: string | null;
  date?: string | null;
  nutrients: Record<string, number | null | undefined>;
};

const NUTRIENT_KEYS = [
  "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "saturated_fat_g",
  "cholesterol_mg", "iron_mg", "calcium_mg", "magnesium_mg", "vitamin_d_mcg",
  "omega3_mg",
  "folate_mcg",
  "choline_mg",
  "iodine_mcg",
] as const;

// Instantly log a frequent pantry food, copying the nutrients captured the last
// time it appeared in a log — no AI call. (Tapping the chip body instead fills
// the description box for editing before logging.)
export async function quickLogFrequent(
  payload: QuickLogPayload,
): Promise<PantryActionResult> {
  const desc = (payload.description ?? "").trim();
  if (!desc) return { ok: false, error: "Missing item." };

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const m: Meal =
    payload.meal && isMeal(payload.meal) ? payload.meal : defaultMeal();

  const todayKey = new Date().toISOString().slice(0, 10);
  const consumedAt =
    payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date) && payload.date < todayKey
      ? `${payload.date}T12:00:00.000Z`
      : null;

  const nutrientCols: Record<string, number | null> = {};
  for (const k of NUTRIENT_KEYS) {
    const v = payload.nutrients?.[k];
    nutrientCols[k] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }

  const { error } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal: m,
    description: desc,
    source: "text",
    ...nutrientCols,
    ...(consumedAt ? { consumed_at: consumedAt } : {}),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/today/summary");
  revalidatePath("/log");
  return { ok: true };
}
