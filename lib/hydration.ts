// Hydration math: unit conversions, the beverage catalog (how much each
// drink counts toward fluids), the smart weight+activity goal, and
// auto-detection of drinks logged as food (a coffee or shake with a meal).
//
// Everything here is pure and deterministic so it can run on the server at
// render time and be unit-tested without a DB.

export const OZ_TO_ML = 29.5735;
const LB_TO_KG = 0.45359237;

export const mlToOz = (ml: number): number => Math.round(ml / OZ_TO_ML);
// One decimal litre, e.g. 1.4. Kept as a number so callers control units.
export const mlToL = (ml: number): number => Math.round(ml / 100) / 10;
export const ozToMl = (oz: number): number => Math.round(oz * OZ_TO_ML);

// "16 oz · 0.5 L" — the dual-unit label used across the water UI.
export function formatDual(ml: number): string {
  return `${mlToOz(ml)} oz · ${mlToL(ml).toFixed(1)} L`;
}

export type BeverageKind =
  | "water"
  | "coffee"
  | "tea"
  | "milk"
  | "shake"
  | "juice"
  | "soda"
  | "other";

type BeverageDef = {
  label: string;
  defaultMl: number; // typical serving when we can't read a real volume
  factor: number; // fraction that counts toward the fluid goal
};

// Hydration factors follow current guidance: caffeinated and most other
// drinks hydrate nearly as well as water (the diuretic effect is mild and
// net-positive). Alcohol is intentionally absent — it doesn't count.
export const BEVERAGES: Record<BeverageKind, BeverageDef> = {
  water: { label: "Water", defaultMl: 250, factor: 1.0 },
  coffee: { label: "Coffee", defaultMl: 240, factor: 0.9 },
  tea: { label: "Tea", defaultMl: 240, factor: 0.9 },
  milk: { label: "Milk", defaultMl: 240, factor: 0.9 },
  shake: { label: "Shake", defaultMl: 350, factor: 0.9 },
  juice: { label: "Juice", defaultMl: 240, factor: 0.85 },
  soda: { label: "Soda", defaultMl: 350, factor: 0.8 },
  other: { label: "Drink", defaultMl: 250, factor: 0.85 },
};

export function hydrationFactor(kind: string): number {
  return (BEVERAGES[kind as BeverageKind] ?? BEVERAGES.other).factor;
}

export function isBeverageKind(kind: string): kind is BeverageKind {
  return kind in BEVERAGES;
}

// ── Smart daily goal ────────────────────────────────────────────────────
//
// Baseline ~31 ml per kg bodyweight (clinical range is 30–35 ml/kg of TOTAL
// daily fluid, which is what we now track since drinks count too), plus a
// bump for habitual activity. Uses average daily steps rather than today's
// partial count so the goal is stable through the day.
export function computeWaterGoalMl(input: {
  weightLbs: number | null;
  avgSteps: number | null;
}): number {
  const kg =
    input.weightLbs && input.weightLbs > 0 ? input.weightLbs * LB_TO_KG : null;
  // 2100 ml fallback (~71 oz) until we know a bodyweight.
  const base = kg ? kg * 31 : 2100;
  // ~60 ml per 1,000 steps above a 6k sedentary baseline, capped at 800 ml.
  const steps = input.avgSteps ?? 0;
  const bump = Math.min(800, Math.max(0, (steps - 6000) / 1000) * 60);
  const rounded = Math.round((base + bump) / 50) * 50;
  return Math.min(4000, Math.max(1500, rounded));
}

// Plain-language note explaining how the smart goal was derived.
export function describeWaterGoal(input: {
  weightLbs: number | null;
  avgSteps: number | null;
}): string {
  const parts: string[] = [];
  if (input.weightLbs && input.weightLbs > 0) parts.push("your weight");
  else parts.push("a default baseline");
  if (input.avgSteps && input.avgSteps > 6000) parts.push("your activity");
  return `Smart goal from ${parts.join(" + ")}`;
}

