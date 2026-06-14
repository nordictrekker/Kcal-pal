"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type WaterResult = { ok: boolean; error?: string };

const OZ_TO_ML = 29.5735;

export async function logWater(formData: FormData): Promise<WaterResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ozRaw = String(formData.get("oz") ?? "").trim();
  const mlRaw = String(formData.get("ml") ?? "").trim();

  let ml: number | null = null;
  if (ozRaw) {
    const oz = Number(ozRaw);
    if (!Number.isFinite(oz) || oz <= 0 || oz > 170) {
      return { ok: false, error: "Enter ounces between 1 and 170." };
    }
    ml = Math.round(oz * OZ_TO_ML);
  } else if (mlRaw) {
    ml = Number(mlRaw);
    if (!Number.isFinite(ml) || ml <= 0 || ml > 5000) {
      return { ok: false, error: "Enter ml between 1 and 5000." };
    }
  } else {
    return { ok: false, error: "Pick an amount." };
  }

  const { error } = await supabase.from("water_logs").insert({
    user_id: user.id,
    ml,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/weekly");
  return { ok: true };
}

export async function undoLastWater(): Promise<WaterResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: latest } = await supabase
    .from("water_logs")
    .select("id")
    .eq("user_id", user.id)
    .gte("logged_at", startOfDay.toISOString())
    .order("logged_at", { ascending: false })
    .limit(1);

  const id = latest?.[0]?.id;
  if (!id) return { ok: false, error: "Nothing to undo today." };

  const { error } = await supabase.from("water_logs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/weekly");
  return { ok: true };
}
