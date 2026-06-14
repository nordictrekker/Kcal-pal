// Daily insight engine. Pulls from cycle phase, Oura readiness/sleep/HRV,
// recent activity (steps from Apple Health), and how today's macros are
// tracking. Returns a single short, warm line — never preachy, never a
// "coach." Reassurance > prescription.
//
// Rules-based on purpose: deterministic, free (no model call), and easy to
// audit. Add/remove rules as Julie tells us what she actually wants to hear.

import type { Phase } from "./cycle";
import type { Totals } from "./food";

export type InsightContext = {
  phase: Phase | null;
  cycleDay: number | null;
  oura: {
    readiness: number | null;
    sleep: number | null;
    hrv: number | null;
  };
  activity: {
    stepsAvg7d: number | null;
    stepsYesterday: number | null;
  };
  todayMacros: Totals;
  targets: Totals;
  now: Date;
};

export type Insight = {
  id: string;
  text: string;
  tone: "reassure" | "encourage" | "suggest" | "rest";
};

type Rule = {
  id: string;
  priority: number; // higher wins
  when: (c: InsightContext) => boolean;
  build: (c: InsightContext) => Insight;
};

const k = (n: number) => Math.round(n / 1000);

// Helpers
const earlyInDay = (c: InsightContext) => c.now.getHours() < 14;
const lateInDay = (c: InsightContext) => c.now.getHours() >= 17;
const proteinShortfall = (c: InsightContext) =>
  (c.todayMacros.protein_g ?? 0) < c.targets.protein_g * 0.4 && earlyInDay(c);
const overCarbsTarget = (c: InsightContext) =>
  (c.todayMacros.carbs_g ?? 0) > c.targets.carbs_g;
const highActivity = (c: InsightContext) =>
  (c.activity.stepsAvg7d ?? 0) >= 9000;
const lowActivity = (c: InsightContext) =>
  (c.activity.stepsAvg7d ?? 0) > 0 && (c.activity.stepsAvg7d ?? 0) < 5000;
const highReadiness = (c: InsightContext) =>
  (c.oura.readiness ?? 0) >= 85;
const lowReadiness = (c: InsightContext) =>
  c.oura.readiness !== null && c.oura.readiness < 70;
const lowSleep = (c: InsightContext) =>
  c.oura.sleep !== null && c.oura.sleep < 70;

