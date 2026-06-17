// Travel / jet-lag analysis driven by physical location (IP geolocation),
// not the device timezone — and only after the user confirms.
//
// Across the Europe↔US hop Oura misattributes sleep and the body is genuinely
// dysregulated, so readiness/HRV/sleep read low for days. Once travel is
// confirmed we suppress those false alarms, flag the data, bump hydration, and
// coach the adjustment. Same-timezone hops (e.g. Madrid→Paris) produce a 0h
// offset difference and are intentionally ignored.

import { isValidTimeZone, zoneOffsetMinutes, describeZone } from "./timezone";

// Minimum UTC-offset difference (hours) that counts as jet-lag travel.
export const MIN_TRAVEL_OFFSET_H = 2;

export type GeoLocation = {
  tz: string; // IANA, from x-vercel-ip-timezone
  label: string; // city or, failing that, the zone's city
  country: string | null;
};

// Read physical location from Vercel's IP geolocation headers. Returns null
// when unavailable (local dev, missing headers).
export function locationFromHeaders(
  get: (key: string) => string | null | undefined,
): GeoLocation | null {
  const tz = get("x-vercel-ip-timezone");
  if (!tz || !isValidTimeZone(tz)) return null;
  const cityRaw = get("x-vercel-ip-city");
  const country = get("x-vercel-ip-country") ?? null;
  let label = describeZone(tz);
  if (cityRaw) {
    try {
      label = decodeURIComponent(cityRaw);
    } catch {
      label = cityRaw;
    }
  }
  return { tz, label, country };
}

// Signed offset difference in hours: positive = current is ahead of home
// (travelled east).
export function offsetDiffHours(
  homeTz: string,
  currentTz: string,
  now: Date = new Date(),
): number {
  if (!isValidTimeZone(homeTz) || !isValidTimeZone(currentTz)) return 0;
  return (zoneOffsetMinutes(currentTz, now) - zoneOffsetMinutes(homeTz, now)) / 60;
}

export type TravelInfo = {
  toLabel: string;
  hoursCrossed: number; // absolute, rounded
  direction: "east" | "west";
  daysSince: number;
  windowDays: number; // expected adjustment duration
  active: boolean;
};

// Build the active-travel info from a confirmed traveling profile. Returns
// null if the offset difference is no longer meaningful (returned home) or
// data is missing.
export function travelInfoFrom(
  p: {
    home_tz: string | null;
    current_tz: string | null;
    current_label: string | null;
    travel_started_at: string | null;
  },
  now: Date = new Date(),
): TravelInfo | null {
  if (!p.home_tz || !p.current_tz || !p.travel_started_at) return null;
  const diffH = offsetDiffHours(p.home_tz, p.current_tz, now);
  const hoursCrossed = Math.abs(diffH);
  if (hoursCrossed < MIN_TRAVEL_OFFSET_H) return null;

  const daysSince = Math.floor(
    (now.getTime() - new Date(p.travel_started_at).getTime()) / 86_400_000,
  );
  const windowDays = Math.min(6, Math.max(2, Math.ceil(hoursCrossed / 1.5)));
  return {
    toLabel: p.current_label ?? describeZone(p.current_tz),
    hoursCrossed: Math.round(hoursCrossed),
    direction: diffH > 0 ? "east" : "west",
    daysSince,
    windowDays,
    active: daysSince >= 0 && daysSince <= windowDays,
  };
}

// Extra water (ml) while adjusting — starts ~400 ml, tapers to 0.
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
  if (info.daysSince <= 1) {
    tips.unshift("Hydrate steadily today — travel and dry cabin air add up.");
  }
  return tips.slice(0, 3);
}
