"use server";

import { requireUser, revalidatePaths, type ActionResult } from "@/lib/actions";
import {
  normalizeModifiers,
  type PhaseModifiers,
} from "@/lib/phase-modifiers";

export type PhaseUpdateResult = ActionResult;

// Accept the modifiers as a JSON string so the form can post them whole.
export async function updatePhaseModifiers(
  formData: FormData,
): Promise<PhaseUpdateResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

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

  revalidatePaths("/today", "/settings");
  return { ok: true };
}
