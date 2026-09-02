"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseTextMeal } from "@/lib/anthropic";
import { enrichMicrosWithUsda } from "@/lib/fdc";
import { selectRelevantHistory, nutrientColumns } from "@/lib/food";

const MICRO_FIELDS = [
  "saturated_fat_g", "trans_fat_g", "cholesterol_mg",
  "fiber_g", "iron_mg", "calcium_mg", "magnesium_mg", "vitamin_d_mcg", "omega3_mg",
  "folate_mcg", "choline_mg", "iodine_mcg",
] as const;

// One distinct food (normalized description) with every entry that shares it.
// The whole group is parsed ONCE and the result applied to all its entries —
// a daily "cup of coffee with 2% milk" costs one AI call, not one per day.
export type ReanalyzeTarget = {
  ids: string[];
  description: string;
  count: number;
  // ISO timestamp of the most recent entry in this group — lets the client
  // scope a run to "last week / 2 weeks / 30 days" without another query.
  lastAt: string;
};

function descKey(d: string): string {
  return d.trim().toLowerCase().replace(/\s+/g, " ");
}

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

  // Skip user-corrected entries entirely — corrections are authoritative.
  // Barcode scans are included: their label MACROS are kept (see reanalyzeOne)
  // but their micros came from the old enrichment and deserve a refresh.
  const { data } = await supabase
    .from("food_entries")
    .select("id,description,consumed_at")
    .eq("user_id", user.id)
    .in("source", ["text", "barcode"])
    .eq("edited_by_user", false)
    .order("consumed_at", { ascending: true });

  const groups = new Map<string, ReanalyzeTarget>();
  for (const r of data ?? []) {
    const description = r.description as string;
    const at = r.consumed_at as string;
    const key = descKey(description);
    const g = groups.get(key);
    if (g) {
      g.ids.push(r.id as string);
      g.count += 1;
      if (at > g.lastAt) g.lastAt = at;
    } else {
      groups.set(key, {
        ids: [r.id as string],
        description,
        count: 1,
        lastAt: at,
      });
    }
  }
  return Array.from(groups.values());
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
  if (entry.edited_by_user) {
    return { ok: false, id, error: "Skipped — this entry has your manual corrections." };
  }

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

  // Supplement components keep their label numbers (USDA has foods, not
  // supplement labels); the ordinary foods in the same entry are still
  // enriched.
  const d = await enrichMicrosWithUsda(supabase, result.data, {
    description: text,
  });
  // Barcode entries keep their label macros (calories/protein/carbs/fat and
  // label sat-fat/cholesterol); only the estimated micro fields refresh.
  const isBarcode = entry.source === "barcode";
  const fullCols = nutrientColumns(d) as Record<string, unknown>;
  const barcodeCols: Record<string, unknown> = {};
  for (const f of ["fiber_g", "iron_mg", "calcium_mg", "magnesium_mg", "vitamin_d_mcg", "omega3_mg", "folate_mcg", "choline_mg", "iodine_mcg"]) {
    barcodeCols[f] = fullCols[f];
  }
  const { error: updErr } = await supabase
    .from("food_entries")
    .update({
      ...(isBarcode ? barcodeCols : fullCols),
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

export type ReanalyzeGroupResult =
  | {
      ok: true;
      description: string;
      applied: number; // entries updated with the single parse
      before: MicroSnapshot;
      after: MicroSnapshot;
      componentsBefore: boolean;
      componentsAfter: number;
    }
  | { ok: false; description: string; error: string };

// Re-analyze one DISTINCT food: a single Claude parse + USDA enrichment,
// applied to every entry sharing the (normalized) description. Text entries
// get the full nutrient refresh; barcode entries keep their label macros and
// refresh only the estimated micro fields. User-corrected entries are never
// touched.
export async function reanalyzeGroup(
  ids: string[],
): Promise<ReanalyzeGroupResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, description: "", error: "Not signed in." };
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, description: "", error: "No entries given." };
  }

  const { data: rows, error: readErr } = await supabase
    .from("food_entries")
    .select("*")
    .in("id", ids.slice(0, 200))
    .eq("user_id", user.id)
    .eq("edited_by_user", false);
  if (readErr || !rows || rows.length === 0) {
    return { ok: false, description: "", error: "Entries not found." };
  }

  const rep = rows[0];
  const text = (rep.description as string).trim();
  const key = descKey(text);
  // Only apply the shared parse to entries that genuinely share the food.
  const members = rows.filter((r) => descKey(r.description as string) === key);
  const before = snapshot(rep);
  const componentsBefore = componentMicroCount(rep.raw_ai_response) > 0;

  const { data: histRows } = await supabase
    .from("food_entries")
    .select("description,serving_size,calories,protein_g,carbs_g,fat_g,edited_by_user")
    .eq("user_id", user.id)
    .not("id", "in", `(${members.map((m) => m.id).join(",")})`)
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
  if (!result.ok) return { ok: false, description: text, error: result.error };
  const d = await enrichMicrosWithUsda(supabase, result.data, {
    description: text,
  });

  const fullCols = nutrientColumns(d) as Record<string, unknown>;
  const microCols: Record<string, unknown> = {};
  for (const f of ["fiber_g", "iron_mg", "calcium_mg", "magnesium_mg", "vitamin_d_mcg", "omega3_mg", "folate_mcg", "choline_mg", "iodine_mcg"]) {
    microCols[f] = fullCols[f];
  }
  const raw = (result.raw as object) ?? null;

  const textIds = members.filter((m) => m.source === "text").map((m) => m.id as string);
  const barcodeIds = members.filter((m) => m.source === "barcode").map((m) => m.id as string);
  let applied = 0;
  if (textIds.length > 0) {
    const { error } = await supabase
      .from("food_entries")
      .update({ ...fullCols, raw_ai_response: raw })
      .in("id", textIds)
      .eq("user_id", user.id)
      .eq("edited_by_user", false);
    if (error) return { ok: false, description: text, error: error.message };
    applied += textIds.length;
  }
  if (barcodeIds.length > 0) {
    const { error } = await supabase
      .from("food_entries")
      .update({ ...microCols, raw_ai_response: raw })
      .in("id", barcodeIds)
      .eq("user_id", user.id)
      .eq("edited_by_user", false);
    if (error) return { ok: false, description: text, error: error.message };
    applied += barcodeIds.length;
  }

  revalidatePath("/today");
  revalidatePath("/today/summary");

  return {
    ok: true,
    description: text,
    applied,
    before,
    after: snapshot({ ...d }),
    componentsBefore,
    componentsAfter: componentMicroCount(raw),
  };
}
