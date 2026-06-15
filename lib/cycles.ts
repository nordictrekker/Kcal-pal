// Higher-level cycle intelligence — period history, forecasting, and
// cross-cycle aggregates. Pure functions; the callers feed in raw rows.
//
// Period START detection works off Apple Health menstrual-flow samples
// (already ingested into apple_health_data). We cluster contiguous-ish
// flow days (≤2 day gaps bridged) into "periods" and report each
// cluster's first day. Identical logic to lib/cycle.ts#latestPeriodStart
// but returning ALL clusters in time order.

import {
  cycleDayFromPeriodStart,
  phaseForCycleDay,
  type CycleSettings,
  type Phase,
} from "./cycle";
import { mean } from "./stats";

export type FlowSample = {
  recorded_at: string;
  value: number; // 1..4 = flow; 5 / 0 = none
};

// All period START dates extracted from a flow-sample series, oldest → newest.
export function allPeriodStarts(samples: FlowSample[]): string[] {
  const flowDays = Array.from(
    new Set(
      samples
        .filter((s) => s.value >= 1 && s.value <= 4)
        .map((s) => s.recorded_at.slice(0, 10)),
    ),
  ).sort();
  if (flowDays.length === 0) return [];

  const toNum = (d: string) =>
    Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

  const starts: string[] = [];
  let clusterStart = flowDays[0];
  for (let i = 1; i < flowDays.length; i++) {
    const gap = toNum(flowDays[i]) - toNum(flowDays[i - 1]);
    if (gap > 2) {
      // New cluster.
      starts.push(clusterStart);
      clusterStart = flowDays[i];
    }
  }
  starts.push(clusterStart);
  return starts;
}

export type CycleForecast = {
  // Most-likely next period start.
  nextPeriod: string;
  // ±range as best/worst case (cycle length variance).
  nextPeriodRange: { earliest: string; latest: string };
  // Days until predicted period (negative if overdue).
  daysUntil: number;
  // Fertile window — ovulation ±2 days, where ovulation = nextPeriod - 14.
  fertileWindow: { start: string; end: string; ovulation: string };
  // Are we currently inside the predicted fertile window?
  inFertileWindow: boolean;
  // Is the predicted period more than 3 days overdue?
  overdue: boolean;
};

function addDays(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((ta - tb) / 86_400_000);
}

// Build a forecast given the last period start. variance defaults to ±3
// days but should ideally come from observed cycle-length stdev (see
// cycleAggregates below); we keep this signature simple and the caller
// can override.
export function forecastCycle(
  lastPeriodStart: string,
  settings: CycleSettings,
  todayIso = new Date().toISOString().slice(0, 10),
  variance = 3,
): CycleForecast {
  const nextPeriod = addDays(lastPeriodStart, settings.cycleLength);
  const earliest = addDays(nextPeriod, -variance);
  const latest = addDays(nextPeriod, variance);
  const ovulation = addDays(nextPeriod, -14);
  const fertileStart = addDays(ovulation, -2);
  const fertileEnd = addDays(ovulation, 2);
  const daysUntil = diffDays(nextPeriod, todayIso);
  const inFertileWindow = todayIso >= fertileStart && todayIso <= fertileEnd;
  const overdue = daysUntil < -3;
  return {
    nextPeriod,
    nextPeriodRange: { earliest, latest },
    daysUntil,
    fertileWindow: {
      start: fertileStart,
      end: fertileEnd,
      ovulation,
    },
    inFertileWindow,
    overdue,
  };
}

// Per-cycle aggregates computed from raw daily rows. Caller passes a
// flat array of days + the metric for each — we slice per cycle interval.
export type CycleAggregate = {
  index: number; // 0 = oldest in the input window
  start: string;
  end: string | null; // null = current (open) cycle
  length: number | null;
  // Averages across the cycle interval (nulls excluded).
  avgCalories: number | null;
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFiber: number | null;
  avgReadiness: number | null;
  avgSleep: number | null;
  avgHrv: number | null;
  avgWaterMl: number | null;
  weightDeltaLbs: number | null;
  // Phase coverage: how many days fell in each phase.
  phaseDays: Record<Phase, number>;
};

