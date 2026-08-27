// Apple Health import parser. Accepts the JSON or CSV produced by the
// "Health Auto Export" iOS app and normalizes it into long-format
// datapoints for the apple_health_data table.
//
// Two input shapes are supported:
//  1. JSON automation export: { data: { metrics: [...], workouts: [...] } }
//  2. Aggregated CSV: a Date column plus one column per metric.
//
// We never invent values — anything we can't parse is skipped, and the
// caller reports how many records actually landed.

import { logError } from "./log";

export type HealthPoint = {
  metric: string;
  value: number;
  unit: string | null;
  recorded_at: string; // ISO
  source: string | null;
};

export type ParsedHealth = {
  points: HealthPoint[];
  rangeStart: string | null; // ISO date
  rangeEnd: string | null;
};

// Map Health Auto Export metric identifiers (and common header labels) to
// the canonical metric names we store. Anything not in here is still
// imported under a slugified name so no data is silently dropped.
const METRIC_ALIASES: Record<string, string> = {
  weight_body_mass: "body_weight",
  body_mass: "body_weight",
  weight: "body_weight",
  body_fat_percentage: "body_fat_pct",
  body_fat: "body_fat_pct",
  resting_heart_rate: "resting_hr",
  heart_rate_resting: "resting_hr",
  step_count: "steps",
  steps: "steps",
  active_energy: "active_energy",
  active_energy_burned: "active_energy",
  vo2_max: "vo2_max",
  vo2max: "vo2_max",
  menstrual_flow: "menstrual_flow",
  menstruation: "menstrual_flow",
  period: "menstrual_flow",
};

function canonicalMetric(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // drop "(lb)" etc. from CSV headers
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (METRIC_ALIASES[key]) return METRIC_ALIASES[key];
  // Heuristic contains-matching for messy CSV headers.
  if (key.includes("weight") || key.includes("body_mass")) return "body_weight";
  if (key.includes("body_fat")) return "body_fat_pct";
  if (key.includes("resting") && key.includes("heart")) return "resting_hr";
  if (key.includes("step")) return "steps";
  if (key.includes("active") && key.includes("energy")) return "active_energy";
  if (key.includes("vo2")) return "vo2_max";
  if (key.includes("menstr") || key.includes("period")) return "menstrual_flow";
  return key || "unknown";
}

function toIso(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Health Auto Export uses "2026-06-01 00:00:00 -0400"; Date handles it
  // once we make the space before time a 'T' only if there's no offset
  // confusion. Try as-is first, then a normalized variant.
  let d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    d = new Date(s.replace(" ", "T"));
  }
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    if (cleaned === "") return null;
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ---- JSON (Health Auto Export automation format) ----

type HaeMetric = {
  name?: string;
  units?: string;
  data?: Array<Record<string, unknown>>;
};

type HaeWorkout = {
  name?: string;
  start?: string;
  end?: string;
  duration?: number; // seconds in some versions, minutes in others
  activeEnergyBurned?: { qty?: number; units?: string } | number;
};

function parseJson(root: unknown): ParsedHealth {
  const points: HealthPoint[] = [];
  const data = (root as { data?: unknown })?.data ?? root;
  const metrics = (data as { metrics?: HaeMetric[] })?.metrics ?? [];
  const workouts = (data as { workouts?: HaeWorkout[] })?.workouts ?? [];

  for (const m of metrics) {
    if (!m?.name || !Array.isArray(m.data)) continue;
    const metric = canonicalMetric(m.name);
    const unit = typeof m.units === "string" ? m.units : null;
    for (const row of m.data) {
      const recorded_at = toIso(row.date ?? row.Date ?? row.timestamp);
      // Health Auto Export uses qty; quantitative metrics may also use Avg.
      const value = num(row.qty ?? row.Avg ?? row.value ?? row.avg);
      if (recorded_at === null || value === null) continue;
      points.push({ metric, value, unit, recorded_at, source: "apple_health" });
    }
  }

  for (const w of workouts) {
    const recorded_at = toIso(w.start);
    if (recorded_at === null) continue;
    // Normalize duration to minutes. HAE has historically emitted seconds.
    let minutes: number | null = null;
    if (typeof w.duration === "number") {
      minutes = w.duration > 1000 ? w.duration / 60 : w.duration;
    } else if (w.start && w.end) {
      const a = new Date(w.start).getTime();
      const b = new Date(w.end).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
        minutes = (b - a) / 60000;
      }
    }
    if (minutes !== null) {
      points.push({
        metric: "workout_minutes",
        value: Math.round(minutes * 10) / 10,
        unit: "min",
        recorded_at,
        source: w.name ? `apple_health:${w.name}` : "apple_health",
      });
    }
    const energy =
      typeof w.activeEnergyBurned === "number"
        ? w.activeEnergyBurned
        : num(w.activeEnergyBurned?.qty);
    if (energy !== null) {
      points.push({
        metric: "workout_energy",
        value: energy,
        unit: "kcal",
        recorded_at,
        source: w.name ? `apple_health:${w.name}` : "apple_health",
      });
    }
  }

  return finalize(points);
}

// ---- CSV (aggregated export) ----

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): ParsedHealth {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return finalize([]);

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  // Find the date column.
  const dateIdx = header.findIndex((h) => /date|time/i.test(h));
  if (dateIdx === -1) return finalize([]);

  const points: HealthPoint[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const recorded_at = toIso(cells[dateIdx]);
    if (recorded_at === null) continue;
    for (let c = 0; c < header.length; c++) {
      if (c === dateIdx) continue;
      const value = num(cells[c]);
      if (value === null) continue;
      const unitMatch = header[c].match(/\(([^)]+)\)/);
      points.push({
        metric: canonicalMetric(header[c]),
        value,
        unit: unitMatch ? unitMatch[1] : null,
        recorded_at,
        source: "apple_health",
      });
    }
  }
  return finalize(points);
}

function finalize(points: HealthPoint[]): ParsedHealth {
  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  for (const p of points) {
    const day = p.recorded_at.slice(0, 10);
    if (rangeStart === null || day < rangeStart) rangeStart = day;
    if (rangeEnd === null || day > rangeEnd) rangeEnd = day;
  }
  return { points, rangeStart, rangeEnd };
}

export function parseHealthExport(text: string): ParsedHealth {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return parseJson(JSON.parse(trimmed));
    } catch (err) {
      // fall through to CSV attempt
      logError("appleHealth.parseJson", err);
    }
  }
  return parseCsv(trimmed);
}
