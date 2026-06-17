"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plane } from "lucide-react";
import {
  syncLocation,
  confirmTravel,
  dismissTravel,
  type TravelPrompt,
} from "./location-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Detects physical location (server-side IP geolocation) on load. If it looks
// like meaningful travel, asks the user to confirm before anything adjusts.
export function LocationSync() {
  const [prompt, setPrompt] = useState<TravelPrompt>(null);
  const [pending, start] = useTransition();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    syncLocation().then((r) => {
      if (r.ok && r.prompt) setPrompt(r.prompt);
    });
  }, []);

  if (!prompt) return null;

  const dir = prompt.direction === "east" ? "east" : "west";
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Plane className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            You seem to be in {prompt.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          That&apos;s {prompt.hours}h {dir} of home. Traveling? I&apos;ll ease
          off recovery alarms and raise your water goal while you adjust to the
          new time zone.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await confirmTravel();
                setPrompt(null);
              })
            }
          >
            Yes, I&apos;m traveling
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await dismissTravel();
                setPrompt(null);
              })
            }
          >
            No, this is home
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
