"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Pill } from "lucide-react";
import { quickLogFrequent } from "./pantry-actions";
import { relogLatestByName } from "./relog-actions";
import type { FrequentItem } from "@/lib/pantry";

// Pantry: the user's most-logged foods as quick chips, alphabetized, with the
// Settings-declared supplements pinned in their own section on top. Tapping a
// chip fills the description box (so you can tweak and submit); "＋" logs it
// instantly — frequent foods from their stored nutrients, supplements by
// copying the latest matching log (falling back to fill-the-box for a
// supplement that's never been logged, so the first log gets the AI parse).
export function Pantry({
  items,
  supplements,
  onPick,
  logDate,
}: {
  items: FrequentItem[];
  supplements: string[];
  onPick: (description: string) => void;
  logDate?: string | null;
}) {
  const router = useRouter();
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sorted = [...items].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );

  if (sorted.length === 0 && supplements.length === 0) return null;

  function done(ok: boolean) {
    setAddingKey(null);
    if (ok) router.push(logDate ? `/today/summary?date=${logDate}` : "/today");
  }

  function quickAdd(item: FrequentItem) {
    setAddingKey(item.key);
    startTransition(async () => {
      const r = await quickLogFrequent({
        description: item.description,
        meal: item.meal ?? undefined,
        date: logDate ?? undefined,
        nutrients: item.nutrients,
      });
      done(r.ok);
    });
  }

  function quickAddSupplement(name: string) {
    setAddingKey(`supp:${name}`);
    startTransition(async () => {
      const r = await relogLatestByName(name, undefined, logDate);
      if (r.noMatch) {
        // Never logged before: fill the box so the first log gets a real parse.
        setAddingKey(null);
        onPick(name);
        return;
      }
      done(r.ok);
    });
  }

  const chipClass =
    "flex items-stretch overflow-hidden rounded-full border bg-secondary/60";
  const nameBtnClass =
    "max-w-[150px] truncate py-1.5 pl-3 pr-2 text-left text-sm hover:bg-accent";
  const plusBtnClass =
    "flex items-center border-l px-2 text-muted-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-50";

  return (
    <div className="space-y-4">
      {supplements.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Pill className="size-3.5" /> Supplements
          </h2>
          <div className="flex flex-wrap gap-2">
            {supplements.map((name) => (
              <div key={name} className={chipClass}>
                <button
                  type="button"
                  onClick={() => onPick(name)}
                  className={nameBtnClass}
                  title={name}
                >
                  {name}
                </button>
                <button
                  type="button"
                  onClick={() => quickAddSupplement(name)}
                  disabled={addingKey !== null}
                  aria-label={`Quick-add ${name}`}
                  className={plusBtnClass}
                >
                  {addingKey === `supp:${name}` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sorted.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pantry · your frequent foods
          </h2>
          <div className="flex flex-wrap gap-2">
            {sorted.map((item) => (
              <div key={item.key} className={chipClass}>
                <button
                  type="button"
                  onClick={() => onPick(item.description)}
                  className={nameBtnClass}
                  title={`${item.description} · logged ${item.count}×`}
                >
                  {item.label}
                </button>
                <button
                  type="button"
                  onClick={() => quickAdd(item)}
                  disabled={addingKey !== null}
                  aria-label={`Quick-add ${item.description}`}
                  className={plusBtnClass}
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
      ) : null}
    </div>
  );
}
