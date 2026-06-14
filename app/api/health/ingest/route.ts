import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { timingSafeEqual } from "node:crypto";
import type { HealthPoint } from "@/lib/apple-health";
import { latestPeriodStart } from "@/lib/cycle";

// Apple Health ingest endpoint for the iOS Shortcut auto-push.
//
// Auth: Authorization: Bearer <HEALTH_INGEST_TOKEN> (constant-time compare).
// Why a custom token, not Supabase auth: Shortcuts can't do magic-link login,
// and we want this to run unattended on an Automation schedule. The token is
// scoped to this single endpoint and rotatable independently of everything else.
//
// Body shape (flexible — accepts both per-sample and metric-grouped forms):
//   { "samples": [{ "metric": "...", "value": 0, "unit": "lb", "recorded_at": "ISO" }, ...] }
//   or
//   { "metrics": [{ "name": "body_mass", "unit": "lb", "data": [{ "qty": 165, "date": "..." }] }, ...] }
//
// Idempotent — re-pushing the same samples is a no-op (upsert on
// user_id + metric + recorded_at).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const METRIC_ALIASES: Record<string, string> = {
  body_mass: "body_weight",
  weight_body_mass: "body_weight",
  weight: "body_weight",
  body_fat_percentage: "body_fat_pct",
  body_fat: "body_fat_pct",
  resting_heart_rate: "resting_hr",
  heart_rate_resting: "resting_hr",
  step_count: "steps",
  steps: "steps",
  active_energy_burned: "active_energy",
  active_energy: "active_energy",
  vo2max: "vo2_max",
  vo2_max: "vo2_max",
  menstrual_flow: "menstrual_flow",
  menstruation: "menstrual_flow",
  period: "menstrual_flow",
};

function canonicalMetric(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (METRIC_ALIASES[key]) return METRIC_ALIASES[key];
  if (key.includes("weight") || key.includes("body_mass")) return "body_weight";
  if (key.includes("body_fat")) return "body_fat_pct";
  if (key.includes("resting") && key.includes("heart")) return "resting_hr";
  if (key.includes("step")) return "steps";
  if (key.includes("active") && key.includes("energy")) return "active_energy";
  if (key.includes("vo2")) return "vo2_max";
  if (key.includes("menstr") || key.includes("period")) return "menstrual_flow";
  return key || "unknown";
}

// HealthKit menstrual-flow category values: 1=unspecified, 2=light,
// 3=medium, 4=heavy, 5=none. A "flow day" is any value in 1..4. Exports
// vary, so we treat 0 (some encode none as 0) and ≥5 as no-flow.
function isFlowValue(v: number): boolean {
  return v >= 1 && v <= 4;
}

