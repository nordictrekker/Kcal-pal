"use client";

import { useTransition } from "react";
import { Plane } from "lucide-react";
import {
  confirmTravel,
  dismissTravel,
  startManualTravel,
  endTravel,
} from "../today/location-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type TravelState = {
  status: "home" | "pending" | "traveling";
  homeLabel: string | null;
  currentLabel: string | null;
  startedAt: string | null;
};

export function TravelCard({ state }: { state: TravelState }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean }>) => start(async () => void (await fn()));

  const sinceLabel = state.startedAt
    ? new Date(state.startedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Plane className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Travel</span>
        </div>

        {state.status === "pending" ? (
          <>
            <p className="text-xs text-muted-foreground">
              You seem to be in{" "}
              <span className="font-medium text-foreground">
                {state.currentLabel ?? "a new place"}
              </span>
              . Are you traveling? While traveling, recovery alarms ease off and
              your water goal rises.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => run(confirmTravel)}>
                Yes, I&apos;m traveling
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(dismissTravel)}
              >
                No, this is home
              </Button>
            </div>
          </>
        ) : state.status === "traveling" ? (
          <>
            <p className="text-xs text-muted-foreground">
              Traveling{state.currentLabel ? ` in ${state.currentLabel}` : ""}
              {sinceLabel ? ` since ${sinceLabel}` : ""}. Recovery alarms are
              eased and your water goal is raised.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(endTravel)}
            >
              I&apos;m back home
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              At home{state.homeLabel ? ` in ${state.homeLabel}` : ""}. Heading
              out? Log a trip and I&apos;ll adjust hydration and ease off
              recovery alarms while you settle.
            </p>
            <Button size="sm" disabled={pending} onClick={() => run(startManualTravel)}>
              I&apos;m traveling
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
