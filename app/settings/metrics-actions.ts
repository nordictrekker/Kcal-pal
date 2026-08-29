"use server";

import { requireUser, revalidatePaths, type ActionResult } from "@/lib/actions";
import { isMetricKey, DEFAULT_HOME_METRICS } from "@/lib/nutrients";

export type MetricsResult = ActionResult;

// Save which metric bars appear on the home calorie card.
export async function updateVisibleMetrics(
  keys: string[],
): Promise<MetricsResult> {
  const clean = keys.filter(isMetricKey);
  const value = clean.length ? clean : DEFAULT_HOME_METRICS;

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("profiles")
    .update({ visible_metrics: value })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePaths("/today", "/settings");
  return { ok: true };
}