function toIso(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!s) return null;
  let d = new Date(s);
  if (Number.isNaN(d.getTime())) d = new Date(s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function constantTimeMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function extractPoints(body: unknown): HealthPoint[] {
  const points: HealthPoint[] = [];
  const root = (body ?? {}) as Record<string, unknown>;

  // Form A: flat samples.
  const samples = Array.isArray(root.samples) ? (root.samples as unknown[]) : [];
  for (const s of samples) {
    const r = (s ?? {}) as Record<string, unknown>;
    const metric =
      typeof r.metric === "string"
        ? canonicalMetric(r.metric)
        : typeof r.name === "string"
          ? canonicalMetric(r.name)
          : null;
    const value = num(r.value ?? r.qty);
    const recorded_at = toIso(r.recorded_at ?? r.date ?? r.timestamp);
    if (!metric || value === null || recorded_at === null) continue;
    points.push({
      metric,
      value,
      unit: typeof r.unit === "string" ? r.unit : null,
      recorded_at,
      source: typeof r.source === "string" ? r.source : "shortcut",
    });
  }

  // Form B: grouped by metric (matches Health Auto Export shape so the same
  // Shortcut can also forward HAE output).
  const metrics = Array.isArray(root.metrics) ? (root.metrics as unknown[]) : [];
  for (const m of metrics) {
    const r = (m ?? {}) as Record<string, unknown>;
    if (typeof r.name !== "string") continue;
    const metric = canonicalMetric(r.name);
    const unit = typeof r.units === "string" ? r.units : typeof r.unit === "string" ? r.unit : null;
    const data = Array.isArray(r.data) ? (r.data as unknown[]) : [];
    for (const d of data) {
      const dr = (d ?? {}) as Record<string, unknown>;
      const value = num(dr.qty ?? dr.value ?? dr.avg ?? dr.Avg);
      const recorded_at = toIso(dr.date ?? dr.Date ?? dr.timestamp);
      if (value === null || recorded_at === null) continue;
      points.push({ metric, value, unit, recorded_at, source: "shortcut" });
    }
  }

  return points;
}

export async function POST(request: Request) {
  const expected = process.env.HEALTH_INGEST_TOKEN;
  const allowedEmail = process.env.ALLOWED_EMAIL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!expected || !allowedEmail || !supabaseUrl || !serviceKey) {
    return jsonError("Server misconfigured.", 500);
  }

  const auth = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix) || !constantTimeMatch(auth.slice(prefix.length), expected)) {
    return jsonError("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Body must be JSON.", 400);
  }

  const points = extractPoints(body);
  if (points.length === 0) {
    return jsonError(
      "No recognizable health samples in the body. Expected { samples: [...] } or { metrics: [...] }.",
      400,
    );
  }

  // Service-role client (RLS bypass; we authenticate via the bearer token instead).
  const supabase = createServerClient(supabaseUrl, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });

  const { data: usersPage, error: listErr } = await supabase.auth.admin.listUsers({
    perPage: 200,
  });
  if (listErr) return jsonError(`listUsers: ${listErr.message}`, 500);
  const user = usersPage.users.find(
    (u) => u.email?.toLowerCase() === allowedEmail.toLowerCase(),
  );
  if (!user) return jsonError(`No user matching ALLOWED_EMAIL=${allowedEmail}`, 404);

  const rows = points.map((p) => ({
    user_id: user.id,
    metric: p.metric,
    value: p.value,
    unit: p.unit,
    recorded_at: p.recorded_at,
    source: p.source ?? "shortcut",
  }));

  // Batched upsert.
  let imported = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("apple_health_data")
      .upsert(slice, { onConflict: "user_id,metric,recorded_at" });
    if (error)
      return jsonError(
        `Insert failed after ${imported} of ${rows.length}: ${error.message}`,
        500,
      );
    imported += slice.length;
  }

  // Backfill body weights from any weight samples (kg → lb).
  const weightPoints = points.filter((p) => p.metric === "body_weight");
  let weightsBackfilled = 0;
  if (weightPoints.length > 0) {
    const weightRows = weightPoints.map((p) => {
      const isKg = (p.unit ?? "").toLowerCase().includes("kg");
      return {
        user_id: user.id,
        weight_lbs: isKg ? p.value * 2.2046226218 : p.value,
        measured_at: p.recorded_at,
        source: "apple_health_shortcut",
      };
    });
    const measuredAts = weightRows.map((w) => w.measured_at);
    const { data: existing } = await supabase
      .from("body_weights")
      .select("measured_at")
      .eq("user_id", user.id)
      .eq("source", "apple_health_shortcut")
      .in("measured_at", measuredAts);
    const seen = new Set(
      (existing ?? []).map((e) => new Date(e.measured_at as string).getTime()),
    );
    const fresh = weightRows.filter(
      (w) => !seen.has(new Date(w.measured_at).getTime()),
    );
    if (fresh.length > 0) {
      const { error } = await supabase.from("body_weights").insert(fresh);
      if (!error) weightsBackfilled = fresh.length;
    }
  }

  // Cycle automation: if menstrual-flow samples arrived, find the most
  // recent period start and advance the profile if it's newer than what we
  // have. This is what makes the cycle tracker self-update — no manual
  // stepping once the user logs (or Oura writes) flow to Apple Health.
  let periodStartUpdated: string | null = null;
  const flowDays = points
    .filter((p) => p.metric === "menstrual_flow" && isFlowValue(p.value))
    .map((p) => p.recorded_at.slice(0, 10));
  if (flowDays.length > 0) {
    const newestStart = latestPeriodStart(flowDays);
    if (newestStart) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("last_period_start")
        .eq("user_id", user.id)
        .single();
      const current = (prof?.last_period_start as string | null) ?? null;
      if (!current || newestStart > current) {
        const { error } = await supabase
          .from("profiles")
          .update({ last_period_start: newestStart })
          .eq("user_id", user.id);
        if (!error) periodStartUpdated = newestStart;
      }
    }
  }

  // Date-range bookkeeping.
  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  for (const p of points) {
    const day = p.recorded_at.slice(0, 10);
    if (rangeStart === null || day < rangeStart) rangeStart = day;
    if (rangeEnd === null || day > rangeEnd) rangeEnd = day;
  }

  await supabase.from("apple_health_imports").insert({
    user_id: user.id,
    date_range_start: rangeStart,
    date_range_end: rangeEnd,
    records_imported: imported,
    file_name: "shortcut",
  });

  return NextResponse.json({
    ok: true,
    imported,
    weightsBackfilled,
    periodStartUpdated,
    rangeStart,
    rangeEnd,
  });
}

// Friendly probe so you can verify the URL is reachable from the Shortcut.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "Kcal-pal Apple Health ingest",
    method: "POST",
    requires: "Authorization: Bearer <HEALTH_INGEST_TOKEN>",
  });
}