const RULES: Rule[] = [
  // ─── Cycle + behavior interactions (highest priority) ────────────────────

  {
    id: "luteal_carb_reassurance",
    priority: 95,
    when: (c) => c.phase === "luteal" && (overCarbsTarget(c) || lateInDay(c)),
    build: () => ({
      id: "luteal_carb_reassurance",
      tone: "reassure",
      text: "Luteal phase — progesterone bumps your appetite and carb cravings. Extra carbs this week aren't slipping, they're physiology. Honor it.",
    }),
  },
  {
    id: "luteal_general",
    priority: 70,
    when: (c) => c.phase === "luteal",
    build: () => ({
      id: "luteal_general",
      tone: "reassure",
      text: "Luteal phase — your body burns ~5% more calories now. Don't worry about the extra carbs, lean into magnesium-rich foods (dark chocolate, greens, nuts).",
    }),
  },

  {
    id: "follicular_strong",
    priority: 90,
    when: (c) => c.phase === "follicular" && highReadiness(c),
    build: () => ({
      id: "follicular_strong",
      tone: "encourage",
      text: "Follicular phase + strong recovery — this is your high-output window. Good day for harder training and complex carbs.",
    }),
  },
  {
    id: "follicular_general",
    priority: 65,
    when: (c) => c.phase === "follicular",
    build: () => ({
      id: "follicular_general",
      tone: "encourage",
      text: "Follicular phase — insulin sensitivity is highest now. Carbs are your friend; experiment with harder workouts.",
    }),
  },

  {
    id: "ovulatory_peak",
    priority: 85,
    when: (c) => c.phase === "ovulatory",
    build: () => ({
      id: "ovulatory_peak",
      tone: "encourage",
      text: "Ovulatory peak — energy and strength typically crest here. Fuel the high; protein supports the LH surge.",
    }),
  },

  {
    id: "menstrual_rest",
    priority: 80,
    when: (c) => c.phase === "menstrual",
    build: () => ({
      id: "menstrual_rest",
      tone: "rest",
      text: "Menstrual phase — your body is working hard internally. Iron (red meat, lentils, dark greens) and warmth help. Rest is productive.",
    }),
  },

  // ─── Recovery & activity ────────────────────────────────────────────────

  {
    id: "low_readiness_recovery",
    priority: 88,
    when: (c) => lowReadiness(c) && earlyInDay(c),
    build: () => ({
      id: "low_readiness_recovery",
      tone: "suggest",
      text: "Recovery's running a little low today. Lean into protein and hydration; an earlier wind-down tonight will lift tomorrow's numbers.",
    }),
  },

  {
    id: "low_sleep_glucose",
    priority: 82,
    when: (c) => lowSleep(c) && !lowReadiness(c),
    build: () => ({
      id: "low_sleep_glucose",
      tone: "reassure",
      text: "Short sleep last night — your brain will crave quick energy today. Sugary cravings are biology, not weakness.",
    }),
  },

  {
    id: "active_protein_nudge",
    priority: 75,
    when: (c) => highActivity(c) && proteinShortfall(c),
    build: (c) => ({
      id: "active_protein_nudge",
      tone: "suggest",
      text: `You've averaged ~${k(c.activity.stepsAvg7d!)}k steps a day this week. Aim for some extra protein today — your muscles are still rebuilding.`,
    }),
  },
  {
    id: "active_general",
    priority: 60,
    when: (c) => highActivity(c) && !proteinShortfall(c),
    build: (c) => ({
      id: "active_general",
      tone: "encourage",
      text: `Strong movement week — ~${k(c.activity.stepsAvg7d!)}k steps a day on average. Keep protein steady, don't fear the extra calories.`,
    }),
  },
  {
    id: "low_activity_gentle",
    priority: 40,
    when: (c) => lowActivity(c) && c.phase !== "menstrual",
    build: () => ({
      id: "low_activity_gentle",
      tone: "encourage",
      text: "Quieter movement week — even a 15-min walk helps mood and digestion. No pressure.",
    }),
  },

  // ─── Default fallback (lowest priority) ─────────────────────────────────

  {
    id: "strong_default",
    priority: 30,
    when: (c) => highReadiness(c),
    build: () => ({
      id: "strong_default",
      tone: "encourage",
      text: "Numbers look strong today. Whatever you eat, eat it slowly.",
    }),
  },
  {
    id: "neutral_default",
    priority: 10,
    when: () => true,
    build: () => ({
      id: "neutral_default",
      tone: "reassure",
      text: "One good meal at a time. Aim for protein at every meal, water between.",
    }),
  },
];

export function pickInsight(ctx: InsightContext): Insight | null {
  let best: { rule: Rule; insight: Insight } | null = null;
  for (const rule of RULES) {
    if (!rule.when(ctx)) continue;
    if (best === null || rule.priority > best.rule.priority) {
      best = { rule, insight: rule.build(ctx) };
    }
  }
  return best?.insight ?? null;
}

// Average daily steps over the last 7 days from a list of raw datapoints.
// Sums multiple entries per day (Apple Health stores per-source slices),
// then averages over the number of days that had any data.
export function avgDailySteps(
  rows: Array<{ value: number; recorded_at: string }>,
): { avg: number | null; yesterday: number | null } {
  if (rows.length === 0) return { avg: null, yesterday: null };
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const day = r.recorded_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Number(r.value));
  }
  const days = Array.from(byDay.values());
  const avg = days.reduce((a, b) => a + b, 0) / days.length;
  const ydayKey = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const yesterday = byDay.get(ydayKey) ?? null;
  return { avg, yesterday };
}
