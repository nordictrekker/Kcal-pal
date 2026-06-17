// Single source of truth for a day's targets, so the home card and the food
// log summary never disagree. Layers adjustments on a base:
//   1. computeTargets — biometrics + goal, preferring (a) a weight-trend
//      adaptive TDEE, then (b) Oura's measured burn, then (c) a formula.
//   2. cycle phase modifiers (e.g. luteal +5% kcal).
//   3. recovery adjustment — on low Oura readiness / hard training, raise
//      calories + carbs/protein to support repair.
//   4. a rolling energy-balance correction — calories don't reset at midnight,
//      so a recent surplus gently trims today (and a deficit adds).
//
// Under-logged days are excluded from (1) and (4) so a day you forgot to fully
// log can't masquerade as a deficit and crater the targets.
//
// Pure and deterministic: identical inputs → identical numbers everywhere.

import {
  computeTargets,
  adaptiveTdeeFromIntake,
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
const round10 = (v: number) => Math.round(v / 10) * 10;

// One past day's logged intake. `complete` is false when the user said they
// under-logged (or we couldn't confirm it).
export type RecentDay = {
  key: string; // YYYY-MM-DD
  calories: number;
  carbs_g: number;
  complete: boolean;
};

// Keep only days safe to learn from: explicitly complete, and not a
// statistical low-outlier (a likely forgotten/partial log) vs. the median.
function usableDays(recent: RecentDay[]): RecentDay[] {
  const complete = recent.filter((d) => d.complete && d.calories > 0);
  if (complete.length < 3) return complete;
  const sorted = [...complete.map((d) => d.calories)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // Drop days under half the median (and an absolute floor) — almost certainly
  // an incomplete log, not a real fast.
  const floor = Math.max(600, median * 0.5);
  return complete.filter((d) => d.calories >= floor);
}

// ── Rolling balance ───────────────────────────────────────────────────────
const CAL_CORRECTION_FACTOR = 0.5;
const CAL_CORRECTION_CAP = 300;
const CAL_MIN_DRIFT = 80;
const CARB_OVER_THRESHOLD = 25;
const CARB_CORRECTION_CAP = 40;

export function applyRollingBalance(
  base: Totals,
  usable: RecentDay[],
): { targets: Totals; note: string | null } {
  const days = usable.slice(0, 7);
  if (days.length < 3) return { targets: base, note: null };

  const avgIntake =
    days.reduce((a, d) => a + d.calories, 0) / days.length;
  const avgSurplus = avgIntake - base.calories;

  let calAdj = 0;
  if (Math.abs(avgSurplus) >= CAL_MIN_DRIFT) {
    calAdj = round10(
      -clamp(avgSurplus * CAL_CORRECTION_FACTOR, -CAL_CORRECTION_CAP, CAL_CORRECTION_CAP),
    );
  }

  const carbsArr = days.map((d) => d.carbs_g).filter((v) => v > 0);
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
  const note = `Last ${days.length} days ${drift} — ${parts.join(", ")} today.`;
  return { targets, note };
}

// ── Recovery adjustment ─────────────────────────────────────────────────────
export type RecoverySignals = {
  readiness: number | null;
  stepsYesterday: number | null;
  avgSteps: number | null;
};

export function applyRecoveryAdjustment(
  base: Totals,
  r: RecoverySignals | null,
): { targets: Totals; note: string | null } {
  if (!r) return { targets: base, note: null };
  let pct = 0;
  const reasons: string[] = [];
  if (r.readiness != null && r.readiness < 65) {
    pct += 0.08;
    reasons.push("recovery's low");
  } else if (r.readiness != null && r.readiness < 75) {
    pct += 0.04;
    reasons.push("recovery's a touch low");
  }
  if (
    r.stepsYesterday != null &&
    r.avgSteps != null &&
    r.avgSteps > 0 &&
    r.stepsYesterday > r.avgSteps * 1.4 &&
    r.stepsYesterday > 10_000
  ) {
    pct += 0.05;
    reasons.push("yesterday was active");
  }
  pct = Math.min(pct, 0.12);
  if (pct === 0) return { targets: base, note: null };

  const calAdd = round10(base.calories * pct);
  const carbAdd = Math.round((calAdd * 0.6) / 4);
  const proteinAdd = Math.round((calAdd * 0.4) / 4);
  const targets: Totals = {
    ...base,
    calories: base.calories + calAdd,
    carbs_g: base.carbs_g + carbAdd,
    protein_g: base.protein_g + proteinAdd,
  };
  const note = `${reasons.join(" & ")} — +${calAdd} kcal (more carbs & protein) to support recovery.`;
  return { targets, note };
}

// ── Resolver ────────────────────────────────────────────────────────────────
export type ResolvedTargets = {
  targets: Totals; // final, all adjustments applied
  base: Totals; // after computeTargets, before adjustments (for trends)
  source: "manual" | "oura" | "estimate" | "adaptive";
  calorieNote: string | null;
  phaseAdjustment: { phase: string; description: string } | null;
  recoveryNote: string | null;
  balanceNote: string | null;
};

export function resolveDailyTargets(input: {
  targetInputs: Omit<TargetInputs, "adaptiveTdee">;
  phase: Phase | null;
  phaseModifiers: PhaseModifiers;
  recent: RecentDay[]; // up to ~14 days, most recent first
  weightTrendLbsPerWeek: number | null;
  recovery: RecoverySignals | null;
}): ResolvedTargets {
  const usable = usableDays(input.recent);

  // Adaptive TDEE from the usable window (up to ~14 days) + weight trend.
  const adaptiveWindow = usable.slice(0, 14);
  const avgIntake =
    adaptiveWindow.length > 0
      ? adaptiveWindow.reduce((a, d) => a + d.calories, 0) / adaptiveWindow.length
      : null;
  const adaptiveTdee = adaptiveTdeeFromIntake({
    avgDailyIntake: avgIntake,
    loggedDays: adaptiveWindow.length,
    weightTrendLbsPerWeek: input.weightTrendLbsPerWeek,
  });

  const computed = computeTargets({ ...input.targetInputs, adaptiveTdee });
  const base = computed.targets;

  // 2. cycle phase
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

  // 3. recovery
  const { targets: recoveryTargets, note: recoveryNote } =
    applyRecoveryAdjustment(phaseAdjusted, input.recovery);

  // 4. rolling balance
  const { targets, note: balanceNote } = applyRollingBalance(
    recoveryTargets,
    usable,
  );

  return {
    targets,
    base,
    source: computed.source,
    calorieNote: computed.source !== "manual" ? computed.note : null,
    phaseAdjustment,
    recoveryNote,
    balanceNote,
  };
}

// Group raw food rows into per-day intake for the days BEFORE `todayKey`,
// flagging completeness from the day_log_status set (days the user marked
// partial/skipped). Most recent first, up to `days`.
export function recentIntakeFromRows(
  rows: Array<{ consumed_at: string; calories: number | null; carbs_g: number | null }>,
  todayKey: string,
  days = 14,
  incompleteDays: Set<string> = new Set(),
): RecentDay[] {
  const byDay = new Map<string, { calories: number; carbs_g: number }>();
  for (const r of rows) {
    const day = r.consumed_at.slice(0, 10);
    if (day >= todayKey) continue;
    const e = byDay.get(day) ?? { calories: 0, carbs_g: 0 };
    e.calories += Number(r.calories ?? 0);
    e.carbs_g += Number(r.carbs_g ?? 0);
    byDay.set(day, e);
  }
  return [...byDay.keys()]
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, days)
    .map((k) => ({
      key: k,
      calories: byDay.get(k)!.calories,
      carbs_g: byDay.get(k)!.carbs_g,
      complete: !incompleteDays.has(k),
    }));
}
