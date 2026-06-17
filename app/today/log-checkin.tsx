"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { markDayStatus } from "./checkin-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Asks, once, whether yesterday was fully logged — so the adaptive engine can
// ignore under-logged days. Dismissable; an answer (or dismiss) records a
// status so it won't ask about that day again.
export function LogCheckIn({
  day,
  label,
}: {
  day: string; // YYYY-MM-DD (yesterday)
  label: string; // e.g. "yesterday (Tue)"
}) {
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;

  const set = (status: "complete" | "partial" | "skipped") =>
    start(async () => {
      await markDayStatus(day, status);
      setHidden(true);
    });

  return (
    <Card>
      <CardContent className="space-y-2.5 pt-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm">
            Did you log everything you ate {label}?
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => set("skipped")}
            className="-mr-1 -mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Helps me learn your real intake — under-logged days are left out of
          your adaptive targets.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={pending} onClick={() => set("complete")}>
            Yes, all logged
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => set("partial")}
          >
            No, I missed some
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/today/summary?date=${day}`}>Review</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
