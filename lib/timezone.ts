// Timezone helpers. Pure and dependency-free so they run on the server at
// render time and in the client detector.

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// A Date whose local components (getHours/getDate/…) read as the wall-clock
// in `tz`. Used to give the insight engine the user's real time-of-day
// instead of the server's UTC. Falls back to the base date if tz is unknown.
export function zonedNow(tz: string | null | undefined, base = new Date()): Date {
  if (!isValidTimeZone(tz)) return base;
  try {
    return new Date(base.toLocaleString("en-US", { timeZone: tz }));
  } catch {
    return base;
  }
}

// UTC offset of a zone, in minutes, at a given instant (handles DST).
export function zoneOffsetMinutes(tz: string, at: Date = new Date()): number {
  if (!isValidTimeZone(tz)) return 0;
  try {
    const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
    const local = new Date(at.toLocaleString("en-US", { timeZone: tz }));
    return Math.round((local.getTime() - utc.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

// "America/Los_Angeles" → "Los Angeles"; "Europe/Paris" → "Paris".
export function describeZone(tz: string): string {
  const city = tz.split("/").pop() ?? tz;
  return city.replace(/_/g, " ");
}

// The calendar date (YYYY-MM-DD) in the given zone at instant `at`. This is the
// user's real "today" — so day rollover happens at THEIR local midnight, not
// the server's UTC midnight. Falls back to UTC when tz is unknown.
export function localDayKey(
  tz: string | null | undefined,
  at: Date = new Date(),
): string {
  if (!isValidTimeZone(tz)) return at.toISOString().slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

// The UTC instant range [start, end) covering a local calendar day in `tz`,
// for timestamptz range queries. Uses the zone offset at local noon (DST-safe
// for the vast majority of days).
export function localDayBoundsUTC(
  tz: string | null | undefined,
  dayKey: string,
): { start: string; end: string } {
  const noon = new Date(`${dayKey}T12:00:00.000Z`);
  const offMin = isValidTimeZone(tz) ? zoneOffsetMinutes(tz, noon) : 0;
  const startMs = Date.parse(`${dayKey}T00:00:00.000Z`) - offMin * 60_000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000).toISOString(),
  };
}

// Shift a YYYY-MM-DD key by whole days.
export function addDaysToKey(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00.000Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
