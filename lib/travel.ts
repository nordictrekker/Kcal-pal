// Travel / jet-lag analysis. Derives how many time zones were crossed (and
// which direction) from a stored timezone change, defines an adjustment
// window, and produces direction-aware guidance.
//
// Why it matters here: across the Europe↔US hop, Oura attributes sleep to
// days by the ring's zone and the body is genuinely dysregulated, so
// readiness/HRV/sleep read low for several days. During that window we
// suppress false "low recovery" alarms, flag the data, bump hydration, and
// coach the adjustment instead.

import { isValidTimeZone, zoneOffsetMinutes, describeZone } from "./timezone";

export type TravelInfo = {
  fromTz: string;
  toTz: string;
  fromLabel: string;
  toLabel: string;
  hoursCrossed: number; // absolute, rounded
  direction: "east" | "west";
  daysSince: number; // whole days since the zone changed
  windowDays: number; // expected adjustment duration
  active: boolean; // within the adjustment window
};

export function analyzeTravel(
  p: {
    previous_timezone: string | null;
    timezone: string | null;
    timezone_updated_at: string | null;
  },
  now: Date = new Date(),
): TravelInfo | null {
  const { previous_timezone: from, timezone: to, timezone_updated_at: at } = p;
  if (!from || !to || !at || from === to) return null;
  if (!isValidTimeZone(from) || !isValidTimeZone(to)) return null;

  // Positive diff = clock moved forward = travelled east.
  const diffH = (zoneOffsetMinutes(to, now) - zoneOffsetMinutes(from, now)) / 60;
  const hoursCrossed = Math.abs(diffH);
  if (hoursCrossed < 2) return null; // < 2h isn't meaningful jet lag

  const daysSince = Math.floor(
    (now.getTime() - new Date(at).getTime()) / 86_400_000,
  );
  // Roughly a day of adjustment per ~1.5 zones crossed, clamped to 2–6 days.
  const windowDays = Math.min(6, Math.max(2, Math.ceil(hoursCrossed / 1.5)));

  return {
    fromTz: from,
    toTz: to,
    fromLabel: describeZone(from),
    toLabel: describeZone(to),
    hoursCrossed: Math.round(hoursCrossed),
    direction: diffH > 0 ? "east" : "west",
    daysSince,
    windowDays,
    active: daysSince >= 0 && daysSince <= windowDays,
  };
}

// Extra water (ml) added to the goal while adjusting — flights and disrupted
// routines dehydrate. Starts ~400 ml and tapers to 0 across the window.
export function travelHydrationOffsetMl(info: TravelInfo | null): number {
  if (!info || !info.active) return 0;
  const remaining = Math.max(0, info.windowDays - info.daysSince) / info.windowDays;
  return Math.round((400 * remaining) / 50) * 50;
}

// "Likely adjusted by Tuesday" — when the window closes.
export function adjustmentDateLabel(info: TravelInfo): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, info.windowDays - info.daysSince));
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

// 2–3 concrete, direction-aware tips. East (e.g. US→Europe) needs a phase
// advance (earlier); west (Europe→US) a phase delay (later).
export function jetLagTips(info: TravelInfo): string[] {
  const tips: string[] = [];
  if (info.direction === "east") {
    tips.push("Get bright light in the morning; dim screens after sunset.");
    tips.push("Aim for an earlier dinner and bedtime than feels natural.");
    tips.push("Stop caffeine by early afternoon so you can fall asleep earlier.");
  } else {
    tips.push("Get outdoor light in the late afternoon/early evening.");
    tips.push("Push your bedtime a little later rather than fighting to sleep early.");
    tips.push("Morning caffeine is fine; avoid long daytime naps.");
  }
  // Day 0–1 leads with hydration; later days lean on light/meal timing.
  if (info.daysSince <= 1) {
    tips.unshift("Hydrate steadily today — travel and dry cabin air add up.");
  }
  return tips.slice(0, 3);
}
