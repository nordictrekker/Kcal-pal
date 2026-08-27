"use server";

import {
  requireUser,
  revalidatePaths,
  type ActionResult,
} from "@/lib/actions";
import { lookupOpenFoodFacts, type OffNutrition } from "@/lib/openfoodfacts";
import { parseBarcodeFallback } from "@/lib/anthropic";
import { usdaMicrosForItem, parseGrams } from "@/lib/fdc";
import { isMeal, nutrientColumnsFromForm } from "@/lib/food";
import type { Meal } from "@/lib/types";

export type LookupResult =
  | {
      ok: true;
      source: "openfoodfacts";
      barcode: string;
      data: OffNutrition;
    }
  | {
      ok: false;
      reason: "not_found";
      barcode: string;
      // Returned so the client can hand the user a "type what it is" form
      // for the Claude fallback.
    }
  | {
      ok: false;
      reason: "error";
      barcode: string;
      error: string;
    };

export async function lookupBarcode(barcode: string): Promise<LookupResult> {
  const cleaned = String(barcode).trim();
  if (!/^\d{6,14}$/.test(cleaned)) {
    return { ok: false, reason: "error", barcode: cleaned, error: "Invalid barcode." };
  }

  try {
    const off = await lookupOpenFoodFacts(cleaned);
    if (off) {
      return { ok: true, source: "openfoodfacts", barcode: cleaned, data: off };
    }
    return { ok: false, reason: "not_found", barcode: cleaned };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed.";
    return { ok: false, reason: "error", barcode: cleaned, error: message };
  }
}

export type FallbackResult =
  | { ok: true; data: OffNutrition }
  | { ok: false; error: string };

// Claude fallback when OFF has no entry. The user gives us the product name;
// Claude estimates macros. We package the result in the same shape as OFF so
// the confirm form is identical.
export async function runClaudeFallback(args: {
  barcode: string;
  productGuess: string;
}): Promise<FallbackResult> {
  const guess = args.productGuess.trim();
  if (!guess) return { ok: false, error: "Tell me what the product is." };

  const result = await parseBarcodeFallback({
    barcode: args.barcode,
    productGuess: guess,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const d = result.data;
  // Per-gram base from the estimated serving + its gram weight, so the portion
  // editor can scale the Claude estimate too.
  const grams = parseGrams(d.serving_size);
  const perGram =
    grams && d.calories != null
      ? {
          calories: d.calories / grams,
          protein_g: d.protein_g != null ? d.protein_g / grams : null,
          carbs_g: d.carbs_g != null ? d.carbs_g / grams : null,
          fat_g: d.fat_g != null ? d.fat_g / grams : null,
          fiber_g: d.fiber_g != null ? d.fiber_g / grams : null,
        }
      : null;
  return {
    ok: true,
    data: {
      description: guess,
      calories: d.calories,
      protein_g: d.protein_g,
      carbs_g: d.carbs_g,
      fat_g: d.fat_g,
      fiber_g: d.fiber_g,
      serving_size: d.serving_size || null,
      basis: "serving",
      perGram,
      servingGrams: grams,
    },
  };
}

export type SaveState = ActionResult;

export async function saveBarcodeEntry(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const barcode = String(formData.get("barcode") ?? "").trim();
  if (!barcode) return { ok: false, error: "Missing barcode." };

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { ok: false, error: "Missing product name." };

  const mealRaw = String(formData.get("meal") ?? "");
  const meal: Meal = isMeal(mealRaw) ? mealRaw : "snack";

  const serving = String(formData.get("serving_size") ?? "").trim() || null;

  // Barcode lookups carry no micronutrients (OpenFoodFacts omits them, and the
  // Claude fallback is reshaped to macros only). Enrich from USDA FoodData
  // Central using the product name + serving grams. Misses leave micros null,
  // exactly as before. No-op without USDA_FDC_API_KEY.
  const micros = await usdaMicrosForItem(supabase, description, parseGrams(serving));

  const { error } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal,
    description,
    source: "barcode",
    barcode,
    serving_size: serving,
    ...nutrientColumnsFromForm(formData),
    ...(micros ?? {}),
    // The form values may have been edited from the original lookup, so
    // we don't try to round-trip the raw response here.
    edited_by_user: false,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePaths("/today");
  return { ok: true };
}
