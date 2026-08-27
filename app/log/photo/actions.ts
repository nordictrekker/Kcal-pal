"use server";

import { randomUUID } from "node:crypto";
import {
  requireUser,
  revalidatePaths,
  type ActionResult,
} from "@/lib/actions";
import {
  parsePhotoMeal,
  type SupportedImageMediaType,
} from "@/lib/anthropic";
import { enrichMicrosWithUsda } from "@/lib/fdc";
import { isMeal, nutrientColumnsFromForm } from "@/lib/food";
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
  const auth = await requireUser();
  if (!auth.ok)
    return { ok: false, photo_path: null, parsed: null, error: auth.error };
  const { supabase, user } = auth;

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

export type SaveState = ActionResult;

export async function savePhotoEntry(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

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

  const { error } = await supabase.from("food_entries").insert({
    user_id: user.id,
    meal,
    description,
    source: "photo",
    photo_url,
    serving_size: serving,
    ...nutrientColumnsFromForm(formData),
    plants,
    edited_by_user: false,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePaths("/today");
  return { ok: true };
}
