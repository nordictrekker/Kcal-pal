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
