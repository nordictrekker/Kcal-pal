"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseTextMeal } from "@/lib/anthropic";

const MAX_DESC = 1000;

const MACRO_FIELDS = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
] as const;

export type EditState = { ok: boolean; error?: string };

// Inline edit of one entry's macro values. Setting any value flags the
// entry edited_by_user=true so I can tell AI estimates from my corrections.
export async function updateEntry(
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing entry id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const patch: Record<string, number | string | boolean | null> = {
    edited_by_user: true,
  };

  for (const field of MACRO_FIELDS) {
    const raw = formData.get(field);
    if (raw === null) continue;
    const s = String(raw).trim();
    if (s === "") {
      patch[field] = null;
      continue;
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `Invalid value for ${field}.` };
    }
    patch[field] = n;
  }

  const serving = formData.get("serving_size");
  if (serving !== null) {
    patch.serving_size = String(serving).trim() || null;
  }

  const desc = formData.get("description");
  if (desc !== null) {
    const d = String(desc).trim();
    if (d) patch.description = d.slice(0, MAX_DESC);
  }

  const { error } = await supabase
    .from("food_entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/today/summary");
  return { ok: true };
}

// Re-run the AI parse on edited description text, replacing the macros and the
// component breakdown. Used when correcting what was logged ("double espresso
// 80ml" → "single espresso 30ml") rather than nudging individual numbers.
export async function reanalyzeEntry(
  id: string,
  description: string,
): Promise<EditState> {
  if (!id) return { ok: false, error: "Missing entry id." };
  const text = description.trim();
  if (!text) return { ok: false, error: "Describe what you ate." };
  if (text.length > MAX_DESC) {
    return { ok: false, error: `Description too long (max ${MAX_DESC}).` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await parseTextMeal(text);
  if (!result.ok) return { ok: false, error: result.error };
  const d = result.data;

  const { error } = await supabase
    .from("food_entries")
    .update({
      description: text,
      calories: d.calories,
      protein_g: d.protein_g,
      carbs_g: d.carbs_g,
      fat_g: d.fat_g,
      fiber_g: d.fiber_g,
      serving_size: d.serving_size || null,
      raw_ai_response: (result.raw as object) ?? null,
      edited_by_user: true,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/today/summary");
  return { ok: true };
}

export async function deleteEntry(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("food_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/today");
}
