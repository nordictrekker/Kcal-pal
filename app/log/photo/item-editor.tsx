"use client";

import { Minus, Plus, Undo2, X } from "lucide-react";
import {
  PORTION_STEPS,
  formatMultiplier,
  type EditableItem,
} from "@/lib/photo-items";
import { cn } from "@/lib/utils";

// The per-component portion editor on the photo confirm screen. The model is
// usually right about what's on the plate and wrong about how much, so portion
// is what you adjust — one tap per component, totals recompute above.
export function ItemEditor({
  items,
  onChange,
}: {
  items: EditableItem[];
  onChange: (next: EditableItem[]) => void;
}) {
  if (items.length === 0) return null;

  function update(key: string, patch: Partial<EditableItem>) {
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function step(item: EditableItem, dir: 1 | -1) {
    const idx = PORTION_STEPS.indexOf(
      item.multiplier as (typeof PORTION_STEPS)[number],
    );
    // A multiplier off the ladder (shouldn't happen) falls back to 1×.
    const from = idx === -1 ? PORTION_STEPS.indexOf(1) : idx;
    const next = Math.min(
      PORTION_STEPS.length - 1,
      Math.max(0, from + dir),
    );
    update(item.key, { multiplier: PORTION_STEPS[next] });
  }

  const keptCount = items.filter((i) => !i.removed).length;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">What&apos;s on the plate</h2>
        <p className="text-xs text-muted-foreground">
          {keptCount} of {items.length} · adjust portions
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Portions are the usual thing to fix. Tap − or + to change how much of
        each item you ate; totals update above.
      </p>

      <ul className="divide-y rounded-lg border">
        {items.map((item) => (
          <li
            key={item.key}
            className={cn("p-3", item.removed && "bg-muted/40")}
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    item.removed && "text-muted-foreground line-through",
                  )}
                >
                  {item.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.quantity || "—"}
                  {typeof item.calories === "number" && !item.removed
                    ? ` · ${Math.round(item.calories * item.multiplier)} kcal`
                    : ""}
                  {typeof item.grams === "number" && !item.removed
                    ? ` · ${Math.round(item.grams * item.multiplier)} g`
                    : ""}
                </p>
              </div>

              {item.removed ? (
                <button
                  type="button"
                  onClick={() => update(item.key, { removed: false })}
                  className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                  aria-label={`Put ${item.name} back`}
                >
                  <Undo2 className="size-3.5" />
                  Undo
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => step(item, -1)}
                      disabled={item.multiplier === PORTION_STEPS[0]}
                      aria-label={`Less ${item.name}`}
                      className="rounded-md border p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span
                      className={cn(
                        "w-10 text-center text-xs tabular-nums",
                        item.multiplier !== 1 && "font-semibold text-foreground",
                      )}
                    >
                      {formatMultiplier(item.multiplier)}
                    </span>
                    <button
                      type="button"
                      onClick={() => step(item, 1)}
                      disabled={
                        item.multiplier === PORTION_STEPS[PORTION_STEPS.length - 1]
                      }
                      aria-label={`More ${item.name}`}
                      className="rounded-md border p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => update(item.key, { removed: true })}
                    aria-label={`Remove ${item.name}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
