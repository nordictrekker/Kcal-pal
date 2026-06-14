"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type WeightResult = { ok: boolean; error?: string };

export async function logWeight(formData: FormData): Promise<WeightResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const raw = String(formData.get("weight_lbs") ?? "").trim();
  if (!raw) return { ok: false, error: "Enter a weight." };
  const lbs = Number(raw);
  if (!Number.isFinite(lbs) || lbs <= 0 || lbs > 1000) {
    return { ok: false, error: "Enter a weight in pounds." };
  }

  const { error } = await supabase.from("body_weights").insert({
    user_id: user.id,
    weight_lbs: lbs,
    source: "manual",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/weekly");
  return { ok: true };
}
