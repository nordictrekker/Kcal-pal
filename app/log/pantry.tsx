"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { quickLogFrequent } from "./pantry-actions";
import type { FrequentItem } from "@/lib/pantry";

// Pantry: the user's most-logged foods as quick chips. Tapping a chip fills
// the description box (so you can tweak the serving and submit); the "＋"
// instantly re-logs it using the nutrients from the last time you logged it.
export function Pantry({
  items,
  onPick,
  logDate,
}: {
  items: FrequentItem[];
  onPick: (description: string) => void;
  logDate?: string | null;
}) {
  const router = useRouter();
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) return null;

  function quickAdd(item: FrequentItem) {
    setAddingKey(item.key);
    startTransition(async () => {
      const r = await quickLogFrequent(
        item.description,
        item.meal ?? undefined,
        logDate ?? undefined,
      );
      setAddingKey(null);
      if (r.ok) router.push(logDate ? `/today/summary?date=${logDate}` : "/today");
    });
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Pantry · your frequent foods
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-stretch overflow-hidden rounded-full border bg-secondary/60"
          >
            <button
              type="button"
              onClick={() => onPick(item.description)}
              className="max-w-[200px] truncate py-1.5 pl-3 pr-2 text-left text-sm hover:bg-accent"
              title={`${item.description} · logged ${item.count}×`}
            >
              {item.description}
            </button>
            <button
              type="button"
              onClick={() => quickAdd(item)}
              disabled={addingKey !== null}
              aria-label={`Quick-add ${item.description}`}
              className="flex items-center border-l px-2 text-muted-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
            >
              {addingKey === item.key ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tap to edit before logging, or ＋ to add instantly.
      </p>
    </section>
  );
}
