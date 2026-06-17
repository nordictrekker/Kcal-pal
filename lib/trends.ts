// Rolling history → trend signals for the insight engine and the weekly
// digest. Everything in here is pure: take raw rows + today's targets,
// return a digested Trends struct. No DB access so it's trivially
// testable and easy to call from both server components and edge funcs.

import { localDay, lastNDays, mean } from "./stats";
import type { Totals } from "./food";

export type DailyMacros = {
  date: string; // YYYY-MM-DD
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  hasEntries: boolean;
};

export type DailyOura = {
  date: string;
  sleep: number | null;
  hrv: number | null;
  readiness: number | null;
};

export type DailyWater = {
  date: string;
  ml: number;
};

export type Trends = {
  // Per-day macro rollups, oldest → newest. Days with no entries are still
  // present (hasEntries=false) so streak detection can see the gaps.
  macros: DailyMacros[];

  // How many of the last 7 days the user was under/over each target.
  // Excludes days with no food entries at all.
  daysUnderProtein7: number;
  daysOverCarbs7: number;
  daysUnderFiber7: number;

  // Consecutive-day streaks ending YESTERDAY (today is excluded so the
  // streak isn't "in-progress half-day" noise). null if no streak.
  underProteinStreak: number | null;
  overCarbsStreak: number | null;
  // Consecutive logged days that HIT the protein target (≥90%), ending
  // yesterday. Powers positive reinforcement — the engine should notice
  // consistency, not only shortfalls. null if no streak.
  proteinHitStreak: number | null;

  // 7-day averages.
  avgCalories7: number | null;
  avgProtein7: number | null;
  avgCarbs7: number | null;
  avgFiber7: number | null;
  avgReadiness7: number | null;
  avgSleep7: number | null;
  avgHrv7: number | null;
  avgWaterMl7: number | null;

  // Slope of readiness over the last 7 days (points per day). Positive =
  // trending up; null if too few datapoints.
  readinessTrend7: number | null;

  // For luteal-pattern insights: how many consecutive days the user has
  // been in the current phase (including today). null if no phase known.
  phaseStreak: number | null;
};

type FoodRow = {
  consumed_at: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
};

type OuraRow = {
  date: string;
  sleep_score: number | null;
  hrv_avg: number | null;
  readiness_score: number | null;
};

type CycleRow = {
  date: string;
  phase: string | null;
};

type WaterRow = {
  logged_at: string;
  ml: number;
  // Fraction of the volume that counts toward fluids (water 1.0, coffee ~0.9).
  hydration_factor?: number | null;
};

