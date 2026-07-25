"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2 } from "lucide-react";
import { relogEntry } from "./relog-actions";
import type { RecentMeal } from "@/lib/recent-meals";
import { Button } from "@/components/ui/button";

function fmt(n: number | null): string {
  return n === null ? "—" : Math.round(n).toString();
}

function daysAgoLabel(iso: string): string {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 86_400_000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

// Zero-setup repeat logging: recent distinct meals, one tap to log again with
// the full original nutrient breakdown. Hidden until there's history — it
// builds itself, no saving step required.
export function RecentMeals({
  items,
  logDate,
}: {
  items: RecentMeal[];
  logDate?: string | null;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) return null;

  function relog(entryId: string) {
    setPendingId(entryId);
    setError(null);
    startTransition(async () => {
      const r = await relogEntry(entryId, undefined, logDate);
      setPendingId(null);
      if (r.ok) {
        router.push(logDate ? `/today/summary?date=${logDate}` : "/today");
      } else {
        setError(r.error ?? "Couldn't log that again.");
      }
    });
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="size-3.5" /> Log again
      </h2>
      <div className="divide-y rounded-lg border">
        {items.map((it) => (
          <div key={it.entryId} className="flex items-center gap-2 p-3">
            <button
              type="button"
              onClick={() => relog(it.entryId)}
              disabled={pendingId !== null}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-sm font-medium">{it.description}</p>
              <p className="truncate text-xs text-muted-foreground">
                {fmt(it.calories)} kcal · {daysAgoLabel(it.lastLogged)}
              </p>
            </button>
            {pendingId === it.entryId ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => relog(it.entryId)}
                disabled={pendingId !== null}
              >
                + Log
              </Button>
            )}
          </div>
        ))}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
