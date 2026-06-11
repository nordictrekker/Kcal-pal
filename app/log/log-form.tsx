"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { logTextMeal, type LogState } from "./actions";
import { MEALS } from "@/lib/food";
import type { Meal } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

export function LogForm({ defaultMeal }: { defaultMeal: Meal }) {
  const [state, formAction] = useActionState(logTextMeal, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="description">What did you eat?</Label>
        <Textarea
          id="description"
          name="description"
          required
          rows={3}
          placeholder="chicken burrito, no rice"
          autoFocus
        />
      </div>

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
