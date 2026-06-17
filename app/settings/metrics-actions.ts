"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isMetricKey, DEFAULT_HOME_METRICS } from "@/lib/nutrients";

export type MetricsResult = { ok: boolean; error?: string };

// Save which metric bars appear on the home calorie card.
export async function updateVisibleMetrics(
  keys: string[],
): Promise<MetricsResult> {
  const clean = keys.filter(isMetricKey);
  const value = clean.length ? clean : DEFAULT_HOME_METRICS;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ visible_metrics: value })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  revalidatePath("/settings");
  return { ok: true };
}
