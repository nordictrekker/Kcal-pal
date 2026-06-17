// Daily insight engine. Pulls from cycle phase, Oura readiness/sleep/HRV,
// recent activity (steps from Apple Health), and how today's macros are
// tracking. Returns a single short, warm line — never preachy, never a
// "coach." Reassurance > prescription.
//
// Rules-based on purpose: deterministic, free (no model call), and easy to
// audit. Add/remove rules as Julie tells us what she actually wants to hear.

import type { Phase } from "./cycle";
import type { Totals } from "./food";
import type { Trends } from "./trends";

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
  hydration: {
    todayMl: number;
    targetMl: number;
    // Fluid logged in roughly the last 90 minutes — distinguishes a fresh
    // glass from a daily total that's still catching up.
    recentMl?: number;
  };
  // Optional forecast signals — set when the user tracks cycles and we
  // have enough history. The fertile-window and pre-period rules read this.
  forecast?: {
    daysUntilPeriod: number;
    inFertileWindow: boolean;
    overdue: boolean;
  } | null;
  todayMacros: Totals;
  targets: Totals;
  trends: Trends | null;
  // Set while the user is adjusting to a new timezone (travel/jet lag).
  travel?: {
    active: boolean;
    direction: "east" | "west";
    hoursCrossed: number;
    daysSince: number;
    toLabel: string;
  } | null;
  // Standard drinks today / yesterday, when any are logged.
  alcohol?: { drinksToday: number; drinksYesterday: number } | null;
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

// Trend predicates (only fire when we have enough history).
const lutealCarbPattern = (c: InsightContext) =>
  c.phase === "luteal" &&
  c.trends !== null &&
  (c.trends.phaseStreak ?? 0) >= 2 &&
  (c.trends.overCarbsStreak ?? 0) >= 2;

const proteinDroughtPattern = (c: InsightContext) =>
  c.trends !== null && (c.trends.underProteinStreak ?? 0) >= 3;

const readinessSlide = (c: InsightContext) =>
  c.trends !== null &&
  c.trends.readinessTrend7 !== null &&
  c.trends.readinessTrend7 <= -1.5 && // losing ≥1.5 points/day = ~10 over a week
  (c.trends.avgReadiness7 ?? 100) < 80;

const lowFiberPattern = (c: InsightContext) =>
  c.trends !== null && c.trends.daysUnderFiber7 >= 5;

// Under-fueling: a week of intake well below target while still moving a
// lot. For an active woman this is the early signal that matters most
// (low energy availability → cycle disruption, poor recovery), so it
// reassures-with-a-nudge rather than nags about "more food."
const underFuelingPattern = (c: InsightContext) =>
  c.trends !== null &&
  c.trends.avgCalories7 !== null &&
  c.targets.calories > 0 &&
  c.trends.avgCalories7 < c.targets.calories * 0.8 &&
  (c.activity.stepsAvg7d ?? 0) >= 8000;

// Hard day yesterday on short sleep → today is a recovery day. Reads
// yesterday's steps (not the 7-day average) so it fires on the spike.
const postExertionEasyDay = (c: InsightContext) =>
  lowSleep(c) &&
  c.activity.stepsYesterday !== null &&
  c.activity.stepsYesterday >= 11000;

// Today's HRV sitting well below the personal 7-day baseline while
// activity stays high — classic overreaching tell.
const hrvDipOverreach = (c: InsightContext) =>
  c.oura.hrv !== null &&
  c.trends !== null &&
  c.trends.avgHrv7 !== null &&
  c.oura.hrv < c.trends.avgHrv7 * 0.85 &&
  highActivity(c);

// Sleep score has averaged low across the week (debt accumulating).
const sleepDebtWeek = (c: InsightContext) =>
  c.trends !== null &&
  c.trends.avgSleep7 !== null &&
  c.trends.avgSleep7 < 72;

// Protein hit for several days running — worth naming, the engine
// otherwise only ever speaks up about shortfalls.
const proteinConsistencyWin = (c: InsightContext) =>
  c.trends !== null && (c.trends.proteinHitStreak ?? 0) >= 3;

const isWeekend = (c: InsightContext) => {
  const day = c.now.getDay();
  return day === 0 || day === 6;
};

