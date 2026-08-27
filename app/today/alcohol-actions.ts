"use server";

import {
  requireUser,
  revalidatePaths,
  undoLastLogToday,
  type ActionResult,
} from "@/lib/actions";
import {
  computeDrink,
  isDrinkType,
  resolveVolumeMl,
  type ContainerId,
} from "@/lib/alcohol";
import { parseNumber } from "@/lib/form-values";

export type AlcoholResult = ActionResult;

const REVALIDATE = ["/today", "/today/summary", "/weekly"];

export async function logAlcohol(formData: FormData): Promise<AlcoholResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const drink = String(formData.get("drink") ?? "").trim();
  const container = String(formData.get("container") ?? "glass").trim() as ContainerId;
  const amount = parseNumber(formData.get("amount") ?? "1", {
    min: 0,
    max: 20,
    exclusiveMin: true,
  });

  if (!isDrinkType(drink)) return { ok: false, error: "Unknown drink." };
  if (!amount.ok) return { ok: false, error: "Pick an amount." };

  const volumeMl = resolveVolumeMl(drink, container, amount.value);
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

  revalidatePaths(...REVALIDATE);
  return { ok: true };
}

export async function undoLastAlcohol(): Promise<AlcoholResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const result = await undoLastLogToday(
    auth.supabase,
    "alcohol_logs",
    auth.user.id,
  );
  if (!result.ok) return result;

  revalidatePaths(...REVALIDATE);
  return { ok: true };
}
