"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseTextMeal, SUPPLEMENT_REF } from "@/lib/anthropic";
import { enrichMicrosWithUsda } from "@/lib/fdc";
import { selectRelevantHistory, nutrientColumns } from "@/lib/food";

const MICRO_FIELDS = [
  "fiber_g", "iron_mg", "calcium_mg", "magnesium_mg", "vitamin_d_mcg", "omega3_mg",
  "folate_mcg", "choline_mg", "iodine_mcg",
] as const;

export type ReanalyzeTarget = { id: string; description: string };

// Snapshot of the micros that matter for the before/after report.
type MicroSnapshot = Record<string, number | null>;

export type ReanalyzeOneResult =
  | {
      ok: true;
      id: string;
      description: string;
      before: MicroSnapshot;
      after: MicroSnapshot;
      componentsBefore: boolean; // did the old entry have per-component micros?
      componentsAfter: number; // number of components with their own micros now
    }
  | { ok: false; id: string; error: string };

// List the user's text logs, oldest first, so the client can re-analyze each.
export async function getReanalyzeTargets(): Promise<ReanalyzeTarget[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("food_entries")
    .select("id,description")
    .eq("user_id", user.id)
    .eq("source", "text")
    .order("consumed_at", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    description: r.description as string,
  }));
}

function snapshot(row: Record<string, unknown>): MicroSnapshot {
  const out: MicroSnapshot = {};
  for (const f of MICRO_FIELDS) {
    const v = row[f];
    out[f] = typeof v === "number" ? v : null;
  }
  return out;
}

function componentMicroCount(raw: unknown): number {
  // Reach into the stored AI envelope and count items that carry their own
  // micros (the new schema). Best-effort; truncated/old logs → 0.
  try {
    const obj = raw as { content?: Array<{ type?: string; text?: string }> };
    const text = obj?.content?.find((b) => b?.type === "text")?.text;
    if (!text) return 0;
    const json = JSON.parse(text.replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
    const items = Array.isArray(json.items) ? json.items : [];
    return items.filter(
      (i: Record<string, unknown>) =>
        typeof i?.iron_mg === "number" || typeof i?.magnesium_mg === "number",
    ).length;
  } catch {
    return 0;
  }
}

// Re-run one entry through the real logging pipeline (Claude parse + USDA micro
// enrichment) and update it in place. Returns a before/after micro snapshot.
export async function reanalyzeOne(id: string): Promise<ReanalyzeOneResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, id, error: "Not signed in." };

  const { data: entry, error: readErr } = await supabase
    .from("food_entries")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (readErr || !entry) return { ok: false, id, error: "Entry not found." };

  const text = (entry.description as string).trim();
  const before = snapshot(entry);
  const componentsBefore = componentMicroCount(entry.raw_ai_response) > 0;

  // Reference the user's other logs for estimate consistency.
  const { data: histRows } = await supabase
    .from("food_entries")
    .select("description,serving_size,calories,protein_g,carbs_g,fat_g,edited_by_user")
    .eq("user_id", user.id)
    .neq("id", id)
    .order("consumed_at", { ascending: false })
    .limit(200);
  const history = selectRelevantHistory(
    text,
    (histRows ?? []).map((r) => ({
      description: r.description as string,
      serving_size: (r.serving_size as string | null) ?? null,
      calories: (r.calories as number | null) ?? null,
      protein_g: (r.protein_g as number | null) ?? null,
      carbs_g: (r.carbs_g as number | null) ?? null,
      fat_g: (r.fat_g as number | null) ?? null,
      edited_by_user: Boolean(r.edited_by_user),
    })),
  );

  const result = await parseTextMeal(text, history);
  if (!result.ok) return { ok: false, id, error: result.error };

  // Supplements keep their label numbers: USDA has foods, not supplement
  // labels, and enrichment would overwrite the accurate values.
  const d = SUPPLEMENT_REF.test(text)
    ? result.data
    : await enrichMicrosWithUsda(supabase, result.data);
  const { error: updErr } = await supabase
    .from("food_entries")
    .update({
      ...nutrientColumns(d),
      raw_ai_response: (result.raw as object) ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (updErr) return { ok: false, id, error: updErr.message };

  const after = snapshot({ ...d });

  revalidatePath("/today");
  revalidatePath("/today/summary");

  return {
    ok: true,
    id,
    description: text,
    before,
    after,
    componentsBefore,
    componentsAfter: componentMicroCount(result.raw),
  };
}
