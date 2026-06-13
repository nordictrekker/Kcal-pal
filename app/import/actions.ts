"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseHealthExport, type HealthPoint } from "@/lib/apple-health";

export type ImportResult =
  | {
      ok: true;
      imported: number;
      skipped: number;
      weightsBackfilled: number;
      rangeStart: string | null;
      rangeEnd: string | null;
    }
  | { ok: false; error: string };

function kgToLb(v: number): number {
  return v * 2.2046226218;
}

export async function importHealthFile(
  formData: FormData,
): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file attached." };
  }
  if (file.size > 50 * 1024 * 1024) {
    return { ok: false, error: "File is over 50 MB. Export a shorter range." };
  }

  const text = await file.text();
  const parsed = parseHealthExport(text);

  if (parsed.points.length === 0) {
    return {
      ok: false,
      error:
        "Couldn't find any health metrics in that file. Export from Health Auto Export as JSON (Automation) or aggregated CSV.",
    };
  }

  // Upsert datapoints in batches keyed on (user_id, metric, recorded_at).
  const rows = parsed.points.map((p: HealthPoint) => ({
    user_id: user.id,
    metric: p.metric,
    value: p.value,
    unit: p.unit,
    recorded_at: p.recorded_at,
    source: p.source,
  }));

  let imported = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("apple_health_data")
      .upsert(slice, {
        onConflict: "user_id,metric,recorded_at",
        ignoreDuplicates: false,
      });
    if (error) {
      return {
        ok: false,
        error: `Insert failed after ${imported} records: ${error.message}`,
      };
    }
    imported += slice.length;
  }

  // Backfill body_weights (lbs) from any body_weight datapoints.
  const weightPoints = parsed.points.filter((p) => p.metric === "body_weight");
  let weightsBackfilled = 0;
  if (weightPoints.length > 0) {
    const weightRows = weightPoints.map((p) => {
      const isKg = (p.unit ?? "").toLowerCase().includes("kg");
      return {
        user_id: user.id,
        weight_lbs: isKg ? kgToLb(p.value) : p.value,
        measured_at: p.recorded_at,
        source: "apple_health",
      };
    });
    // body_weights has no natural unique key, so dedupe against existing
    // apple_health rows by (measured_at) to keep re-imports idempotent.
    const measuredAts = weightRows.map((w) => w.measured_at);
    const { data: existing } = await supabase
      .from("body_weights")
      .select("measured_at")
      .eq("user_id", user.id)
      .eq("source", "apple_health")
      .in("measured_at", measuredAts);
    const seen = new Set(
      (existing ?? []).map((e) => new Date(e.measured_at as string).getTime()),
    );
    const fresh = weightRows.filter(
      (w) => !seen.has(new Date(w.measured_at).getTime()),
    );
    if (fresh.length > 0) {
      for (let i = 0; i < fresh.length; i += BATCH) {
        const slice = fresh.slice(i, i + BATCH);
        const { error } = await supabase.from("body_weights").insert(slice);
        if (!error) weightsBackfilled += slice.length;
      }
    }
  }

  // Record the import.
  await supabase.from("apple_health_imports").insert({
    user_id: user.id,
    date_range_start: parsed.rangeStart,
    date_range_end: parsed.rangeEnd,
    records_imported: imported,
    file_name: file.name,
  });

  revalidatePath("/today");

  return {
    ok: true,
    imported,
    skipped: 0,
    weightsBackfilled,
    rangeStart: parsed.rangeStart,
    rangeEnd: parsed.rangeEnd,
  };
}
