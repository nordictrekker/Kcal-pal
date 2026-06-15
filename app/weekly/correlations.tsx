import { Card, CardContent } from "@/components/ui/card";
import { describeCorrelation } from "@/lib/stats";

export type Corr = {
  id: "sleep_carbs" | "sleep_cal" | "water_readiness" | "protein_hrv";
  r: number | null;
  n: number;
};

const MIN_PAIRS = 10;
const MIN_R = 0.2;

// Direction-aware, warm phrasing per known pair. Returns null when the
// relationship is too weak or there isn't enough data to claim anything
// honestly.
function sentence(c: Corr): string | null {
  if (c.r === null || c.n < MIN_PAIRS || Math.abs(c.r) < MIN_R) return null;
  const tail = `(${describeCorrelation(c.r)} · ${c.n} day-pairs)`;
  const up = c.r > 0;
  switch (c.id) {
    case "sleep_carbs":
      return up
        ? `Better sleep nudges your carbs up a little the next day ${tail} — just an observation, nothing to fix.`
        : `On nights you sleep short, your carbs climb the next day ${tail}. Normal biology — a protein-anchored breakfast after rough nights helps you feel steady.`;
    case "sleep_cal":
      return up
        ? `You tend to eat a bit more the day after good sleep ${tail} — appetite often tracks recovery.`
        : `Short sleep tends to pull your next-day intake up ${tail}. Plan an easy, satisfying meal rather than white-knuckling it.`;
    case "water_readiness":
      return up
        ? `Days you hydrate well, your next-morning readiness tends to run higher ${tail} — one of your easiest levers.`
        : null;
    case "protein_hrv":
      return up
        ? `Higher-protein days line up with better next-day HRV for you ${tail} — recovery likes the amino acids.`
        : null;
  }
}

// "What moves your numbers" — personalized, plain-language correlations
// drawn from the wide history window. Complements the scatter below with
// something readable at a glance.
export function CorrelationsCard({ corrs }: { corrs: Corr[] }) {
  const lines = corrs.map(sentence).filter((s): s is string => s !== null);

  if (lines.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What moves your numbers
          </h2>
          <p className="text-sm text-muted-foreground">
            As more days stack up, Kcal-pal looks for the relationships that
            are specific to you — like whether short sleep pulls your next-day
            cravings up. Nothing clear enough to report yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What moves your numbers
        </h2>
        <ul className="space-y-2">
          {lines.map((t, i) => (
            <li key={i} className="text-sm leading-snug">
              {t}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Patterns, not proof — correlations from your own history, meant to
          notice, not diagnose.
        </p>
      </CardContent>
    </Card>
  );
}
