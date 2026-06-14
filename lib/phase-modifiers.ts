import type { Phase } from "./cycle";
import type { Totals } from "./food";

export type PhaseMultipliers = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type PhaseModifiers = Record<Phase, PhaseMultipliers>;

export const DEFAULT_PHASE_MODIFIERS: PhaseModifiers = {
  menstrual:  { calories: 1.00, protein: 1.00, carbs: 0.95, fat: 1.10, fiber: 1.00 },
  follicular: { calories: 1.00, protein: 1.05, carbs: 1.10, fat: 0.90, fiber: 1.00 },
  ovulatory:  { calories: 1.00, protein: 1.00, carbs: 1.00, fat: 1.00, fiber: 1.00 },
  luteal:     { calories: 1.05, protein: 1.00, carbs: 0.90, fat: 1.15, fiber: 1.10 },
};

function clampMult(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 1;
  if (v < 0.5) return 0.5;
  if (v > 1.5) return 1.5;
  return v;
}

// Coerce whatever the DB hands back into a fully-typed PhaseModifiers,
// falling back to defaults for missing keys. The jsonb column is `any`
// in DB terms; we never trust it as-is.
export function normalizeModifiers(raw: unknown): PhaseModifiers {
  const out: PhaseModifiers = {
    menstrual:  { ...DEFAULT_PHASE_MODIFIERS.menstrual },
    follicular: { ...DEFAULT_PHASE_MODIFIERS.follicular },
    ovulatory:  { ...DEFAULT_PHASE_MODIFIERS.ovulatory },
    luteal:     { ...DEFAULT_PHASE_MODIFIERS.luteal },
  };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  (Object.keys(out) as Phase[]).forEach((phase) => {
    const src = r[phase];
    if (!src || typeof src !== "object") return;
    const s = src as Record<string, unknown>;
    out[phase] = {
      calories: clampMult(s.calories),
      protein:  clampMult(s.protein),
      carbs:    clampMult(s.carbs),
      fat:      clampMult(s.fat),
      fiber:    clampMult(s.fiber),
    };
  });
  return out;
}

// Apply the given phase's multipliers to a base targets object.
// If no phase is provided (no cycle data), targets pass through unchanged.
export function applyPhaseModifiers(
  base: Totals,
  phase: Phase | null,
  modifiers: PhaseModifiers,
): Totals {
  if (!phase) return base;
  const m = modifiers[phase];
  return {
    calories: Math.round(base.calories * m.calories),
    protein_g: Math.round(base.protein_g * m.protein),
    carbs_g: Math.round(base.carbs_g * m.carbs),
    fat_g: Math.round(base.fat_g * m.fat),
    fiber_g: Math.round(base.fiber_g * m.fiber),
  };
}

// "kcal +5%, fat +15%, carbs -10%" style summary for the dashboard hint.
export function describeAdjustments(
  m: PhaseMultipliers,
): string | null {
  const parts: string[] = [];
  const push = (label: string, mult: number) => {
    const pct = Math.round((mult - 1) * 100);
    if (pct === 0) return;
    parts.push(`${label} ${pct > 0 ? "+" : ""}${pct}%`);
  };
  push("kcal", m.calories);
  push("P", m.protein);
  push("C", m.carbs);
  push("F", m.fat);
  push("Fib", m.fiber);
  return parts.length === 0 ? null : parts.join(", ");
}
