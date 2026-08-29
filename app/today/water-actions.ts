"use server";

import {
  requireUser,
  revalidatePaths,
  undoLastLogToday,
  type ActionResult,
} from "@/lib/actions";
import { dayBounds } from "@/lib/food";
import { parseNumber } from "@/lib/form-values";
import { hydrationFactor, isBeverageKind, ozToMl } from "@/lib/hydration";

export type WaterResult = ActionResult;

export async function logWater(formData: FormData): Promise<WaterResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const ozRaw = String(formData.get("oz") ?? "").trim();
  const mlRaw = String(formData.get("ml") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "water").trim();
  const when = String(formData.get("when") ?? "now").trim();
  const kind = isBeverageKind(kindRaw) ? kindRaw : "water";

  let ml: number | null = null;
  if (ozRaw) {
    const oz = parseNumber(ozRaw, { min: 0, max: 170, exclusiveMin: true });
    if (!oz.ok) return { ok: false, error: "Enter ounces between 1 and 170." };
    ml = ozToMl(oz.value);
  } else if (mlRaw) {
    const parsed = parseNumber(mlRaw, { min: 0, max: 5000, exclusiveMin: true });
    if (!parsed.ok) return { ok: false, error: "Enter ml between 1 and 5000." };
    ml = parsed.value;
  } else {
    return { ok: false, error: "Pick an amount." };
  }

  // "Earlier" backfills a glass from earlier today so it doesn't read as a
  // just-now drink for the timing-aware insight. Anchored 3h back but never
  // before midnight.
  let loggedAt: string | undefined;
  if (when === "earlier") {
    const startOfDay = dayBounds().start;
    const threeHoursAgo = new Date(
      Date.now() - 3 * 60 * 60 * 1000,
    ).toISOString();
    loggedAt = threeHoursAgo > startOfDay ? threeHoursAgo : startOfDay;
  }

  const { error } = await supabase.from("water_logs").insert({
    user_id: user.id,
    ml,
    kind,
    hydration_factor: hydrationFactor(kind),
    ...(loggedAt ? { logged_at: loggedAt } : {}),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePaths("/today", "/weekly");
  return { ok: true };
}

export async function undoLastWater(): Promise<WaterResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const result = await undoLastLogToday(auth.supabase, "water_logs", auth.user.id);
  if (!result.ok) return result;

  revalidatePaths("/today", "/weekly");
  return { ok: true };
}
