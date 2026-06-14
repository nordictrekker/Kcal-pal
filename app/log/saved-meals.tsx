"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Trash2, Loader2 } from "lucide-react";
import { quickAddSavedMeal, deleteSavedMeal } from "./saved-actions";
import { Button } from "@/components/ui/button";

export type SavedMealItem = {
  id: string;
  label: string;
  description: string;
  calories: number | null;
  protein_g: number | null;
};

function fmt(n: number | null): string {
  return n === null ? "—" : Math.round(n).toString();
}

export function SavedMeals({ items }: { items: SavedMealItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Saved meals
        </h2>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Save any logged entry from <span className="font-medium">Today</span>
          {" "}to bring it back here for one-tap re-logging.
        </div>
      </section>
    );
  }

  function add(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const r = await quickAddSavedMeal(id);
      setPendingId(null);
      if (r.ok) router.push("/today");
    });
  }

  function remove(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      await deleteSavedMeal(id);
      setDeletingId(null);
    });
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Saved meals
      </h2>
      <div className="divide-y rounded-lg border">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 p-3">
            <button
              type="button"
              onClick={() => add(it.id)}
              disabled={pendingId === it.id}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-sm font-medium">{it.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {fmt(it.calories)} kcal · P {fmt(it.protein_g)}
              </p>
            </button>
            {pendingId === it.id ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => add(it.id)}
                disabled={pendingId !== null}
              >
                + Log
              </Button>
            )}
            <button
              type="button"
              onClick={() => remove(it.id)}
              disabled={deletingId === it.id}
              aria-label="Delete saved meal"
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// Inline "Save as quick-add" control for the entry row on /today.
export function SaveEntryButton({
  onSave,
  disabled,
}: {
  onSave: (label: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!label.trim()) {
      setErr("Give it a name");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await onSave(label);
        setOpen(false);
        setLabel("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="Save as quick-add"
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Bookmark className="size-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Label"
        maxLength={80}
        className="h-7 w-32 rounded-md border bg-background px-2 text-xs"
      />
      <Button type="button" size="sm" onClick={submit} disabled={pending}>
        {pending ? "…" : "Save"}
      </Button>
      {err ? <span className="text-xs text-destructive">{err}</span> : null}
    </div>
  );
}
