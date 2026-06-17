// Travel / jet-lag analysis driven by physical location (IP geolocation),
// not the device timezone — and only after the user confirms (or logs a trip
// manually in Settings).
//
// Two effects, which can co-occur:
//  - Jet lag: a meaningful UTC-offset change. Direction-aware circadian work.
//  - Travel fatigue: a long journey with little/no offset change (e.g.
//    Germany→South Africa). Cabin dehydration, immobility, disrupted sleep
//    depress HRV/readiness for a day or two — no clock to fix, just recover.
//
// Same-timezone short hops (Madrid→Paris) produce neither and are ignored.

import { isValidTimeZone, zoneOffsetMinutes, describeZone } from "./timezone";

// Minimum UTC-offset difference (hours) that counts as jet lag.
export const MIN_TRAVEL_OFFSET_H = 2;
// Minimum distance (km) that counts as a fatiguing long journey.
export const MIN_TRAVEL_DISTANCE_KM = 1500;

export type GeoLocation = {
  tz: string;
  label: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

export function locationFromHeaders(
  get: (key: string) => string | null | undefined,
): GeoLocation | null {
  const tz = get("x-vercel-ip-timezone");
  if (!tz || !isValidTimeZone(tz)) return null;
  const cityRaw = get("x-vercel-ip-city");
  const country = get("x-vercel-ip-country") ?? null;
  const lat = Number(get("x-vercel-ip-latitude"));
  const lng = Number(get("x-vercel-ip-longitude"));
  let label = describeZone(tz);
  if (cityRaw) {
    try {
      label = decodeURIComponent(cityRaw);
    } catch {
      label = cityRaw;
    }
  }
  return {
    tz,
    label,
    country,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

export function offsetDiffHours(
  homeTz: string,
  currentTz: string,
  now: Date = new Date(),
): number {
  if (!isValidTimeZone(homeTz) || !isValidTimeZone(currentTz)) return 0;
  return (zoneOffsetMinutes(currentTz, now) - zoneOffsetMinutes(homeTz, now)) / 60;
}

// Great-circle distance in km.
export function haversineKm(
  a: { lat: number | null; lng: number | null },
  b: { lat: number | null; lng: number | null },
): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))));
}

export type TravelKind = "jetlag" | "longhaul" | "manual";

export type TravelInfo = {
  kind: TravelKind;
  toLabel: string;
  hoursCrossed: number; // 0 for pure long-haul / manual
  direction: "east" | "west" | null;
  distanceKm: number;
  daysSince: number;
  windowDays: number;
  active: boolean;
};

type TravelProfile = {
  home_tz: string | null;
  current_tz: string | null;
  current_label: string | null;
  home_lat: number | null;
  home_lng: number | null;
  current_lat: number | null;
  current_lng: number | null;
  travel_started_at: string | null;
  travel_manual?: boolean | null;
};

// Does the gap between home and current warrant travel handling? Returns the
// kind, or null. Used both for live detection and for building active info.
export function classifyTravel(
  p: TravelProfile,
  now: Date = new Date(),
): { kind: TravelKind; diffH: number; distanceKm: number } | null {
  if (p.travel_manual) return { kind: "manual", diffH: 0, distanceKm: 0 };
  if (!p.home_tz || !p.current_tz) return null;
  const diffH = offsetDiffHours(p.home_tz, p.current_tz, now);
  const distanceKm = haversineKm(
    { lat: p.home_lat, lng: p.home_lng },
    { lat: p.current_lat, lng: p.current_lng },
  );
  if (Math.abs(diffH) >= MIN_TRAVEL_OFFSET_H) {
    return { kind: "jetlag", diffH, distanceKm };
  }
  if (distanceKm >= MIN_TRAVEL_DISTANCE_KM) {
    return { kind: "longhaul", diffH, distanceKm };
  }
  return null;
}

export function travelInfoFrom(
  p: TravelProfile,
  now: Date = new Date(),
): TravelInfo | null {
  if (!p.travel_started_at) return null;
  const c = classifyTravel(p, now);
  if (!c) return null;

  const daysSince = Math.floor(
    (now.getTime() - new Date(p.travel_started_at).getTime()) / 86_400_000,
  );
  const hoursCrossed = Math.round(Math.abs(c.diffH));

  let windowDays: number;
  if (c.kind === "jetlag") {
    windowDays = Math.min(6, Math.max(2, Math.ceil(hoursCrossed / 1.5)));
  } else if (c.kind === "longhaul") {
    windowDays = c.distanceKm >= 5000 ? 2 : 1; // travel fatigue is shorter
  } else {
    windowDays = 2; // manual: a sensible default
  }

  return {
    kind: c.kind,
    toLabel: p.current_label ?? (p.current_tz ? describeZone(p.current_tz) : "a new place"),
    hoursCrossed,
    direction: c.kind === "jetlag" ? (c.diffH > 0 ? "east" : "west") : null,
    distanceKm: c.distanceKm,
    daysSince,
    windowDays,
    active: daysSince >= 0 && daysSince <= windowDays,
  };
}

// Extra water (ml) while adjusting, tapering across the window. Jet lag and
// manual trips get a flat ~400 ml; long-haul scales with distance (cabin
// dehydration), up to ~700 ml.
export function travelHydrationOffsetMl(info: TravelInfo | null): number {
  if (!info || !info.active) return 0;
  const remaining = Math.max(0, info.windowDays - info.daysSince) / info.windowDays;
  const peak =
    info.kind === "longhaul"
      ? Math.min(700, 300 + Math.round(info.distanceKm / 25))
      : 400;
  return Math.round((peak * remaining) / 50) * 50;
}

export function adjustmentDateLabel(info: TravelInfo): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, info.windowDays - info.daysSince));
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

// Direction/kind-aware tips. Jet lag east (e.g. US→Europe) needs a phase
// advance; west a phase delay. Long-haul/manual focus on recovery, not clock.
export function jetLagTips(info: TravelInfo): string[] {
  const tips: string[] = [];
  if (info.kind === "jetlag") {
    if (info.direction === "east") {
      tips.push("Get bright light in the morning; dim screens after sunset.");
      tips.push("Aim for an earlier dinner and bedtime than feels natural.");
      tips.push("Stop caffeine by early afternoon so you can fall asleep earlier.");
    } else {
      tips.push("Get outdoor light in the late afternoon/early evening.");
      tips.push("Push bedtime a little later rather than fighting to sleep early.");
      tips.push("Morning caffeine is fine; avoid long daytime naps.");
    }
    if (info.daysSince <= 1) {
      tips.unshift("Hydrate steadily today — travel and dry cabin air add up.");
    }
  } else {
    // Travel fatigue (long-haul or manual): recover from the journey itself.
    tips.push("Hydrate well today — long flights are dehydrating.");
    tips.push("Move and stretch; a short walk eases travel stiffness.");
    tips.push("Prioritise sleep tonight; low recovery scores are the journey, not overtraining.");
  }
  return tips.slice(0, 3);
}
