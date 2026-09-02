"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Pencil, Sparkles, Trash2 } from "lucide-react";
import { updateEntry, deleteEntry, reanalyzeEntry, type EditState } from "./actions";
import { saveEntryAsTemplate } from "../log/saved-actions";
import { SaveEntryButton } from "../log/saved-meals";
import type { FoodEntry } from "@/lib/types";
import { extractComponents } from "@/lib/food-items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  const [expanded, setExpanded] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [reanalyzing, startReanalyze] = useTransition();
  const [reError, setReError] = useState<string | null>(null);
  const [state, formAction] = useActionState(updateEntry, initial);
  const items = extractComponents(entry.raw_ai_response);
  const canExpand = items.length > 0;

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  function reanalyze() {
    setReError(null);
    startReanalyze(async () => {
      const r = await reanalyzeEntry(entry.id, desc);
      if (r.ok) setEditing(false);
      else setReError(r.error ?? "Couldn't re-analyze.");
    });
  }

  if (editing) {
    return (
      <form action={formAction} className="space-y-3 p-3">
        <input type="hidden" name="id" value={entry.id} />
        <div className="space-y-1">
          <Label htmlFor="description" className="text-xs text-muted-foreground">
            Description
          </Label>
          <Textarea
            id="description"
            name="description"
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Edit the wording, then Re-analyze to recalculate macros from the
            text — or adjust the numbers below by hand.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MacroField name="calories" label="kcal" value={entry.calories} />
          <MacroField name="protein_g" label="Protein" value={entry.protein_g} />
          <MacroField name="carbs_g" label="Carbs" value={entry.carbs_g} />
          <MacroField name="fat_g" label="Fat" value={entry.fat_g} />
          <MacroField name="fiber_g" label="Fiber" value={entry.fiber_g} />
        </div>
        {/* Micros collapsed by default — correct a wrong label estimate
            (e.g. a supplement's vitamin D) without cluttering the editor. */}
        <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Micronutrients
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <MacroField name="saturated_fat_g" label="Sat fat g" value={entry.saturated_fat_g} />
            <MacroField name="trans_fat_g" label="Trans fat g" value={entry.trans_fat_g} />
            <MacroField name="cholesterol_mg" label="Cholesterol mg" value={entry.cholesterol_mg} />
            <MacroField name="iron_mg" label="Iron mg" value={entry.iron_mg} />
            <MacroField name="calcium_mg" label="Calcium mg" value={entry.calcium_mg} />
            <MacroField name="magnesium_mg" label="Magnesium mg" value={entry.magnesium_mg} />
            <MacroField name="vitamin_d_mcg" label="Vit D µg" value={entry.vitamin_d_mcg} />
            <MacroField name="omega3_mg" label="Omega-3 mg" value={entry.omega3_mg} />
            <MacroField name="folate_mcg" label="Folate µg" value={entry.folate_mcg} />
            <MacroField name="choline_mg" label="Choline mg" value={entry.choline_mg} />
            <MacroField name="iodine_mcg" label="Iodine µg" value={entry.iodine_mcg} />
          </div>
        </details>
        {state.error || reError ? (
          <p className="text-xs text-destructive">{state.error ?? reError}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <SaveButton />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={reanalyzing}
            onClick={reanalyze}
          >
            <Sparkles className="mr-1 size-3.5" />
            {reanalyzing ? "Analyzing…" : "Re-analyze"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setDesc(entry.description);
              setReError(null);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  const missing = entry.calories === null;

  return (
    <div>
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => canExpand && setExpanded((v) => !v)}
          disabled={!canExpand}
          aria-expanded={canExpand ? expanded : undefined}
          aria-label={canExpand ? "Show breakdown" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        >
          {canExpand ? (
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {entry.description}
              {/* Barcode scans and saved meals carry the portion in
                  serving_size rather than in the description, so without this
                  the amount eaten is invisible on the log. */}
              {entry.serving_size &&
              !entry.description
                .toLowerCase()
                .includes(entry.serving_size.toLowerCase()) ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  · {entry.serving_size}
                </span>
              ) : null}
              {entry.edited_by_user ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  (edited)
                </span>
              ) : null}
            </span>
            {missing ? (
              <span className="block text-xs text-destructive">
                Macros not parsed
              </span>
            ) : (
              <span className="block text-xs tabular-nums text-muted-foreground">
                {fmt(entry.calories)} kcal · P {fmt(entry.protein_g)} · C{" "}
                {fmt(entry.carbs_g)} · F {fmt(entry.fat_g)} · Fib{" "}
                {fmt(entry.fiber_g)}
              </span>
            )}
          </span>
        </button>
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

      {canExpand && expanded ? (
        <ul className="space-y-1.5 border-t bg-muted/30 px-3 py-2.5 pl-9">
          {items.map((it, idx) => (
            <li key={idx} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-xs">
                {it.quantity ? (
                  <span className="text-muted-foreground">{it.quantity} </span>
                ) : null}
                {it.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {Math.round(it.calories)} kcal · P {Math.round(it.protein_g)} · C{" "}
                {Math.round(it.carbs_g)} · F {Math.round(it.fat_g)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
