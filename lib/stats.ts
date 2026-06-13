// Pure stat helpers for the weekly view. No DB access here so they're
// trivially testable.

export type DayValue = { date: string; value: number | null };

// Local YYYY-MM-DD for a timestamp.
export function localDay(ts: string): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// Build an ordered list of the last n calendar days (YYYY-MM-DD), oldest first.
export function lastNDays(n: number, today = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Average of the non-null values, or null if none.
export function mean(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Trailing rolling average over `window` days for each position.
export function rollingAverage(
  series: DayValue[],
  window: number,
): DayValue[] {
  return series.map((point, i) => {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1);
    return { date: point.date, value: mean(slice.map((s) => s.value)) };
  });
}

// Pearson correlation over paired (x, y) where both are non-null.
export function pearson(
  pairs: Array<{ x: number | null; y: number | null }>,
): { r: number | null; n: number } {
  const clean = pairs.filter(
    (p): p is { x: number; y: number } => p.x !== null && p.y !== null,
  );
  const n = clean.length;
  if (n < 3) return { r: null, n };
  const mx = clean.reduce((a, p) => a + p.x, 0) / n;
  const my = clean.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const p of clean) {
    const ex = p.x - mx;
    const ey = p.y - my;
    num += ex * ey;
    dx += ex * ex;
    dy += ey * ey;
  }
  if (dx === 0 || dy === 0) return { r: null, n };
  return { r: num / Math.sqrt(dx * dy), n };
}

export function describeCorrelation(r: number | null): string {
  if (r === null) return "not enough data yet";
  const a = Math.abs(r);
  const strength =
    a < 0.2 ? "no" : a < 0.4 ? "weak" : a < 0.6 ? "moderate" : "strong";
  const dir = r > 0 ? "positive" : "negative";
  if (strength === "no") return "no clear relationship";
  return `${strength} ${dir} (r = ${r.toFixed(2)})`;
}
