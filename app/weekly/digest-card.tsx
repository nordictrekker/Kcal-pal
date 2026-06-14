"use client";

import { useState, useTransition } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  regenerateDigest,
  type DigestState,
} from "./digest-actions";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DigestCard({ initial }: { initial: DigestState }) {
  const [state, setState] = useState<DigestState>(initial);
  const [pending, start] = useTransition();

  function regen() {
    start(async () => {
      const next = await regenerateDigest();
      setState(next);
    });
  }

  const isReady = state.status === "ready";

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">This week</span>
            {isReady ? (
              <span className="text-xs text-muted-foreground">
                · {formatWhen(state.generatedAt)}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={regen}
            disabled={pending}
          >
            <RefreshCw
              className={pending ? "size-4 animate-spin" : "size-4"}
            />
            <span className="ml-1">
              {pending ? "Writing…" : isReady ? "Refresh" : "Generate"}
            </span>
          </Button>
        </div>

        {state.status === "ready" ? (
          <p className="whitespace-pre-line font-serif text-[15px] leading-relaxed text-foreground/85">
            {state.summary}
          </p>
        ) : state.status === "error" ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Tap Generate for a short reflection on the past week — what
            stood out across food, sleep, and movement.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
