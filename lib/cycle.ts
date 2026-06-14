// Cycle-day → phase mapping. Phase boundaries are personalized from the
// user's average cycle + period length (stored on the profile) so the
// luteal window stays a physiological ~14 days regardless of cycle length.

export const PHASES = [
  "menstrual",
  "follicular",
  "ovulatory",
  "luteal",
] as const;

export type Phase = (typeof PHASES)[number];

export type CycleSettings = {
  cycleLength: number; // average length in days
  periodLength: number; // average bleeding days
};

export const DEFAULT_CYCLE_SETTINGS: CycleSettings = {
  cycleLength: 28,
  periodLength: 5,
};

export function isPhase(v: string): v is Phase {
  return (PHASES as readonly string[]).includes(v);
}

// Map a cycle day to a phase using the personalized boundaries. Ovulation
// is anchored ~14 days before the next period (the luteal phase is the
// stable part of the cycle); the ovulatory window is a 3-day band around it.
export function phaseForCycleDay(
  day: number,
  settings: CycleSettings = DEFAULT_CYCLE_SETTINGS,
): Phase {
  const periodLength = Math.max(1, Math.min(settings.periodLength, 10));
  const cycleLength = Math.max(21, Math.min(settings.cycleLength, 45));
  const ovulation = Math.max(periodLength + 2, cycleLength - 14);

  if (day <= periodLength) return "menstrual";
  if (day < ovulation - 1) return "follicular";
  if (day <= ovulation + 1) return "ovulatory";
  return "luteal";
}

// Given the most-recent recorded cycle day + date, predict today's cycle
// day by counting calendar days forward. Returns null if no prior entry.
export function predictCycleDay(
  mostRecent: { date: string; cycle_day: number | null } | null,
  todayIso = new Date().toISOString().slice(0, 10),
): number | null {
  if (!mostRecent || mostRecent.cycle_day == null) return null;
  const last = Date.parse(`${mostRecent.date}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(last) || !Number.isFinite(today)) return null;
  const daysDiff = Math.round((today - last) / 86_400_000);
  if (daysDiff < 0) return mostRecent.cycle_day;
  return mostRecent.cycle_day + daysDiff;
}

// Cycle day from a known last-period-start date. Day 1 = the start date.
// Wraps to a new cycle once we pass cycleLength + a small grace window so a
// stale last_period_start (missed logging a period) doesn't show "day 47".
export function cycleDayFromPeriodStart(
  lastPeriodStart: string,
  settings: CycleSettings = DEFAULT_CYCLE_SETTINGS,
  todayIso = new Date().toISOString().slice(0, 10),
): number | null {
  const start = Date.parse(`${lastPeriodStart}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(today)) return null;
  const diff = Math.floor((today - start) / 86_400_000);
  if (diff < 0) return null;
  let day = diff + 1;
  // If we've blown well past a full cycle, wrap (predicted next period began).
  const wrap = settings.cycleLength + 3;
  if (day > wrap) day = ((day - 1) % settings.cycleLength) + 1;
  return day;
}

// Find the start date of the MOST RECENT period from a set of days that had
// menstrual flow. A 1-day gap is bridged (Health sometimes drops a day).
// Input: array of YYYY-MM-DD strings (any order, dupes ok). Returns the
// first day of the latest contiguous-ish cluster, or null.
export function latestPeriodStart(flowDays: string[]): string | null {
  const days = Array.from(new Set(flowDays)).sort(); // ascending
  if (days.length === 0) return null;

  const toNum = (d: string) =>
    Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

  // Walk from the newest backwards, extending the cluster while the gap to
  // the previous flow day is ≤2 days.
  let clusterStart = days[days.length - 1];
  for (let i = days.length - 1; i > 0; i--) {
    const gap = toNum(days[i]) - toNum(days[i - 1]);
    if (gap <= 2) {
      clusterStart = days[i - 1];
    } else {
      break;
    }
  }
  return clusterStart;
}

// Derive the phase for each day in a window, given the last period start.
// Used by the trend engine so phase streaks track derived data rather
// than the deprecated manual cycle_days table.
export function derivedPhases(
  lastPeriodStart: string | null,
  settings: CycleSettings,
  dayList: string[],
): Array<{ date: string; phase: Phase | null }> {
  if (!lastPeriodStart) return dayList.map((d) => ({ date: d, phase: null }));
  return dayList.map((d) => {
    const day = cycleDayFromPeriodStart(lastPeriodStart, settings, d);
    return {
      date: d,
      phase: day ? phaseForCycleDay(day, settings) : null,
    };
  });
}
