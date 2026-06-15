"use client";

import { useState, useTransition } from "react";
import { Link2, Sparkles } from "lucide-react";
import { importRecipeFromUrl, type RecipeResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ImportRecipeCard() {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RecipeResult | null>(null);

  function submit() {
    setResult(null);
    const fd = new FormData();
    fd.set("url", url);
    start(async () => {
      const r = await importRecipeFromUrl(fd);
      setResult(r);
      if (r.ok) setUrl("");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Import from URL</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url && submit()}
              placeholder="paste a recipe link"
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !url}
          >
            {pending ? "Parsing…" : "Add"}
          </Button>
        </div>
        {result?.ok ? (
          <p className="text-xs text-muted-foreground">
            Saved &ldquo;{result.name}&rdquo;.
          </p>
        ) : null}
        {result && !result.ok ? (
          <p className="text-xs text-destructive">{result.error}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          We&apos;ll fetch the page, ask Claude to extract the ingredients,
          and estimate per-serving nutrition. Takes ~10 seconds.
        </p>
      </CardContent>
    </Card>
  );
}
