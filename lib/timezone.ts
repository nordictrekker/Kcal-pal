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

// "America/Los_Angeles" → "Los Angeles"; "Europe/Paris" → "Paris".
export function describeZone(tz: string): string {
  const city = tz.split("/").pop() ?? tz;
  return city.replace(/_/g, " ");
}
