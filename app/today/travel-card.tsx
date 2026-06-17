import { Plane } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { adjustmentDateLabel, jetLagTips, type TravelInfo } from "@/lib/travel";

// Shown on Today while the user is adjusting to a new timezone. Direction-
// and day-aware jet-lag guidance, plus when they're likely back to baseline.
export function TravelCard({ info }: { info: TravelInfo }) {
  const tips = jetLagTips(info);
  const dayLabel =
    info.daysSince <= 0 ? "Day 1" : `Day ${info.daysSince + 1}`;
  return (
    <Card>
      <CardContent className="space-y-2.5 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Adjusting to {info.toLabel}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {dayLabel} of ~{info.windowDays + 1}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {info.hoursCrossed}h {info.direction === "east" ? "east" : "west"} —
          recovery alarms are paused and your water goal is raised while you
          settle. Likely back to baseline by {adjustmentDateLabel(info)}.
        </p>
        <ul className="space-y-1">
          {tips.map((t, i) => (
            <li
              key={i}
              className="flex gap-2 text-xs text-foreground/80"
            >
              <span className="text-muted-foreground">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
