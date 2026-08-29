"use server";

import { requireUser, revalidatePaths, type ActionResult } from "@/lib/actions";
import { parseNumber } from "@/lib/form-values";

export type WeightResult = ActionResult;

export async function logWeight(formData: FormData): Promise<WeightResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const lbs = parseNumber(formData.get("weight_lbs"), {
    min: 0,
    max: 1000,
    exclusiveMin: true,
  });
  if (!lbs.ok) {
    return {
      ok: false,
      error: lbs.empty ? "Enter a weight." : "Enter a weight in pounds.",
    };
  }

  const { error } = await supabase.from("body_weights").insert({
    user_id: user.id,
    weight_lbs: lbs.value,
    source: "manual",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePaths("/today", "/weekly");
  return { ok: true };
}
