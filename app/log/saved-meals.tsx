"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, ChevronDown, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  quickAddSavedMeal,
  deleteSavedMeal,
  renameSavedMeal,
} from "./saved-actions";
import { Button } from "@/components/ui/button";
import { METRICS, MACRO_METRIC_KEYS, MICRO_METRIC_KEYS } from "@/lib/nutrients";
import type { Totals } from "@/lib/food";

export type SavedMealItem = {
  id: string;
  label: string;
  description: string;
  serving_size: string | null;
  calories: number | null;
  // Everything else the template stores, keyed by the food_entries column name
  // so the metric registry can render it without a second mapping.
  nutrients: Record<string, number | null>;
  plants: string[];
};

function fmt(n: number | null): string {
  return n === null ? "—" : Math.round(n).toString();
}

// One nutrient chip, rounded the way the rest of the app rounds: sub-10 values
// keep a decimal so 0.2 g saturated fat doesn't read as 0.
function amount(v: number, unit: string): string {
  const rounded = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${rounded} ${unit}`;
}

function NutrientChips({ nutrients }: { nutrients: Record<string, number | null> }) {
  const keys = [...MACRO_METRIC_KEYS, ...MICRO_METRIC_KEYS];
  const shown = keys
    .map((k) => METRICS[k])
    .map((def) => ({ def, value: nutrients[def.field as keyof Totals as string] }))
    .filter((r): r is { def: (typeof METRICS)[keyof typeof METRICS]; value: number } =>
      typeof r.value === "number",
    );

  if (shown.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No nutrient detail stored — logging it once will fill this in.
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
      {shown.map(({ def, value }) => (
        <div key={def.key} className="flex items-baseline justify-between gap-2">
          <dt className="truncate text-xs text-muted-foreground">{def.label}</dt>
          <dd className="shrink-0 text-xs font-medium tabular-nums">
            {amount(value, def.unit)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SavedMealRow({
  item,
  busy,
  onAdd,
  onDelete,
}: {
  item: SavedMealItem;
  busy: boolean;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [err, setErr] = useState<string | null>(null);
  const [saving, startRename] = useTransition();

  function submitRename() {
    const next = label.trim();
    if (!next) {
      setErr("Give it a name");
      return;
    }
    setErr(null);
    startRename(async () => {
      const r = await renameSavedMeal(item.id, next);
      if (!r.ok) {
        setErr(r.error ?? "Rename failed");
        return;
      }
      setRenaming(false);
      router.refresh();
    });
  }

  const protein = item.nutrients.protein_g;

  return (
    <div className="p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Hide details" : "Show what's in this meal"}
          className="min-w-0 flex-1 text-left"
        >
          <p className="flex items-center gap-1 truncate text-sm font-medium">
            {item.label}
            <ChevronDown
              className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {fmt(item.calories)} kcal · P {fmt(protein ?? null)}
            {item.serving_size ? ` · ${item.serving_size}` : ""}
          </p>
        </button>
        {busy ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <Button type="button" size="sm" onClick={onAdd}>
            + Log
          </Button>
        )}
        <button
          type="button"
          onClick={() => {
            setLabel(item.label);
            setRenaming(true);
            setOpen(true);
          }}
          aria-label="Rename saved meal"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete saved meal"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3">
          {renaming ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                maxLength={80}
                aria-label="Saved meal name"
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
              />
              <Button type="button" size="sm" onClick={submitRename} disabled={saving}>
                {saving ? "…" : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRenaming(false)}
              >
                Cancel
              </Button>
            </div>
          ) : null}
          {err ? <p className="text-xs text-destructive">{err}</p> : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What&apos;s in it
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{item.description}</p>
            {item.serving_size ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Portion: {item.serving_size}
              </p>
            ) : null}
          </div>

          <NutrientChips nutrients={item.nutrients} />

          {item.plants.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Plants: {item.plants.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SavedMeals({ items }: { items: SavedMealItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
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
    setPendingId(id);
    startTransition(async () => {
      await deleteSavedMeal(id);
      setPendingId(null);
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Saved meals
      </h2>
      <div className="divide-y rounded-lg border">
        {items.map((it) => (
          <SavedMealRow
            key={it.id}
            item={it}
            busy={pendingId === it.id}
            onAdd={() => add(it.id)}
            onDelete={() => remove(it.id)}
          />
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
