"use client";

import { useActionState, useEffect, useRef, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { logTextMeal, type LogState } from "./actions";
import { MEALS } from "@/lib/food";
import type { Meal } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initial: LogState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Analyzing…" : "Log it"}
    </Button>
  );
}

export function LogForm({
  defaultMeal,
  logDate,
  value,
  onValueChange,
  textareaRef,
}: {
  defaultMeal: Meal;
  logDate?: string | null;
  // When provided, the description field is controlled by the parent (so the
  // pantry chips can fill it). Otherwise the field is plain/uncontrolled.
  value?: string;
  onValueChange?: (v: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const [state, formAction] = useActionState(logTextMeal, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const controlled = value !== undefined && onValueChange !== undefined;

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      if (controlled) onValueChange?.("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {logDate ? <input type="hidden" name="date" value={logDate} /> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Meal</legend>
        <div className="grid grid-cols-4 gap-2">
          {MEALS.map((m) => (
            <label
              key={m}
              className={cn(
                "cursor-pointer rounded-md border px-2 py-2 text-center text-sm capitalize",
                "has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground",
              )}
            >
              <input
                type="radio"
                name="meal"
                value={m}
                defaultChecked={m === defaultMeal}
                className="sr-only"
              />
              {m}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="description">What did you eat?</Label>
        <AutoTextarea
          id="description"
          name="description"
          ref={textareaRef}
          required
          rows={3}
          placeholder="chicken burrito, no rice"
          {...(controlled
            ? { value, onChange: (e) => onValueChange?.(e.target.value) }
            : {})}
        />
      </div>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.ok && state.warning ? (
        <p className="text-sm text-destructive">{state.warning}</p>
      ) : null}
      {state.ok && !state.warning ? (
        <p className="text-sm text-green-600 dark:text-green-500">Logged.</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
