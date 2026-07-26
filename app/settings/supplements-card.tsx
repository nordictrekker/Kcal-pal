"use client";

import { useState, useTransition } from "react";
import { Pill, X } from "lucide-react";
import { updateSupplements } from "./supplement-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Settings card: the supplements you take. They appear as a pinned
// "Supplements" section at the top of the /log pantry for one-tap logging.
export function SupplementsCard({ initial }: { initial: string[] }) {
  const [items, setItems] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: string[]) {
    const prev = items;
    setItems(next);
    setError(null);
    startTransition(async () => {
      const r = await updateSupplements(next);
      if (!r.ok) {
        setItems(prev);
        setError(r.error ?? "Couldn't save.");
      }
    });
  }

  function add() {
    const s = draft.trim();
    if (!s) return;
    if (items.some((i) => i.toLowerCase() === s.toLowerCase())) {
      setDraft("");
      return;
    }
    setDraft("");
    save([...items, s]);
  }

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Pill className="size-4 text-muted-foreground" /> Supplements
      </h2>
      <p className="text-[11px] text-muted-foreground">
        What you take regularly (e.g. &ldquo;prenatal vitamin&rdquo;,
        &ldquo;1/3 tablet Berocca Immunité&rdquo;). They&apos;re pinned at the
        top of the pantry on the Log page for one-tap logging — include the
        brand and amount for the most accurate numbers.
      </p>

      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1 rounded-full border bg-secondary/60 py-1 pl-3 pr-1.5 text-sm"
            >
              {s}
              <button
                type="button"
                aria-label={`Remove ${s}`}
                onClick={() => save(items.filter((i) => i !== s))}
                disabled={pending}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a supplement…"
          maxLength={80}
          className="h-9 text-sm"
        />
        <Button type="submit" size="sm" disabled={pending || !draft.trim()}>
          Add
        </Button>
      </form>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
