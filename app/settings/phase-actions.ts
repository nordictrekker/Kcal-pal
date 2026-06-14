"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeModifiers,
  type PhaseModifiers,
} from "@/lib/phase-modifiers";

export type PhaseUpdateResult = { ok: boolean; error?: string };

// Accept the modifiers as a JSON string so the form can post them whole.
export async function updatePhaseModifiers(
  formData: FormData,
): Promise<PhaseUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const raw = String(formData.get("modifiers") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Bad payload." };
  }
  const normalized: PhaseModifiers = normalizeModifiers(parsed);

  const { error } = await supabase
    .from("profiles")
    .update({ phase_modifiers: normalized })
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/settings");
  return { ok: true };
}
