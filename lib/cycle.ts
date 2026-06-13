// Cycle-day → phase mapping (spec defaults). Boundaries are hardcoded
// for v1; the spec calls them "adjustable" which we can wire to profile
// settings later.

export const PHASES = [
  "menstrual",
  "follicular",
  "ovulatory",
  "luteal",
] as const;

export type Phase = (typeof PHASES)[number];

export function isPhase(v: string): v is Phase {
  return (PHASES as readonly string[]).includes(v);
}

export function phaseForCycleDay(day: number): Phase {
  if (day <= 5) return "menstrual";
  if (day <= 13) return "follicular";
  if (day <= 16) return "ovulatory";
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