// ── Auto-detect drinks logged as food ───────────────────────────────────
//
// Someone logs "oat milk latte" or "protein shake" with a meal; that fluid
// should count. Patterns are ordered most-specific first so "latte" maps to
// coffee, not milk.
const BEVERAGE_PATTERNS: Array<{ re: RegExp; kind: BeverageKind }> = [
  { re: /\b(latte|cappuccino|espresso|americano|macchiato|mocha|flat white|cold brew|coffee)\b/i, kind: "coffee" },
  { re: /\b(matcha|chai|tea)\b/i, kind: "tea" },
  { re: /\b(protein shake|smoothie|milkshake|shake|frappe|frappuccino)\b/i, kind: "shake" },
  { re: /\b(oat milk|almond milk|soy milk|whole milk|skim milk|milk)\b/i, kind: "milk" },
  { re: /\b(orange juice|apple juice|lemonade|juice)\b/i, kind: "juice" },
  { re: /\b(sparkling water|seltzer|kombucha|soda|cola|coke|pepsi|sprite|ginger ale)\b/i, kind: "soda" },
  { re: /\b(sparkling water|water)\b/i, kind: "water" },
];

// Pull a volume in ml out of a free-text serving size, falling back to the
// beverage's typical serving. Clamped to a sane single-drink range.
function parseVolumeMl(serving: string | null, fallback: number): number {
  if (!serving) return fallback;
  const s = serving.toLowerCase();
  const clamp = (n: number) =>
    Number.isFinite(n) && n > 0 ? Math.min(1500, Math.round(n)) : fallback;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/([\d.]+)\s*ml\b/))) return clamp(Number(m[1]));
  if ((m = s.match(/([\d.]+)\s*l\b/))) return clamp(Number(m[1]) * 1000);
  if ((m = s.match(/([\d.]+)\s*fl\s*oz\b/))) return clamp(Number(m[1]) * OZ_TO_ML);
  if ((m = s.match(/([\d.]+)\s*oz\b/))) return clamp(Number(m[1]) * OZ_TO_ML);
  if ((m = s.match(/([\d.]+)\s*cups?\b/))) return clamp(Number(m[1]) * 240);
  return fallback;
}

export type DetectedFluid = {
  kind: BeverageKind;
  ml: number;
  effectiveMl: number;
  description: string;
};

export function detectBeverageFluids(
  entries: Array<{ description: string | null; serving_size: string | null }>,
): DetectedFluid[] {
  const out: DetectedFluid[] = [];
  for (const e of entries) {
    const desc = (e.description ?? "").trim();
    if (!desc) continue;
    const match = BEVERAGE_PATTERNS.find((p) => p.re.test(desc));
    if (!match) continue;
    const def = BEVERAGES[match.kind];
    const ml = parseVolumeMl(e.serving_size, def.defaultMl);
    out.push({
      kind: match.kind,
      ml,
      effectiveMl: Math.round(ml * def.factor),
      description: desc,
    });
  }
  return out;
}

// Effective fluid (ml counting toward the goal) for a set of water_logs.
export function effectiveFluidMl(
  rows: Array<{ ml: number; hydration_factor?: number | null }>,
): number {
  return rows.reduce(
    (sum, r) => sum + r.ml * (r.hydration_factor ?? 1),
    0,
  );
}

// ── Time-of-day pacing ──────────────────────────────────────────────────────
// Hydration should track the WAKING day, not the calendar day: little expected
// early, ramping to the full goal by night. So 8 oz at 10am is fine, but the
// same 8 oz at 2pm is behind.
export const HYDRATION_START_HOUR = 7;
export const HYDRATION_END_HOUR = 21; // 14-hour window

// Fraction of the goal you'd expect by a given local hour.
export function expectedHydrationFraction(hour: number): number {
  const span = HYDRATION_END_HOUR - HYDRATION_START_HOUR;
  return Math.max(0, Math.min(1, (hour - HYDRATION_START_HOUR) / span));
}

export type HydrationPace = "early" | "ahead" | "ontrack" | "behind" | "met";

// Where the user is vs. the expected pace at this hour. `deficit` is
// (expected − actual) as a fraction of the goal (positive = behind).
export function hydrationPace(
  hour: number,
  todayMl: number,
  targetMl: number,
): { status: HydrationPace; deficit: number } {
  if (targetMl <= 0) return { status: "ontrack", deficit: 0 };
  const actual = todayMl / targetMl;
  if (actual >= 1) return { status: "met", deficit: 0 };
  const expected = expectedHydrationFraction(hour);
  const deficit = expected - actual;
  // Mornings get a pass — too early for "behind" to mean anything.
  if (hour < HYDRATION_START_HOUR + 3) return { status: "early", deficit };
  if (deficit >= 0.18) return { status: "behind", deficit };
  if (deficit <= -0.1) return { status: "ahead", deficit };
  return { status: "ontrack", deficit };
}
