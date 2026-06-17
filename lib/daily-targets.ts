// Single source of truth for a day's targets, so the home card and the food
// log summary never disagree. Layers three adjustments on top of the base:
//   1. computeTargets — biometrics + goal, preferring 7-day Oura burn.
//   2. cycle phase modifiers (e.g. luteal +5% kcal).
//   3. a rolling 7-day energy-balance correction — calories don't reset at
//      midnight, so a week of surplus gently trims today (and vice-versa).
//
// Pure and deterministic: given identical inputs, every caller gets the same
// numbers.

import {
  computeTargets,
  type TargetInputs,
} from "./targets";
import {
  applyPhaseModifiers,
  describeAdjustments,
  type PhaseModifiers,
} from "./phase-modifiers";
import type { Totals } from "./food";
import type { Phase } from "./cycle";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// One past day's logged intake (only days with entries are passed in).
export type RecentDay = { calories: number | null; carbs_g: number | null };

// Rolling balance: offset roughly half of the average daily drift over the
// recent window, capped so it stays a nudge, not a punishment.
const CAL_CORRECTION_FACTOR = 0.5;
const CAL_CORRECTION_CAP = 300; // kcal
const CAL_MIN_DRIFT = 80; // ignore noise below this
const CARB_OVER_THRESHOLD = 25; // g/day over before we ease carbs
const CARB_CORRECTION_CAP = 40; // g

export function applyRollingBalance(
  base: Totals,
  recent: RecentDay[],
): { targets: Totals; note: string | null } {
  const cals = recent
    .map((d) => d.calories)
    .filter((v): v is number => v != null && v > 0);
  // Need a few logged days before adapting.
  if (cals.length < 3) return { targets: base, note: null };

  const avgIntake = cals.reduce((a, b) => a + b, 0) / cals.length;
  const avgSurplus = avgIntake - base.calories;

  let calAdj = 0;
  if (Math.abs(avgSurplus) >= CAL_MIN_DRIFT) {
    calAdj =
      -clamp(
        avgSurplus * CAL_CORRECTION_FACTOR,
        -CAL_CORRECTION_CAP,
        CAL_CORRECTION_CAP,
      );
    calAdj = Math.round(calAdj / 10) * 10;
  }

  // Carbs: trim only when consistently over (the "I've been sugar-heavy" case).
  const carbsArr = recent
    .map((d) => d.carbs_g)
    .filter((v): v is number => v != null && v > 0);
  let carbAdj = 0;
  if (carbsArr.length >= 3) {
    const avgCarb = carbsArr.reduce((a, b) => a + b, 0) / carbsArr.length;
    const carbSurplus = avgCarb - base.carbs_g;
    if (carbSurplus >= CARB_OVER_THRESHOLD) {
      carbAdj = -clamp(
        Math.round((carbSurplus * CAL_CORRECTION_FACTOR) / 5) * 5,
        0,
        CARB_CORRECTION_CAP,
      );
    }
  }

  if (calAdj === 0 && carbAdj === 0) return { targets: base, note: null };

  const targets: Totals = {
    ...base,
    calories: Math.max(1000, base.calories + calAdj),
    carbs_g: Math.max(0, base.carbs_g + carbAdj),
  };

  const drift =
    avgSurplus >= 0
      ? `ran ~${Math.round(avgSurplus)} over/day`
      : `ran ~${Math.abs(Math.round(avgSurplus))} under/day`;
  const parts: string[] = [];
  if (calAdj < 0) parts.push(`trimming ${Math.abs(calAdj)} kcal`);
  else if (calAdj > 0) parts.push(`adding ${calAdj} kcal`);
  if (carbAdj < 0) parts.push(`easing carbs ${Math.abs(carbAdj)}g`);
  const note = `Last ${cals.length} days ${drift} — ${parts.join(", ")} today.`;

  return { targets, note };
}

export type ResolvedTargets = {
  targets: Totals; // final, with phase + balance adjustments
  base: Totals; // after computeTargets, before phase/balance (for trends)
  source: "manual" | "oura" | "estimate";
  calorieNote: string | null; // Oura/estimate explanation, when not manual
  phaseAdjustment: { phase: string; description: string } | null;
  balanceNote: string | null;
};

export function resolveDailyTargets(input: {
  targetInputs: TargetInputs;
  phase: Phase | null;
  phaseModifiers: PhaseModifiers;
  recent: RecentDay[];
}): ResolvedTargets {
  const computed = computeTargets(input.targetInputs);
  const base = computed.targets;

  const phaseAdjusted = applyPhaseModifiers(
    base,
    input.phase,
    input.phaseModifiers,
  );
  const desc = input.phase
    ? describeAdjustments(input.phaseModifiers[input.phase])
    : null;
  const phaseAdjustment =
    input.phase && desc ? { phase: input.phase, description: desc } : null;

  const { targets, note: balanceNote } = applyRollingBalance(
    phaseAdjusted,
    input.recent,
  );

  return {
    targets,
    base,
    source: computed.source,
    calorieNote: computed.source !== "manual" ? computed.note : null,
    phaseAdjustment,
    balanceNote,
  };
}

// Group raw food rows into per-day intake for the days BEFORE `todayKey`
// (YYYY-MM-DD). Only days with entries are returned, most recent first, up to
// `days`.
export function recentIntakeFromRows(
  rows: Array<{ consumed_at: string; calories: number | null; carbs_g: number | null }>,
  todayKey: string,
  days = 7,
): RecentDay[] {
  const byDay = new Map<string, { calories: number; carbs_g: number }>();
  for (const r of rows) {
    const day = r.consumed_at.slice(0, 10);
    if (day >= todayKey) continue; // exclude today + anything future
    const e = byDay.get(day) ?? { calories: 0, carbs_g: 0 };
    e.calories += Number(r.calories ?? 0);
    e.carbs_g += Number(r.carbs_g ?? 0);
    byDay.set(day, e);
  }
  return [...byDay.keys()]
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, days)
    .map((k) => byDay.get(k)!);
}
