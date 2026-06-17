"use client";

import { useTransition } from "react";
import { Plane, Home } from "lucide-react";
import {
  confirmTravel,
  dismissTravel,
  startManualTravel,
  endTravel,
  setHomeToCurrent,
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
  const run = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => void (await fn()));

  const sinceLabel = state.startedAt
    ? new Date(state.startedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;
  // Offer to set home when we've detected a location that isn't already home.
  const canSetHome =
    !!state.currentLabel && state.currentLabel !== state.homeLabel;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Plane className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Travel</span>
        </div>

        {/* Home base */}
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Home className="size-3.5 text-muted-foreground" />
            <span className="text-xs">
              Home base:{" "}
              <span className="font-medium">
                {state.homeLabel ?? "not set yet"}
              </span>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Travel adjustments compare where you are to your home base. Set it
            to wherever you’re normally based — handy if you signed up while
            abroad.
          </p>
          {canSetHome ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(setHomeToCurrent)}
            >
              Set {state.currentLabel} as my home base
            </Button>
          ) : null}
        </div>

        {/* Status + controls */}
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
                No, I live here
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
              Heading out? Log a trip and I&apos;ll adjust hydration and ease off
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
