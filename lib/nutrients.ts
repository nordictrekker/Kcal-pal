// Registry of displayable nutrition metrics. Drives the configurable home
// card and the full breakdown on the food-log page. Personalized macros pull
// their target from the resolved targets; everything else uses a reference
// value (RDA for an adult woman, or an upper-limit guide).

import type { Totals } from "./food";

export type MetricKey =
  | "protein"
  | "carbs"
  | "fat"
  | "saturated_fat"
  | "trans_fat"
  | "cholesterol"
  | "fiber"
  | "iron"
  | "calcium"
  | "magnesium"
  | "vitamin_d"
  | "omega3"
  | "folate"
  | "choline"
  | "iodine";

export type MetricDef = {
  key: MetricKey;
  label: string;
  unit: string;
  field: keyof Totals; // consumed value
  kind: "goal" | "limit"; // goal = aim for; limit = cap (red when over)
  colorVar: string;
  targetField?: keyof Totals; // personalized macro target field
  reference?: number;
  // Male RDA when it differs from the (default, female-adult) reference.
  referenceMale?: number; // static RDA / limit when not personalized
  category: "macro" | "micro";
  cycleRelevant?: boolean;
};

export const METRICS: Record<MetricKey, MetricDef> = {
  protein: { key: "protein", label: "Protein", unit: "g", field: "protein_g", kind: "goal", colorVar: "--macro-protein", targetField: "protein_g", category: "macro" },
  carbs: { key: "carbs", label: "Carbs", unit: "g", field: "carbs_g", kind: "goal", colorVar: "--macro-carbs", targetField: "carbs_g", category: "macro" },
  fat: { key: "fat", label: "Fat", unit: "g", field: "fat_g", kind: "goal", colorVar: "--macro-fat", targetField: "fat_g", category: "macro" },
  saturated_fat: { key: "saturated_fat", label: "Saturated fat", unit: "g", field: "saturated_fat_g", kind: "limit", colorVar: "--macro-fat", reference: 20, category: "macro" },
  trans_fat: { key: "trans_fat", label: "Trans fat", unit: "g", field: "trans_fat_g", kind: "limit", colorVar: "--macro-fat", reference: 2, category: "macro" },
  cholesterol: { key: "cholesterol", label: "Cholesterol", unit: "mg", field: "cholesterol_mg", kind: "limit", colorVar: "--macro-carbs", reference: 300, category: "macro" },
  fiber: { key: "fiber", label: "Fiber", unit: "g", field: "fiber_g", kind: "goal", colorVar: "--macro-fiber", targetField: "fiber_g", category: "macro" },
  iron: { key: "iron", label: "Iron", unit: "mg", field: "iron_mg", kind: "goal", colorVar: "--primary", reference: 18, referenceMale: 8, category: "micro", cycleRelevant: true },
  calcium: { key: "calcium", label: "Calcium", unit: "mg", field: "calcium_mg", kind: "goal", colorVar: "--macro-carbs", reference: 1000, category: "micro" },
  magnesium: { key: "magnesium", label: "Magnesium", unit: "mg", field: "magnesium_mg", kind: "goal", colorVar: "--micro-magnesium", reference: 320, referenceMale: 420, category: "micro", cycleRelevant: true },
  vitamin_d: { key: "vitamin_d", label: "Vitamin D", unit: "mcg", field: "vitamin_d_mcg", kind: "goal", colorVar: "--macro-fat", reference: 15, category: "micro" },
  omega3: { key: "omega3", label: "Omega-3", unit: "mg", field: "omega3_mg", kind: "goal", colorVar: "--macro-protein", reference: 1100, referenceMale: 1600, category: "micro", cycleRelevant: true },
  folate: { key: "folate", label: "Folate", unit: "mcg", field: "folate_mcg", kind: "goal", colorVar: "--macro-fiber", reference: 400, category: "micro" },
  choline: { key: "choline", label: "Choline", unit: "mg", field: "choline_mg", kind: "goal", colorVar: "--micro-magnesium", reference: 425, referenceMale: 550, category: "micro" },
  iodine: { key: "iodine", label: "Iodine", unit: "mcg", field: "iodine_mcg", kind: "goal", colorVar: "--primary", reference: 150, category: "micro" },
};

export const ALL_METRIC_KEYS: MetricKey[] = [
  "protein", "carbs", "fat", "saturated_fat", "trans_fat", "cholesterol", "fiber",
  "iron", "calcium", "magnesium", "vitamin_d", "omega3",
  "folate", "choline", "iodine",
];
export const DEFAULT_HOME_METRICS: MetricKey[] = ["protein", "carbs", "fat", "fiber"];
export const MACRO_METRIC_KEYS: MetricKey[] = [
  "protein", "carbs", "fat", "saturated_fat", "trans_fat", "cholesterol", "fiber",
];

// The dietary drivers of blood LDL ("bad cholesterol"), surfaced together as a
// one-tap "LDL impact" group on the home-metric picker. Food has no LDL value;
// these are what raise it (saturated fat is the biggest lever, then trans fat,
// then dietary cholesterol).
export const LDL_IMPACT_METRICS: MetricKey[] = [
  "saturated_fat", "trans_fat", "cholesterol",
];
export const MICRO_METRIC_KEYS: MetricKey[] = [
  "iron", "calcium", "magnesium", "vitamin_d", "omega3",
  "folate", "choline", "iodine",
];

// Conception/pregnancy-critical nutrients, surfaced as a one-tap group on the
// home-metric picker (same pattern as LDL impact). References here are the
// general-adult values; TTC/pregnancy target switching arrives in part 2.
export const PREGNANCY_ESSENTIAL_METRICS: MetricKey[] = [
  "folate", "choline", "iodine", "iron", "vitamin_d", "omega3",
];

export const PLANT_DIVERSITY_GOAL = 30; // distinct plants per week

export function isMetricKey(k: string): k is MetricKey {
  return k in METRICS;
}

export function sanitizeMetricKeys(arr: unknown): MetricKey[] {
  if (!Array.isArray(arr)) return DEFAULT_HOME_METRICS;
  const keys = arr
    .filter((k): k is string => typeof k === "string")
    .filter(isMetricKey);
  return keys.length ? keys : DEFAULT_HOME_METRICS;
}

export function metricValueAndTarget(
  def: MetricDef,
  totals: Totals,
  targets: Totals,
  sex?: string | null,
): { value: number; target: number } {
  const tRec = totals as Record<string, number | undefined>;
  const gRec = targets as Record<string, number | undefined>;
  const value = Number(tRec[def.field] ?? 0);
  // RDA references differ by sex for some micros (iron most of all: 8 mg for
  // men vs 18 mg for women — men should not be nudged toward extra iron).
  const reference =
    sex === "male" && def.referenceMale != null
      ? def.referenceMale
      : def.reference;
  const target =
    def.targetField != null
      ? Number(gRec[def.targetField] ?? reference ?? 0)
      : (reference ?? 0);
  return { value, target };
}
