"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, ExternalLink, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logRecipeServing, deleteRecipe } from "./actions";

export type RecipeRow = {
  id: string;
  name: string;
  source_url: string | null;
  servings: number;
  serving_size: string | null;
  calories_per_serving: number;
  protein_g_per_serving: number;
  carbs_g_per_serving: number;
  fat_g_per_serving: number;
  fiber_g_per_serving: number;
  use_count: number;
  last_used_at: string | null;
};

function round(n: number) {
  return Math.round(n);
}

function RecipeCard({ r }: { r: RecipeRow }) {
  const [servings, setServings] = useState(1);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const scale = servings;
  const cal = round(r.calories_per_serving * scale);
  const pro = round(r.protein_g_per_serving * scale);
  const carb = round(r.carbs_g_per_serving * scale);
  const fat = round(r.fat_g_per_serving * scale);

  function log() {
    setError(null);
    const fd = new FormData();
    fd.set("id", r.id);
    fd.set("servings", String(servings));
    start(async () => {
      const res = await logRecipeServing(fd);
      if (!res.ok) setError(res.error ?? "Couldn't log.");
    });
  }

  function remove() {
    if (!confirm(`Delete "${r.name}"?`)) return;
    const fd = new FormData();
    fd.set("id", r.id);
    start(async () => {
      await deleteRecipe(fd);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="font-serif text-lg font-medium leading-tight">
              {r.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {round(r.calories_per_serving)} kcal · {round(r.protein_g_per_serving)}P{" "}
              · {round(r.carbs_g_per_serving)}C · {round(r.fat_g_per_serving)}F
              {r.serving_size ? ` · ${r.serving_size}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {r.source_url ? (
              <a
                href={r.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                aria-label="View source"
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              aria-label="Delete"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border px-1">
            <button
              type="button"
              onClick={() => setServings((s) => Math.max(0.5, s - 0.5))}
              className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Decrease servings"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-[3ch] text-center text-sm tabular-nums">
              {servings}
            </span>
            <button
              type="button"
              onClick={() => setServings((s) => Math.min(20, s + 0.5))}
              className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Increase servings"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            → {cal} kcal · {pro}P · {carb}C · {fat}F
          </span>
          <Button
            type="button"
            size="sm"
            onClick={log}
            disabled={pending}
            className="ml-auto"
          >
            {pending ? "…" : "Log"}
          </Button>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function RecipeList({ recipes }: { recipes: RecipeRow[] }) {
  if (recipes.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No recipes yet. Paste a link above to add your first one.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {recipes.map((r) => (
        <RecipeCard key={r.id} r={r} />
      ))}
    </div>
  );
}
