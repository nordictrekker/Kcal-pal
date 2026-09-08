"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  parsePhotoMeal,
  type SupportedImageMediaType,
} from "@/lib/anthropic";
import { enrichMicrosWithUsda } from "@/lib/fdc";
import { isMeal } from "@/lib/food";
import { cleanPlants } from "@/lib/plants";
import type { Meal, ParsedNutrition } from "@/lib/types";

const ALLOWED_TYPES: SupportedImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function isAllowed(type: string): type is SupportedImageMediaType {
  return (ALLOWED_TYPES as string[]).includes(type);
}

function extFor(type: SupportedImageMediaType): string {
  return type === "image/jpeg" ? "jpg" : type.split("/")[1];
}

export type AnalyzeResult =
  | {
      ok: true;
      photo_path: string;
      parsed: ParsedNutrition;
    }
  | {
      ok: false;
      photo_path: string | null;
      parsed: null;
      error: string;
    };

// Upload the photo to storage, then call Claude vision. If the upload
// succeeds but parsing fails, we still return the path so the user can
// save with manual macros — never fabricate.
export async function analyzePhoto(formData: FormData): Promise<AnalyzeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, photo_path: null, parsed: null, error: "Not signed in." };
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, photo_path: null, parsed: null, error: "No photo attached." };
  }

  if (!isAllowed(file.type)) {
    return {
      ok: false,
      photo_path: null,
      parsed: null,
      error: `Unsupported image type ${file.type || "unknown"}. iPhone tip: this usually means the photo was saved as HEIC. Use the camera button in Safari rather than the photo picker, or change Settings → Camera → Formats → Most Compatible.`,
    };
  }

  // 25 MB cap to stop runaway uploads. iPhone photos are ~3-5 MB.
  if (file.size > 25 * 1024 * 1024) {
    return {
      ok: false,
      photo_path: null,
      parsed: null,
      error: "Photo is over 25 MB. Try a smaller image.",
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");

  const path = `${user.id}/${Date.now()}-${randomUUID()}.${extFor(file.type)}`;

  const { error: uploadError } = await supabase.storage
    .from("food-photos")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return {
      ok: false,
      photo_path: null,
      parsed: null,
      error: `Photo upload failed: ${uploadError.message}`,
    };
  }

  const result = await parsePhotoMeal({
    imageBase64: base64,
    mediaType: file.type,
  });

  if (!result.ok) {
    return {
      ok: false,
      photo_path: path,
      parsed: null,
      error: result.error,
    };
  }

  // Enrich micronutrients from USDA FoodData Central before handing the parsed
  // result to the review form, so the user sees (and can edit) the better
  // numbers (no-op without an API key).
  const parsed = await enrichMicrosWithUsda(supabase, result.data);
  return { ok: true, photo_path: path, parsed };
}

function readNumberOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type SaveState = { ok: boolean; error?: string };

export async function savePhotoEntry(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const photo_url = String(formData.get("photo_url") ?? "").trim();
  if (!photo_url) return { ok: false, error: "Missing photo reference." };

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { ok: false, error: "Add a description." };

  const mealRaw = String(formData.get("meal") ?? "");
  const meal: Meal = isMeal(mealRaw) ? mealRaw : "snack";

  const serving = String(formData.get("serving_size") ?? "").trim() || null;

  let plants: string[] = [];
  try {
    const raw = JSON.parse(String(formData.get("plants") ?? "[]"));
    if (Array.isArray(raw)) plants = cleanPlants(raw as string[]);
  } catch {
    plants = [];
  }

  // Component breakdown from the confirm screen, already scaled to the
  // portions the user settled on. Shaped as { items, assumptions, confidence }
  // — the same shape extractComponents() reads.
  let itemsPayload: object | null = null;
  try {
    const raw = JSON.parse(String(formData.get("items") ?? "null"));
    if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
      itemsPayload = raw as object;
    }
  } catch {
    itemsPayload = null;
  }

  const { error } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal,
    description,
    source: "photo",
    photo_url,
    serving_size: serving,
    calories: readNumberOrNull(formData.get("calories")),
    protein_g: readNumberOrNull(formData.get("protein_g")),
    carbs_g: readNumberOrNull(formData.get("carbs_g")),
    fat_g: readNumberOrNull(formData.get("fat_g")),
    fiber_g: readNumberOrNull(formData.get("fiber_g")),
    saturated_fat_g: readNumberOrNull(formData.get("saturated_fat_g")),
    cholesterol_mg: readNumberOrNull(formData.get("cholesterol_mg")),
    iron_mg: readNumberOrNull(formData.get("iron_mg")),
    calcium_mg: readNumberOrNull(formData.get("calcium_mg")),
    magnesium_mg: readNumberOrNull(formData.get("magnesium_mg")),
    vitamin_d_mcg: readNumberOrNull(formData.get("vitamin_d_mcg")),
    omega3_mg: readNumberOrNull(formData.get("omega3_mg")),
    folate_mcg: readNumberOrNull(formData.get("folate_mcg")),
    choline_mg: readNumberOrNull(formData.get("choline_mg")),
    iodine_mcg: readNumberOrNull(formData.get("iodine_mcg")),
    plants,
    // The component breakdown at the portions actually confirmed. This was
    // never stored for photo entries, so their breakdown was lost the moment
    // they were saved — Today couldn't expand them, the pantry couldn't mine
    // them, and re-analyze had nothing to work from.
    raw_ai_response: itemsPayload,
    edited_by_user: false,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  return { ok: true };
}
