import { Card, CardContent } from "@/components/ui/card";
import {
  describePhasePatterns,
  type PhaseBaselines,
  type PhaseMetrics,
} from "@/lib/cycles";
import type { Phase } from "@/lib/cycle";

const PHASE_ORDER: Phase[] = [
  "menstrual",
  "follicular",
  "ovulatory",
  "luteal",
];

// Small color dots that echo the /today phase palette (rust / sage /
// amber / lavender) without depending on the [data-phase] CSS vars,
// since this card lives outside that scope.
const PHASE_DOT: Record<Phase, string> = {
  menstrual: "bg-rose-300",
  follicular: "bg-emerald-300",
  ovulatory: "bg-amber-300",
  luteal: "bg-violet-300",
};

function fmt(n: number | null, digits = 0, unit = ""): string | null {
  if (n == null) return null;
  return `${Math.round(n * 10 ** digits) / 10 ** digits}${unit}`;
}

function PhaseRow({ phase, m }: { phase: Phase; m: PhaseMetrics }) {
  const stats = [
    fmt(m.calories, 0, " cal"),
    fmt(m.protein, 0, "g protein"),
    m.sleep != null ? `sleep ${Math.round(m.sleep)}` : null,
    m.hrv != null ? `HRV ${Math.round(m.hrv)}ms` : null,
  ].filter((s): s is string => s !== null);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${PHASE_DOT[phase]}`} />
        <span className="text-sm font-medium capitalize">{phase}</span>
        <span className="text-xs text-muted-foreground">· {m.days}d</span>
      </div>
      <p className="pl-4 text-xs tabular-nums text-muted-foreground">
        {stats.length ? stats.join(" · ") : "not enough data yet"}
      </p>
    </div>
  );
}

// "Your cycle patterns" — averages each tracked metric by cycle phase
// across all available history, then leads with the most distinctive
// plain-language observations. The point: replace textbook phase advice
// with HER actual numbers.
export function PhaseBaselinesCard({ baselines }: { baselines: PhaseBaselines }) {
  const populated = PHASE_ORDER.filter(
    (p) => baselines.byPhase[p].days >= 3,
  );
  const patterns = describePhasePatterns(baselines);

  if (populated.length < 2) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your cycle patterns
          </h2>
          <p className="text-sm text-muted-foreground">
            Once there&apos;s a couple of cycles of logged food and recovery
            data, this is where kcal pal learns what your own phases look
            like — appetite, sleep, and recovery, in your numbers.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your cycle patterns
          </h2>
          <p className="text-xs text-muted-foreground">
            Averaged across {baselines.observedDays} logged days of your own
            data — not textbook ranges.
          </p>
        </div>

        {patterns.length > 0 ? (
          <ul className="space-y-1.5">
            {patterns.map((t, i) => (
              <li key={i} className="text-sm leading-snug">
                {t}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3">
          {PHASE_ORDER.filter((p) => baselines.byPhase[p].days > 0).map((p) => (
            <PhaseRow key={p} phase={p} m={baselines.byPhase[p]} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
