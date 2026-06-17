"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  computeDrink,
  isDrinkType,
  resolveVolumeMl,
  type ContainerId,
} from "@/lib/alcohol";

export type AlcoholResult = { ok: boolean; error?: string };

export async function logAlcohol(formData: FormData): Promise<AlcoholResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const drink = String(formData.get("drink") ?? "").trim();
  const container = String(formData.get("container") ?? "glass").trim() as ContainerId;
  const amount = Number(formData.get("amount") ?? "1");

  if (!isDrinkType(drink)) return { ok: false, error: "Unknown drink." };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 20) {
    return { ok: false, error: "Pick an amount." };
  }

  const volumeMl = resolveVolumeMl(drink, container, amount);
  if (volumeMl <= 0 || volumeMl > 3000) {
    return { ok: false, error: "That volume looks off." };
  }
  const { alcohol_g, standard_drinks, calories } = computeDrink(drink, volumeMl);

  const { error } = await supabase.from("alcohol_logs").insert({
    user_id: user.id,
    drink_type: drink,
    volume_ml: volumeMl,
    alcohol_g,
    standard_drinks,
    calories,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/today/summary");
  revalidatePath("/weekly");
  return { ok: true };
}

export async function undoLastAlcohol(): Promise<AlcoholResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: latest } = await supabase
    .from("alcohol_logs")
    .select("id")
    .eq("user_id", user.id)
    .gte("logged_at", startOfDay.toISOString())
    .order("logged_at", { ascending: false })
    .limit(1);

  const id = latest?.[0]?.id;
  if (!id) return { ok: false, error: "Nothing to undo today." };

  const { error } = await supabase.from("alcohol_logs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/today/summary");
  revalidatePath("/weekly");
  return { ok: true };
}
