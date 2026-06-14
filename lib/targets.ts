// Smarter target computation. Two modes:
//
//   manual — use the daily_* numbers the user typed (legacy behavior).
//   auto   — derive base targets from biometrics + goal, and prefer the
//            REAL measured energy burn from Oura (total_calories) over a
//            static activity multiplier. This makes calories self-tune to
//            how active the week actually was.
//
// The per-phase modifiers (lib/phase-modifiers) still apply on top of
// whatever this returns, so cycle adjustments compose with auto targets.

import type { Totals } from "./food";

export type TargetMode = "manual" | "auto";

const LB_TO_KG = 0.45359237;
const IN_TO_CM = 2.54;

// Harris-style activity multipliers, used only as a fallback when no Oura
// burn data is available.
const ACTIVITY_MULTIPLIER: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Goal → daily calorie offset and default protein (g per kg bodyweight).
const GOAL_OFFSET: Record<string, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};
const GOAL_PROTEIN_PER_KG: Record<string, number> = {
  lose: 2.0, // preserve lean mass in a deficit
  maintain: 1.6,
  gain: 1.8,
};

export type TargetInputs = {
  mode: TargetMode | null;
  // Stored manual targets (the daily_* columns).
  manual: Totals;
  // Biometrics for the auto path.
  sex: string | null;
  dateOfBirth: string | null; // YYYY-MM-DD
  heightIn: number | null;
  weightLbs: number | null;
  activityLevel: string | null;
  goal: string | null;
  proteinPerKg: number | null;
  // Rolling 7-day average of Oura total_calories (measured TDEE), or null.
  ouraTdee7d: number | null;
};

export type ComputedTargets = {
  targets: Totals;
  source: "manual" | "oura" | "estimate";
  tdee: number | null; // the TDEE used for the auto calc
  note: string | null; // short human explanation for the UI
};

function ageFromDob(dob: string): number | null {
  const t = Date.parse(`${dob}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const years = (Date.now() - t) / (365.25 * 86_400_000);
  return years > 0 && years < 120 ? Math.floor(years) : null;
}

// Mifflin-St Jeor resting metabolic rate.
function bmr(sex: string, kg: number, cm: number, age: number): number {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  // +5 for male, -161 for female. "other"/unknown → midpoint (-78).
  const sexConst = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return base + sexConst;
}

export function computeTargets(input: TargetInputs): ComputedTargets {
  // Manual mode (or missing the data we'd need) → return stored numbers.
  const haveAutoData =
    input.weightLbs != null &&
    input.heightIn != null &&
    input.dateOfBirth != null;

  if (input.mode !== "auto" || !haveAutoData) {
    return { targets: input.manual, source: "manual", tdee: null, note: null };
  }

  const kg = input.weightLbs! * LB_TO_KG;
  const cm = input.heightIn! * IN_TO_CM;
  const age = ageFromDob(input.dateOfBirth!);
  if (age === null) {
    return { targets: input.manual, source: "manual", tdee: null, note: null };
  }

  const sex = input.sex ?? "female";
  const restingBurn = bmr(sex, kg, cm, age);

  // Prefer measured TDEE from Oura when it's plausible (above resting).
  let tdee: number;
  let source: "oura" | "estimate";
  if (input.ouraTdee7d != null && input.ouraTdee7d > restingBurn) {
    tdee = input.ouraTdee7d;
    source = "oura";
  } else {
    const mult = ACTIVITY_MULTIPLIER[input.activityLevel ?? "moderate"] ?? 1.55;
    tdee = restingBurn * mult;
    source = "estimate";
  }

  const goal = input.goal ?? "maintain";
  const offset = GOAL_OFFSET[goal] ?? 0;
  // Never prescribe below ~RMR; chronic under-RMR eating is the thing we
  // most want to avoid for an active woman.
  const calories = Math.max(Math.round(restingBurn * 1.05), Math.round(tdee + offset));

  const proteinPerKg =
    input.proteinPerKg ?? GOAL_PROTEIN_PER_KG[goal] ?? 1.6;
  const protein_g = Math.round(proteinPerKg * kg);

  // Fat ~0.9 g/kg (a healthy-hormones floor), carbs fill the remainder.
  const fat_g = Math.round(0.9 * kg);
  const remainingCals = calories - protein_g * 4 - fat_g * 9;
  const carbs_g = Math.max(0, Math.round(remainingCals / 4));

  // Fiber scales with intake: ~14 g per 1000 kcal, clamped to a sane band.
  const fiber_g = Math.min(45, Math.max(25, Math.round((14 * calories) / 1000)));

  const tdeeRounded = Math.round(tdee);
  const note =
    source === "oura"
      ? `Auto from your 7-day Oura burn (~${tdeeRounded.toLocaleString()} kcal/day)`
      : `Auto estimate from your stats (~${tdeeRounded.toLocaleString()} kcal/day)`;

  return {
    targets: { calories, protein_g, carbs_g, fat_g, fiber_g },
    source,
    tdee: tdeeRounded,
    note,
  };
}
