"use client";

import { useState, useTransition } from "react";
import { Scale, Plus, X } from "lucide-react";
import { logWeight, type WeightResult } from "./weight-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type WeightSnapshot = {
  weight_lbs: number;
  measured_at: string;
} | null;

export type WeightProjection = {
  lbsPerWeek: number;
  goalLbs: number | null;
  etaDate: string | null;
  weeksAway: number | null;
} | null;

function formatLb(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (today.getTime() - day.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toISOString().slice(0, 10);
}

function formatEtaDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ProjectionLine({ proj }: { proj: NonNullable<WeightProjection> }) {
  const direction = proj.lbsPerWeek > 0 ? "+" : "";
  const rate = `${direction}${proj.lbsPerWeek.toFixed(2)} lb/wk`;
  if (proj.etaDate && proj.weeksAway != null && proj.goalLbs != null) {
    return (
      <p className="text-xs text-muted-foreground">
        Trend: {rate} → goal {proj.goalLbs.toFixed(1)} lb by{" "}
        <span className="text-foreground">{formatEtaDate(proj.etaDate)}</span>
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      Trend: {rate} (set a goal weight in Settings to see an ETA)
    </p>
  );
}

export function WeightCard({
  latest,
  projection,
}: {
  latest: WeightSnapshot;
  projection?: WeightProjection;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(
    latest ? formatLb(latest.weight_lbs) : "",
  );
  const [pending, start] = useTransition();
  const [result, setResult] = useState<WeightResult | null>(null);

  function submit() {
    setResult(null);
    const fd = new FormData();
    fd.set("weight_lbs", value);
    start(async () => {
      const r = await logWeight(fd);
      setResult(r);
      if (r.ok) setOpen(false);
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {!open ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Weight</span>
                {latest ? (
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatLb(latest.weight_lbs)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
                {latest ? (
                  <span className="text-xs text-muted-foreground">
                    lb · {formatWhen(latest.measured_at)}
                  </span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(true)}
              >
                <Plus className="size-4" />
                <span className="ml-1">Log</span>
              </Button>
            </div>
            {projection ? <ProjectionLine proj={projection} /> : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Log weight</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto text-muted-foreground hover:text-foreground"
                aria-label="Cancel"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                placeholder="lb"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoFocus
                className="h-10 max-w-[120px] tabular-nums"
              />
              <span className="text-sm text-muted-foreground">lb</span>
              <Button
                type="button"
                onClick={submit}
                disabled={pending || !value}
                className="ml-auto"
              >
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
            {result && !result.ok ? (
              <p className="text-xs text-destructive">{result.error}</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
