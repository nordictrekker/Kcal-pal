import { Card, CardContent } from "@/components/ui/card";
import type { CycleAggregate } from "@/lib/cycles";

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function delta(curr: number | null, prev: number | null, unit = ""): string {
  if (curr == null || prev == null) return "—";
  const d = curr - prev;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(d % 1 === 0 ? 0 : 1)}${unit}`;
}

function deltaTone(curr: number | null, prev: number | null, betterIfUp: boolean): string {
  if (curr == null || prev == null) return "text-muted-foreground";
  const up = curr > prev;
  const good = betterIfUp ? up : !up;
  if (curr === prev) return "text-muted-foreground";
  return good ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground";
}

function fmt(n: number | null, digits = 0, unit = ""): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}${unit}`;
}

// Compare the latest CLOSED cycle to the one before it. Open (current)
// cycle is excluded — its averages are partial and unfair to compare.
export function CycleCompareCard({ cycles }: { cycles: CycleAggregate[] }) {
  const closed = cycles.filter((c) => c.end != null);
  if (closed.length < 2) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cross-cycle compare
          </h2>
          <p className="text-sm text-muted-foreground">
            Need at least two completed cycles to compare. Keep logging
            (Apple Health menstrual flow does this automatically) and a
            comparison will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const curr = closed[closed.length - 1];
  const prev = closed[closed.length - 2];

  type Row = {
    label: string;
    curr: number | null;
    prev: number | null;
    unit?: string;
    digits?: number;
    betterIfUp: boolean;
  };
  const rows: Row[] = [
    { label: "Avg readiness", curr: curr.avgReadiness, prev: prev.avgReadiness, betterIfUp: true },
    { label: "Avg sleep score", curr: curr.avgSleep, prev: prev.avgSleep, betterIfUp: true },
    { label: "Avg HRV", curr: curr.avgHrv, prev: prev.avgHrv, unit: " ms", digits: 1, betterIfUp: true },
    { label: "Avg calories", curr: curr.avgCalories, prev: prev.avgCalories, unit: " kcal", betterIfUp: true },
    { label: "Avg protein", curr: curr.avgProtein, prev: prev.avgProtein, unit: " g", betterIfUp: true },
    { label: "Avg fiber", curr: curr.avgFiber, prev: prev.avgFiber, unit: " g", betterIfUp: true },
    {
      label: "Weight change",
      curr: curr.weightDeltaLbs,
      prev: prev.weightDeltaLbs,
      unit: " lb",
      digits: 1,
      // No "better" direction for weight delta; tone stays neutral.
      betterIfUp: false,
    },
  ];

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cross-cycle compare
          </h2>
          <p className="text-sm text-muted-foreground">
            This cycle ({fmtDate(curr.start)} – {curr.end ? fmtDate(curr.end) : "now"},{" "}
            {curr.length ?? "?"} days) vs the previous (
            {fmtDate(prev.start)} – {prev.end ? fmtDate(prev.end) : ""},{" "}
            {prev.length ?? "?"} days)
          </p>
        </div>

        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between text-sm tabular-nums"
            >
              <span className="text-muted-foreground">{r.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-medium">
                  {fmt(r.curr, r.digits ?? 0, r.unit ?? "")}
                </span>
                <span
                  className={`text-xs ${
                    r.label === "Weight change"
                      ? "text-muted-foreground"
                      : deltaTone(r.curr, r.prev, r.betterIfUp)
                  }`}
                >
                  {delta(r.curr, r.prev, r.unit ?? "")}
                </span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
