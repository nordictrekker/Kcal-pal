import type { DayValue } from "@/lib/stats";

const W = 320;
const H = 80;
const PAD = 4;

function extent(values: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

// Sparkline-style line chart for a daily series.
export function LineChart({
  series,
  label,
  unit,
}: {
  series: DayValue[];
  label: string;
  unit?: string;
}) {
  const points = series
    .map((s, i) => ({ i, v: s.value }))
    .filter((p): p is { i: number; v: number } => p.v !== null);

  const latest = [...series].reverse().find((s) => s.value !== null)?.value;

  if (points.length < 2) {
    return (
      <div className="rounded-lg border p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">
            not enough data
          </span>
        </div>
      </div>
    );
  }

  const [lo, hi] = extent(points.map((p) => p.v));
  const n = series.length;
  const x = (i: number) => PAD + (i / (n - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);

  const d = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(" ");

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="tabular-nums text-sm text-muted-foreground">
          {latest !== undefined && latest !== null
            ? `${Math.round(latest)}${unit ?? ""}`
            : "—"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-16 w-full"
        preserveAspectRatio="none"
      >
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p) => (
          <circle
            key={p.i}
            cx={x(p.i)}
            cy={y(p.v)}
            r="1.5"
            className="fill-primary"
          />
        ))}
      </svg>
    </div>
  );
}

// Scatter plot for a correlation (x vs y).
export function ScatterChart({
  pairs,
  xLabel,
  yLabel,
  caption,
}: {
  pairs: Array<{ x: number | null; y: number | null }>;
  xLabel: string;
  yLabel: string;
  caption: string;
}) {
  const clean = pairs.filter(
    (p): p is { x: number; y: number } => p.x !== null && p.y !== null,
  );

  if (clean.length < 3) {
    return (
      <div className="rounded-lg border p-3">
        <div className="text-sm font-medium">
          {xLabel} vs {yLabel}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Not enough overlapping days yet — keep logging.
        </p>
      </div>
    );
  }

  const [xlo, xhi] = extent(clean.map((p) => p.x));
  const [ylo, yhi] = extent(clean.map((p) => p.y));
  const px = (v: number) => PAD + ((v - xlo) / (xhi - xlo)) * (W - 2 * PAD);
  const py = (v: number) => H - PAD - ((v - ylo) / (yhi - ylo)) * (H - 2 * PAD);

  return (
    <div className="rounded-lg border p-3">
      <div className="text-sm font-medium">
        {xLabel} vs {yLabel}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-20 w-full">
        {clean.map((p, i) => (
          <circle
            key={i}
            cx={px(p.x)}
            cy={py(p.y)}
            r="2.5"
            className="fill-primary/70"
          />
        ))}
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
