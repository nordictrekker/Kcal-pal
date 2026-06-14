"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TargetsResult = { ok: boolean; error?: string };

const FIELDS = [
  ["daily_calorie_target", 800, 6000],
  ["daily_protein_target_g", 0, 500],
  ["daily_carb_target_g", 0, 1000],
  ["daily_fat_target_g", 0, 500],
  ["daily_fiber_target_g", 0, 200],
] as const;

export async function updateTargets(
  formData: FormData,
): Promise<TargetsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const patch: Record<string, number> = {};
  for (const [name, lo, hi] of FIELDS) {
    const raw = String(formData.get(name) ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < lo || n > hi) {
      return { ok: false, error: `${name} must be an integer in [${lo}, ${hi}].` };
    }
    patch[name] = n;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No changes." };
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/settings");
  return { ok: true };
}