type DailyMacro = {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};
type DailyOuraIn = {
  date: string;
  sleep_score: number | null;
  hrv_avg: number | null;
  readiness_score: number | null;
};
type DailyWaterIn = { date: string; ml: number };
type DailyWeightIn = { date: string; lbs: number };

export function cycleAggregates(args: {
  periodStarts: string[]; // oldest → newest
  settings: CycleSettings;
  todayIso?: string;
  foodByDay: DailyMacro[];
  ouraByDay: DailyOuraIn[];
  waterByDay: DailyWaterIn[];
  weightByDay: DailyWeightIn[];
}): CycleAggregate[] {
  const today = args.todayIso ?? new Date().toISOString().slice(0, 10);
  const starts = [...args.periodStarts].sort();
  if (starts.length === 0) return [];

  const fMap = new Map(args.foodByDay.map((d) => [d.date, d]));
  const oMap = new Map(args.ouraByDay.map((d) => [d.date, d]));
  const wMap = new Map(args.waterByDay.map((d) => [d.date, d.ml]));
  const bMap = new Map(args.weightByDay.map((d) => [d.date, d.lbs]));

  const out: CycleAggregate[] = [];

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const nextStart = starts[i + 1] ?? null;
    const end = nextStart ? addDays(nextStart, -1) : null;
    const lastDay = end ?? today;
    const length = nextStart ? diffDays(nextStart, start) : null;

    const days: string[] = [];
    for (let d = start; d <= lastDay; d = addDays(d, 1)) days.push(d);

    const cal: number[] = [];
    const pro: number[] = [];
    const carb: number[] = [];
    const fib: number[] = [];
    const rd: number[] = [];
    const sl: number[] = [];
    const hr: number[] = [];
    const wa: number[] = [];
    const phaseDays: Record<Phase, number> = {
      menstrual: 0,
      follicular: 0,
      ovulatory: 0,
      luteal: 0,
    };

    for (const d of days) {
      const f = fMap.get(d);
      if (f) {
        cal.push(f.calories);
        pro.push(f.protein_g);
        carb.push(f.carbs_g);
        fib.push(f.fiber_g);
      }
      const o = oMap.get(d);
      if (o?.readiness_score != null) rd.push(o.readiness_score);
      if (o?.sleep_score != null) sl.push(o.sleep_score);
      if (o?.hrv_avg != null) hr.push(o.hrv_avg);
      const w = wMap.get(d);
      if (w != null) wa.push(w);

      const cd = cycleDayFromPeriodStart(start, args.settings, d);
      if (cd) phaseDays[phaseForCycleDay(cd, args.settings)]++;
    }

    // Weight delta: compare last reading in this cycle vs first.
    let weightDelta: number | null = null;
    const firstW = days.map((d) => bMap.get(d)).find((v) => v != null);
    const lastW = [...days]
      .reverse()
      .map((d) => bMap.get(d))
      .find((v) => v != null);
    if (firstW != null && lastW != null) {
      weightDelta = Number((lastW - firstW).toFixed(1));
    }

    out.push({
      index: i,
      start,
      end,
      length,
      avgCalories: cal.length ? mean(cal) : null,
      avgProtein: pro.length ? mean(pro) : null,
      avgCarbs: carb.length ? mean(carb) : null,
      avgFiber: fib.length ? mean(fib) : null,
      avgReadiness: rd.length ? mean(rd) : null,
      avgSleep: sl.length ? mean(sl) : null,
      avgHrv: hr.length ? mean(hr) : null,
      avgWaterMl: wa.length ? mean(wa) : null,
      weightDeltaLbs: weightDelta,
      phaseDays,
    });
  }

  return out;
}

// Helper: standard deviation of observed cycle lengths (for forecast variance).
export function cycleLengthVariance(periodStarts: string[]): number | null {
  if (periodStarts.length < 3) return null;
  const sorted = [...periodStarts].sort();
  const lengths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    lengths.push(diffDays(sorted[i], sorted[i - 1]));
  }
  if (lengths.length < 2) return null;
  const m = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((a, b) => a + (b - m) ** 2, 0) / lengths.length;
  return Math.sqrt(variance);
}
