// Reading and validating values out of a FormData/JSON payload. Pure, so the
// rules live in one place (and are unit-testable) instead of being re-derived
// in every action.

// A nullable numeric column: blank/absent → null, negative or non-finite → null.
export function readNumberOrNull(
  v: FormDataEntryValue | null | undefined,
): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type NumberRange = {
  min: number;
  max: number;
  // Treat `min` as a floor the value must exceed (amounts must be > 0).
  exclusiveMin?: boolean;
  // Reject non-integers (targets, cycle lengths) rather than rounding.
  integer?: boolean;
};

export type ParsedNumber =
  | { ok: true; value: number }
  | { ok: false; empty: boolean };

// Parse one numeric form field against its range. `empty` distinguishes "not
// provided" (usually skip the field) from "provided but invalid" (an error).
export function parseNumber(
  v: FormDataEntryValue | null | undefined,
  range: NumberRange,
): ParsedNumber {
  const s = String(v ?? "").trim();
  if (s === "") return { ok: false, empty: true };
  const n = Number(s);
  const valid = range.integer ? Number.isInteger(n) : Number.isFinite(n);
  const aboveMin = range.exclusiveMin ? n > range.min : n >= range.min;
  if (!valid || !aboveMin || n > range.max) {
    return { ok: false, empty: false };
  }
  return { ok: true, value: n };
}

export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(v: unknown): v is string {
  return typeof v === "string" && DAY_KEY_RE.test(v);
}

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// The `consumed_at` for an optional back-date: a past day is anchored to local
// noon so the entry lands inside that day whatever the timezone; today (or a
// missing/invalid/future day) returns null, meaning "use the row default".
export function backdatedConsumedAt(
  day: string | null | undefined,
  now = new Date(),
): string | null {
  if (!isDayKey(day)) return null;
  return day < todayKey(now) ? `${day}T12:00:00.000Z` : null;
}
