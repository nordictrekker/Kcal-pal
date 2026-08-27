"use server";

import { revalidatePath } from "next/cache";
import { requireUser, revalidatePaths } from "@/lib/actions";
import { parseTextMeal } from "@/lib/anthropic";
import {
  NUTRIENT_COLUMNS,
  loadRelevantHistory,
  nutrientColumns,
} from "@/lib/food";

const MAX_DESC = 1000;

export type EditState = { ok: boolean; error?: string };

// Inline edit of one entry's macro values. Setting any value flags the
// entry edited_by_user=true so I can tell AI estimates from my corrections.
export async function updateEntry(
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing entry id." };

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const patch: Record<string, number | string | boolean | null> = {
    edited_by_user: true,
  };

  // Micros are editable too, so a wrong supplement/label estimate can be fixed
  // from the label instead of living with the AI's guess.
  for (const field of NUTRIENT_COLUMNS) {
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

  revalidatePaths("/today", "/today/summary");
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

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Reference the user's other logs for consistency (exclude this entry).
  const history = await loadRelevantHistory(supabase, user.id, text, id);

  const result = await parseTextMeal(text, history);
  if (!result.ok) return { ok: false, error: result.error };
  const d = result.data;

  const { error } = await supabase
    .from("food_entries")
    .update({
      description: text,
      ...nutrientColumns(d),
      raw_ai_response: (result.raw as object) ?? null,
      edited_by_user: true,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePaths("/today", "/today/summary");
  return { ok: true };
}

export async function deleteEntry(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const auth = await requireUser();
  if (!auth.ok) return;
  const { supabase, user } = auth;

  await supabase
    .from("food_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/today");
}