// Hydration predicates. Day is "young" until ~3pm; only start nudging
// once it's late enough that being behind actually means behind.
// A meaningful glass in the last ~90 min (≥ ~10 oz). When true we hold the
// "behind" nudge — she just drank; don't nag while it's still settling.
const justDrank = (c: InsightContext) => (c.hydration.recentMl ?? 0) >= 300;
const hydrationBehind = (c: InsightContext) => {
  if (c.hydration.targetMl <= 0) return false;
  if (justDrank(c)) return false;
  const dayProgress = Math.min(1, c.now.getHours() / 18);
  const expected = c.hydration.targetMl * dayProgress;
  return c.hydration.todayMl < expected * 0.6 && c.now.getHours() >= 13;
};
// Was behind, then drank: acknowledge it instead of going silent.
const hydrationCaughtUp = (c: InsightContext) => {
  if (c.hydration.targetMl <= 0 || !justDrank(c)) return false;
  const dayProgress = Math.min(1, c.now.getHours() / 18);
  const expected = c.hydration.targetMl * dayProgress;
  return c.hydration.todayMl < expected * 0.85 && c.now.getHours() >= 13;
};
const hydrationWeekLow = (c: InsightContext) =>
  c.trends !== null &&
  c.trends.avgWaterMl7 !== null &&
  c.hydration.targetMl > 0 &&
  c.trends.avgWaterMl7 < c.hydration.targetMl * 0.7;

const ozFromMl = (ml: number) => Math.round(ml / 29.5735);

