"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Trash2 } from "lucide-react";
import { updateEntry, deleteEntry, type EditState } from "./actions";
import { saveEntryAsTemplate } from "../log/saved-actions";
import { SaveEntryButton } from "../log/saved-meals";
import type { FoodEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: EditState = { ok: false };

function fmt(n: number | null) {
  return n === null ? "—" : Math.round(n).toString();
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function MacroField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number | null;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        defaultValue={value ?? ""}
        className="h-8"
      />
    </div>
  );
}

export function EntryRow({ entry }: { entry: FoodEntry }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateEntry, initial);

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  if (editing) {
    return (
      <form action={formAction} className="space-y-3 p-3">
        <input type="hidden" name="id" value={entry.id} />
        <p className="text-sm font-medium">{entry.description}</p>
        <div className="grid grid-cols-3 gap-2">
          <MacroField name="calories" label="kcal" value={entry.calories} />
          <MacroField name="protein_g" label="Protein" value={entry.protein_g} />
          <MacroField name="carbs_g" label="Carbs" value={entry.carbs_g} />
          <MacroField name="fat_g" label="Fat" value={entry.fat_g} />
          <MacroField name="fiber_g" label="Fiber" value={entry.fiber_g} />
        </div>
        {state.error ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}
        <div className="flex gap-2">
          <SaveButton />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  const missing = entry.calories === null;

  return (
    <div className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {entry.description}
          {entry.edited_by_user ? (
            <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
          ) : null}
        </p>
        {missing ? (
          <p className="text-xs text-destructive">Macros not parsed</p>
        ) : (
          <p className="text-xs tabular-nums text-muted-foreground">
            {fmt(entry.calories)} kcal · P {fmt(entry.protein_g)} · C{" "}
            {fmt(entry.carbs_g)} · F {fmt(entry.fat_g)} · Fib{" "}
            {fmt(entry.fiber_g)}
          </p>
        )}
      </div>
      <SaveEntryButton
        onSave={async (label) => {
          const r = await saveEntryAsTemplate(entry.id, label);
          if (!r.ok) throw new Error(r.error ?? "Save failed");
        }}
      />
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Edit"
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Pencil className="size-4" />
      </button>
      <form action={deleteEntry}>
        <input type="hidden" name="id" value={entry.id} />
        <button
          type="submit"
          aria-label="Delete"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </form>
    </div>
  );
}
