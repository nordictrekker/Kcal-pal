import { Sparkles, Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CycleForecast } from "@/lib/cycles";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function relativeDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return `in ${n} days`;
  return `${Math.abs(n)} days late`;
}

export function CycleForecastCard({
  forecast,
  cycleDay,
  cycleLength,
}: {
  forecast: CycleForecast;
  cycleDay: number;
  cycleLength: number;
}) {
  const { nextPeriod, daysUntil, fertileWindow, inFertileWindow, overdue } =
    forecast;

  const pct = Math.min(100, Math.round((cycleDay / cycleLength) * 100));

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Cycle</span>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            day {cycleDay} / ~{cycleLength}
          </span>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          aria-label={`cycle progress ${pct}%`}
        >
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Next period
            </p>
            <p className="font-serif text-lg tabular-nums">
              {formatDate(nextPeriod)}
            </p>
            <p
              className={
                "text-xs " +
                (overdue ? "text-destructive" : "text-muted-foreground")
              }
            >
              {relativeDays(daysUntil)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Fertile window
            </p>
            <p className="font-serif text-lg tabular-nums">
              {formatDate(fertileWindow.start)}–{formatDate(fertileWindow.end)}
            </p>
            <p
              className={
                "flex items-center gap-1 text-xs " +
                (inFertileWindow
                  ? "text-primary"
                  : "text-muted-foreground")
              }
            >
              {inFertileWindow ? (
                <>
                  <Heart className="size-3 fill-current" />
                  in window
                </>
              ) : (
                <>peak {formatDate(fertileWindow.ovulation)}</>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
