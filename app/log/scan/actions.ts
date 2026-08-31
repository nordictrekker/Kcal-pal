"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupOpenFoodFacts, type OffNutrition } from "@/lib/openfoodfacts";
import { parseBarcodeFallback } from "@/lib/anthropic";
import { usdaMicrosForItem, parseGrams } from "@/lib/fdc";
import { parseTextMeal } from "@/lib/anthropic";
import { isLabeledProduct } from "@/lib/labeled-products";
import { isMeal } from "@/lib/food";
import type { Meal } from "@/lib/types";

// Server actions are reachable as POST endpoints in their own right, so the
// lookup helpers gate on the session too rather than relying on the route
// middleware that protects /log/scan.
async function isSignedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user !== null;
}

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

  if (!(await isSignedIn())) {
    return { ok: false, reason: "error", barcode: cleaned, error: "Not signed in." };
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

  if (!(await isSignedIn())) return { ok: false, error: "Not signed in." };

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

function readNumberOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type SaveState = { ok: boolean; error?: string };

export async function saveBarcodeEntry(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const barcode = String(formData.get("barcode") ?? "").trim();
  if (!barcode) return { ok: false, error: "Missing barcode." };

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { ok: false, error: "Missing product name." };

  const mealRaw = String(formData.get("meal") ?? "");
  const meal: Meal = isMeal(mealRaw) ? mealRaw : "snack";

  const serving = String(formData.get("serving_size") ?? "").trim() || null;

  // Micronutrient hierarchy, best-effort at every level: USDA database values
  // for the fields its record actually reports, then an AI estimate of the
  // product for everything still missing — no field is left null. Labeled
  // products (supplements/bars) force the label web-search for the estimate.
  const MICRO_KEYS = [
    "saturated_fat_g", "cholesterol_mg", "iron_mg", "calcium_mg",
    "magnesium_mg", "vitamin_d_mcg", "omega3_mg", "folate_mcg",
    "choline_mg", "iodine_mcg",
  ] as const;
  const micros: Record<string, number | null> = {
    ...((await usdaMicrosForItem(supabase, description, parseGrams(serving))) ??
      {}),
  };
  const missing = MICRO_KEYS.filter((k) => micros[k] == null);
  if (missing.length > 0) {
    const estimate = await parseTextMeal(
      serving ? `${description} (${serving})` : description,
      [],
      { forceSupplementSearch: isLabeledProduct(description) },
    );
    if (estimate.ok) {
      for (const k of missing) {
        const v = estimate.data[k];
        if (typeof v === "number" && Number.isFinite(v)) micros[k] = v;
      }
    }
  }

  const { error } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal,
    description,
    source: "barcode",
    barcode,
    serving_size: serving,
    calories: readNumberOrNull(formData.get("calories")),
    protein_g: readNumberOrNull(formData.get("protein_g")),
    carbs_g: readNumberOrNull(formData.get("carbs_g")),
    fat_g: readNumberOrNull(formData.get("fat_g")),
    fiber_g: readNumberOrNull(formData.get("fiber_g")),
    ...micros,
    // The form values may have been edited from the original lookup, so
    // we don't try to round-trip the raw response here.
    edited_by_user: false,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  return { ok: true };
}
