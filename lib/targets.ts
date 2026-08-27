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
  // Build muscle: a lean surplus — enough to fuel muscle protein synthesis
  // without the fat gain of a full bulk.
  muscle: 150,
};
const GOAL_PROTEIN_PER_KG: Record<string, number> = {
  lose: 2.0, // preserve lean mass in a deficit
  maintain: 1.6,
  gain: 1.8,
  muscle: 2.2, // top of the muscle-protein-synthesis range
};

// Self-described build scales the per-kg protein: protein need tracks lean
// mass, not scale weight, so a muscular person needs more per total kg and a
// higher-body-fat person needs less. Unset/average keeps today's behavior.
const BUILD_PROTEIN_MULT: Record<string, number> = {
  lean: 1.05,
  average: 1.0,
  muscular: 1.1,
  higher_fat: 0.85,
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
  bodyBuild?: string | null;
  proteinPerKg: number | null;
  // Rolling 7-day average of Oura total_calories (measured TDEE), or null.
  ouraTdee7d: number | null;
  // TDEE inferred from logged intake + weight trend (MacroFactor-style), the
  // most personalized estimate when there's enough data. Preferred when set.
  adaptiveTdee?: number | null;
};

export type ComputedTargets = {
  targets: Totals;
  source: "manual" | "oura" | "estimate" | "adaptive";
  tdee: number | null; // the TDEE used for the auto calc
  note: string | null; // short human explanation for the UI
};

// Infer maintenance TDEE from what the user actually ate vs. how their weight
// trended (energy balance): TDEE = average intake − stored-energy change.
// Negative trend (losing) → burning more than eating → TDEE above intake.
// Returns null unless there's enough signal to trust it.
const KCAL_PER_LB = 3500;
export function adaptiveTdeeFromIntake(args: {
  avgDailyIntake: number | null;
  loggedDays: number;
  weightTrendLbsPerWeek: number | null;
}): number | null {
  if (
    args.avgDailyIntake == null ||
    args.avgDailyIntake <= 0 ||
    args.loggedDays < 10 ||
    args.weightTrendLbsPerWeek == null ||
    !Number.isFinite(args.weightTrendLbsPerWeek)
  ) {
    return null;
  }
  const dailyTrendKcal = (args.weightTrendLbsPerWeek * KCAL_PER_LB) / 7;
  const tdee = args.avgDailyIntake - dailyTrendKcal;
  // Reject implausible results (bad weight data, extreme under-logging).
  if (tdee < 1000 || tdee > 5000) return null;
  return Math.round(tdee);
}

// Linear fit on (day offset, weight) to estimate weight trend in lb/week.
// Returns null if there's fewer than 4 distinct readings — too noisy.
export function weightTrendLbsPerWeek(
  readings: Array<{ measured_at: string; weight_lbs: number }>,
): { lbsPerWeek: number; rSquared: number } | null {
  if (readings.length < 4) return null;
  const sorted = [...readings].sort((a, b) =>
    a.measured_at.localeCompare(b.measured_at),
  );
  const t0 = Date.parse(sorted[0].measured_at);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of sorted) {
    xs.push((Date.parse(r.measured_at) - t0) / 86_400_000); // days
    ys.push(r.weight_lbs);
  }
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  let totSS = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
    totSS += (ys[i] - my) ** 2;
  }
  if (den === 0 || totSS === 0) return null;
  const slope = num / den; // lb/day
  const intercept = my - slope * mx;
  let resSS = 0;
  for (let i = 0; i < n; i++) {
    const yhat = intercept + slope * xs[i];
    resSS += (ys[i] - yhat) ** 2;
  }
  const rSquared = 1 - resSS / totSS;
  return { lbsPerWeek: slope * 7, rSquared };
}

// Project an ETA to a goal weight given current weight, goal, and trend.
// Returns null when the trend points the wrong way (gaining while trying
// to lose, etc.) or there's no goal/no trend.
export function projectGoalEta(args: {
  currentLbs: number | null;
  goalLbs: number | null;
  trend: { lbsPerWeek: number; rSquared: number } | null;
}): { etaDate: string; weeksAway: number } | null {
  if (
    args.currentLbs == null ||
    args.goalLbs == null ||
    args.trend == null ||
    !Number.isFinite(args.trend.lbsPerWeek) ||
    args.trend.lbsPerWeek === 0
  ) {
    return null;
  }
  const delta = args.goalLbs - args.currentLbs; // positive = need to gain
  const trendSign = Math.sign(args.trend.lbsPerWeek);
  const needSign = Math.sign(delta);
  if (trendSign !== needSign) return null;
  const weeks = Math.abs(delta / args.trend.lbsPerWeek);
  if (!Number.isFinite(weeks) || weeks > 260) return null; // >5y = useless
  const eta = new Date(Date.now() + weeks * 7 * 86_400_000);
  return {
    etaDate: eta.toISOString().slice(0, 10),
    weeksAway: Math.round(weeks * 10) / 10,
  };
}

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

  // Expenditure source, most→least personalized: a weight-trend adaptive TDEE
  // (when we have enough logging history), then Oura's measured burn, then a
  // formula estimate.
  let tdee: number;
  let source: "adaptive" | "oura" | "estimate";
  if (input.adaptiveTdee != null && input.adaptiveTdee > restingBurn * 0.9) {
    tdee = input.adaptiveTdee;
    source = "adaptive";
  } else if (input.ouraTdee7d != null && input.ouraTdee7d > restingBurn) {
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

  const buildMult =
    BUILD_PROTEIN_MULT[input.bodyBuild ?? "average"] ?? 1.0;
  const proteinPerKg =
    input.proteinPerKg ?? (GOAL_PROTEIN_PER_KG[goal] ?? 1.6) * buildMult;
  const protein_g = Math.round(proteinPerKg * kg);

  // Fat ~0.9 g/kg (a healthy-hormones floor), carbs fill the remainder.
  const fat_g = Math.round(0.9 * kg);
  const remainingCals = calories - protein_g * 4 - fat_g * 9;
  const carbs_g = Math.max(0, Math.round(remainingCals / 4));

  // Fiber scales with intake: ~14 g per 1000 kcal, clamped to a sane band.
  const fiber_g = Math.min(45, Math.max(25, Math.round((14 * calories) / 1000)));

  const tdeeRounded = Math.round(tdee);
  const note =
    source === "adaptive"
      ? `Learned from your logging + weight trend (~${tdeeRounded.toLocaleString()} kcal/day)`
      : source === "oura"
        ? `Auto from your 7-day Oura burn (~${tdeeRounded.toLocaleString()} kcal/day)`
        : `Auto estimate from your stats (~${tdeeRounded.toLocaleString()} kcal/day)`;

  return {
    targets: { calories, protein_g, carbs_g, fat_g, fiber_g },
    source,
    tdee: tdeeRounded,
    note,
  };
}