// Linear regression slope on (i, value) — used to detect trend direction.
// Returns slope in "units per day"; null if fewer than 3 datapoints.
function slopePerDay(values: Array<number | null>): number | null {
  const points = values
    .map((v, i) => ({ x: i, y: v }))
    .filter((p): p is { x: number; y: number } => p.y !== null);
  if (points.length < 3) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / points.length;
  const my = points.reduce((a, p) => a + p.y, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export function buildTrends(args: {
  food: FoodRow[];
  oura: OuraRow[];
  cycle: CycleRow[];
  water: WaterRow[];
  targets: Totals;
  days?: number;
  today?: Date;
}): Trends {
  const days = args.days ?? 14;
  const today = args.today ?? new Date();
  const dayList = lastNDays(days, today);
  const todayKey = dayList[dayList.length - 1];

  // Bucket food rows by local day.
  const macroByDay = new Map<string, DailyMacros>();
  for (const d of dayList) {
    macroByDay.set(d, {
      date: d,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      hasEntries: false,
    });
  }
  for (const f of args.food) {
    const day = localDay(f.consumed_at);
    const slot = macroByDay.get(day);
    if (!slot) continue;
    slot.calories += f.calories ?? 0;
    slot.protein_g += f.protein_g ?? 0;
    slot.carbs_g += f.carbs_g ?? 0;
    slot.fat_g += f.fat_g ?? 0;
    slot.fiber_g += f.fiber_g ?? 0;
    slot.hasEntries = true;
  }
  const macros = dayList.map((d) => macroByDay.get(d)!);

  // Bucket Oura by day.
  const ouraByDay = new Map<string, DailyOura>();
  for (const o of args.oura) {
    ouraByDay.set(o.date, {
      date: o.date,
      sleep: o.sleep_score,
      hrv: o.hrv_avg,
      readiness: o.readiness_score,
    });
  }

  // Bucket water by day.
  const waterByDay = new Map<string, number>();
  for (const w of args.water) {
    const day = localDay(w.logged_at);
    const effective = Number(w.ml) * (w.hydration_factor ?? 1);
    waterByDay.set(day, (waterByDay.get(day) ?? 0) + effective);
  }

  // 7-day window = last 7 calendar days INCLUDING today.
  const last7 = macros.slice(-7);
  // For streaks we look at days BEFORE today, oldest → newest.
  const beforeToday = macros.slice(0, -1);

  // Count under-target days, excluding days with no entries at all.
  const logged7 = last7.filter((d) => d.hasEntries);
  const daysUnderProtein7 = logged7.filter(
    (d) => d.protein_g < args.targets.protein_g * 0.9,
  ).length;
  const daysOverCarbs7 = logged7.filter(
    (d) => d.carbs_g > args.targets.carbs_g,
  ).length;
  const daysUnderFiber7 = logged7.filter(
    (d) => d.fiber_g < args.targets.fiber_g * 0.9,
  ).length;

  // Streak walks backward from yesterday: how many consecutive logged
  // days were under/over the target? Stops at first day that doesn't
  // meet the condition OR has no entries (a logging gap breaks the streak).
  function countStreak(predicate: (d: DailyMacros) => boolean): number | null {
    let n = 0;
    for (let i = beforeToday.length - 1; i >= 0; i--) {
      const d = beforeToday[i];
      if (!d.hasEntries) break;
      if (!predicate(d)) break;
      n++;
    }
    return n > 0 ? n : null;
  }
  const underProteinStreak = countStreak(
    (d) => d.protein_g < args.targets.protein_g * 0.9,
  );
  const overCarbsStreak = countStreak(
    (d) => d.carbs_g > args.targets.carbs_g,
  );
  const proteinHitStreak = countStreak(
    (d) => d.protein_g >= args.targets.protein_g * 0.9,
  );

  // 7-day averages. For macros, only days with entries count toward the
  // average (otherwise an unlogged day pulls everything to zero).
  const avg = (values: Array<number | null>) => mean(values);
  const last7Logged = last7.filter((d) => d.hasEntries);
  const avgCalories7 = last7Logged.length
    ? avg(last7Logged.map((d) => d.calories))
    : null;
  const avgProtein7 = last7Logged.length
    ? avg(last7Logged.map((d) => d.protein_g))
    : null;
  const avgCarbs7 = last7Logged.length
    ? avg(last7Logged.map((d) => d.carbs_g))
    : null;
  const avgFiber7 = last7Logged.length
    ? avg(last7Logged.map((d) => d.fiber_g))
    : null;

  const ouraLast7 = last7.map((d) => ouraByDay.get(d.date) ?? null);
  const avgReadiness7 = avg(ouraLast7.map((o) => o?.readiness ?? null));
  const avgSleep7 = avg(ouraLast7.map((o) => o?.sleep ?? null));
  const avgHrv7 = avg(ouraLast7.map((o) => o?.hrv ?? null));
  const readinessTrend7 = slopePerDay(
    ouraLast7.map((o) => o?.readiness ?? null),
  );

  const waterLast7 = last7.map((d) => waterByDay.get(d.date) ?? null);
  const avgWaterMl7 = avg(waterLast7);

  // Phase streak: walk backward from today through cycle rows.
  const cycleByDay = new Map<string, string | null>();
  for (const c of args.cycle) cycleByDay.set(c.date, c.phase);
  const todayPhase = cycleByDay.get(todayKey) ?? null;
  let phaseStreak: number | null = null;
  if (todayPhase) {
    phaseStreak = 0;
    for (let i = dayList.length - 1; i >= 0; i--) {
      const p = cycleByDay.get(dayList[i]);
      if (p === todayPhase) phaseStreak++;
      else if (p === undefined) continue; // unknown day — don't break the streak
      else break;
    }
    if (phaseStreak === 0) phaseStreak = null;
  }

  return {
    macros,
    daysUnderProtein7,
    daysOverCarbs7,
    daysUnderFiber7,
    underProteinStreak,
    overCarbsStreak,
    proteinHitStreak,
    avgCalories7,
    avgProtein7,
    avgCarbs7,
    avgFiber7,
    avgReadiness7,
    avgSleep7,
    avgHrv7,
    avgWaterMl7,
    readinessTrend7,
    phaseStreak,
  };
}