const RULES: Rule[] = [
  // ─── Forecast-driven rules (top priority — temporally specific) ───────────

  {
    id: "period_imminent",
    priority: 100,
    when: (c) =>
      c.forecast != null &&
      !c.forecast.overdue &&
      c.forecast.daysUntilPeriod >= 0 &&
      c.forecast.daysUntilPeriod <= 2,
    build: (c) => {
      const d = c.forecast!.daysUntilPeriod;
      const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
      return {
        id: "period_imminent",
        tone: "reassure",
        text: `Period predicted ${when}. Expect appetite to spike — iron-rich foods (red meat, lentils, dark greens) and warmth help the next few days.`,
      };
    },
  },
  {
    id: "period_overdue",
    priority: 98,
    when: (c) => c.forecast != null && c.forecast.overdue,
    build: () => ({
      id: "period_overdue",
      tone: "reassure",
      text: "Period running a few days late — totally normal for cycles to flex with stress or travel. If it stays off past a week, worth checking in.",
    }),
  },
  {
    id: "fertile_window",
    priority: 87,
    when: (c) =>
      c.forecast != null &&
      c.forecast.inFertileWindow &&
      // Don't crowd out a more urgent message when readiness is low.
      !lowReadiness(c),
    build: () => ({
      id: "fertile_window",
      tone: "encourage",
      text: "Fertile window — energy and libido often peak here. Estrogen is doing a lot of the lifting; protein and complex carbs keep up.",
    }),
  },

  // ─── Trend-aware rules (patterns beat single-day signals) ────────────────

  {
    id: "luteal_carb_pattern",
    priority: 99,
    when: lutealCarbPattern,
    build: (c) => ({
      id: "luteal_carb_pattern",
      tone: "reassure",
      text: `Day ${c.trends!.phaseStreak} of luteal and the third over-carbs day in a row — this isn't slipping, it's progesterone steering the ship. Lean in.`,
    }),
  },
  {
    id: "protein_drought",
    priority: 97,
    when: proteinDroughtPattern,
    build: (c) => ({
      id: "protein_drought",
      tone: "suggest",
      text: `Protein has trailed your target ${c.trends!.underProteinStreak} days running. Front-load it today — eggs, Greek yogurt, or a scoop of whey settles the deficit fast.`,
    }),
  },
  {
    id: "readiness_slide",
    priority: 96,
    when: readinessSlide,
    build: () => ({
      id: "readiness_slide",
      tone: "rest",
      text: "Recovery has been sliding all week. Today's a good day to do less — prioritize sleep tonight and skip the hard workout if it's on the schedule.",
    }),
  },
  {
    id: "under_fueling",
    priority: 93,
    when: underFuelingPattern,
    build: (c) => ({
      id: "under_fueling",
      tone: "suggest",
      text: `Intake's averaged ~${Math.round(
        c.trends!.avgCalories7!,
      )} cal against a busy movement week. Under-fueling shows up as flat recovery and cranky cycles long before the scale moves — a little more, especially protein and carbs, protects both.`,
    }),
  },
  {
    id: "fiber_pattern",
    priority: 92,
    when: lowFiberPattern,
    build: () => ({
      id: "fiber_pattern",
      tone: "suggest",
      text: "Fiber's been quiet most of the week. A handful of berries, half an avocado, or a side of greens at lunch closes the gap easily.",
    }),
  },

  // ─── Travel (high — timely and explains "off" numbers) ──────────────────

  {
    id: "travel_adjust",
    priority: 96,
    when: (c) => !!c.travel?.active,
    build: (c) => {
      const t = c.travel!;
      const dir = t.direction === "east" ? "eastward" : "westward";
      return {
        id: "travel_adjust",
        tone: "reassure",
        text: `You're in ${t.toLabel} now — ${t.hoursCrossed}h ${dir}. Sleep, HRV, and appetite take a few days to catch up, so I'll ease off the recovery alarms and keep your water high while you adjust.`,
      };
    },
  },

  // ─── Alcohol recovery (explains a funky morning) ────────────────────────

  {
    id: "alcohol_recovery",
    priority: 89,
    when: (c) => (c.alcohol?.drinksYesterday ?? 0) >= 2 && c.now.getHours() < 16,
    build: () => ({
      id: "alcohol_recovery",
      tone: "reassure",
      text: "Last night's drinks can dent HRV and deep sleep — if this morning reads low, that's likely why. Extra water and protein today will help you bounce back.",
    }),
  },
  {
    id: "alcohol_hydrate_today",
    priority: 80,
    when: (c) =>
      (c.alcohol?.drinksToday ?? 0) >= 2 &&
      (c.alcohol?.drinksYesterday ?? 0) < 2 &&
      c.now.getHours() >= 17,
    build: () => ({
      id: "alcohol_hydrate_today",
      tone: "suggest",
      text: "A few drinks in — a glass of water between rounds and one before bed will soften tomorrow's recovery hit.",
    }),
  },

  // ─── Hydration (mid-high — interrupts only when noticeably behind) ──────

  {
    id: "hydration_today_behind",
    priority: 91,
    when: hydrationBehind,
    build: (c) => ({
      id: "hydration_today_behind",
      tone: "suggest",
      text: `Water's running behind today — only ${ozFromMl(c.hydration.todayMl)} oz so far. A tall glass now will lift your afternoon more than a snack will.`,
    }),
  },
  {
    id: "hydration_caught_up",
    priority: 90,
    when: hydrationCaughtUp,
    build: (c) => ({
      id: "hydration_caught_up",
      tone: "encourage",
      text: `Nice — that one counts. You're up to ${ozFromMl(c.hydration.todayMl)} oz. Keep a glass within reach and you'll close the gap easily.`,
    }),
  },
  {
    id: "hydration_week_low",
    priority: 78,
    when: (c) => hydrationWeekLow(c) && !hydrationBehind(c),
    build: () => ({
      id: "hydration_week_low",
      tone: "suggest",
      text: "Hydration's been light all week. Cravings, headaches, and low afternoon energy often track here first — keep a glass on the desk.",
    }),
  },

  // ─── Cycle + behavior interactions ───────────────────────────────────────

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
    id: "post_exertion_easy_day",
    priority: 86,
    when: postExertionEasyDay,
    build: () => ({
      id: "post_exertion_easy_day",
      tone: "rest",
      text: "Big movement yesterday on short sleep — your body's asking for an easy day. Keep food steady (don't under-eat to 'match' the rest) and let recovery do its thing.",
    }),
  },
  {
    id: "hrv_dip_overreach",
    priority: 84,
    when: hrvDipOverreach,
    build: () => ({
      id: "hrv_dip_overreach",
      tone: "rest",
      text: "HRV dipped below your usual while you've been training hard — an early overreaching signal. Pull intensity back a notch and make sleep tonight non-negotiable.",
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
    id: "sleep_debt_week",
    priority: 73,
    when: (c) => sleepDebtWeek(c) && !lowReadiness(c),
    build: () => ({
      id: "sleep_debt_week",
      tone: "suggest",
      text: "Sleep scores have run low all week — debt adds up quietly. Protect tonight's wind-down; even 30 extra minutes lifts tomorrow's energy and steadies appetite.",
    }),
  },
  {
    id: "protein_consistency_win",
    priority: 50,
    when: proteinConsistencyWin,
    build: (c) => ({
      id: "protein_consistency_win",
      tone: "encourage",
      text: `${c.trends!.proteinHitStreak} days straight hitting your protein — that's the unglamorous habit that actually moves recovery and body composition. Quietly excellent.`,
    }),
  },
  {
    id: "weekend_permission",
    priority: 38,
    when: (c) => isWeekend(c) && (lateInDay(c) || overCarbsTarget(c)),
    build: () => ({
      id: "weekend_permission",
      tone: "reassure",
      text: "It's the weekend — meals out and a looser rhythm are part of a sustainable life, not a setback. Enjoy it; consistency is measured in weeks, not Saturdays.",
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

// Recovery/training alarms that are unreliable during jet lag — Oura
// misreads sleep across zones and the body is genuinely dysregulated, so
// these would be false positives. Held while the travel window is active.
const SUPPRESS_DURING_TRAVEL = new Set([
  "low_readiness_recovery",
  "hrv_dip_overreach",
  "sleep_debt_week",
  "readiness_slide",
  "post_exertion_easy_day",
]);

export function pickInsight(ctx: InsightContext): Insight | null {
  const traveling = !!ctx.travel?.active;
  let best: { rule: Rule; insight: Insight } | null = null;
  for (const rule of RULES) {
    if (traveling && SUPPRESS_DURING_TRAVEL.has(rule.id)) continue;
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
