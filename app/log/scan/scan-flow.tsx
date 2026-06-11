"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import Link from "next/link";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, Loader2 } from "lucide-react";
import {
  lookupBarcode,
  runClaudeFallback,
  saveBarcodeEntry,
  type LookupResult,
  type SaveState,
} from "./actions";
import type { OffNutrition } from "@/lib/openfoodfacts";
import type { Meal } from "@/lib/types";
import { defaultMeal, MEALS } from "@/lib/food";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Stage =
  | { kind: "scanning" }
  | { kind: "looking-up"; barcode: string }
  | { kind: "not-found"; barcode: string; fallbackError?: string }
  | {
      kind: "confirming";
      barcode: string;
      source: "openfoodfacts" | "claude";
      data: OffNutrition;
    }
  | { kind: "error"; barcode: string; error: string };

const SCANNER_DIV_ID = "kcal-pal-scanner";

function Viewfinder({ onScan }: { onScan: (code: string) => void }) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_DIV_ID, { verbose: false });

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          // Wide & short box matches 1D barcodes on packaging.
          qrbox: (vw, vh) => {
            const w = Math.min(320, Math.floor(vw * 0.85));
            const h = Math.max(80, Math.floor(vh * 0.25));
            return { width: w, height: h };
          },
          aspectRatio: 1.333,
        },
        (decoded) => {
          if (cancelled) return;
          cancelled = true;
          scanner.stop().catch(() => {});
          onScanRef.current(decoded);
        },
        () => {
          // Per-frame "no code found" — silent.
        },
      )
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Camera failed to start.";
        setError(msg);
      });

    return () => {
      cancelled = true;
      scanner
        .stop()
        .catch(() => {})
        .finally(() => scanner.clear());
    };
  }, []);

  if (error) {
    return (
      <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">Camera couldn&apos;t start</p>
        <p className="text-muted-foreground">{error}</p>
        <p className="text-muted-foreground">
          On iPhone, make sure you opened this in Safari (not from a link
          preview) and granted camera permission. PWA install lets the camera
          start without re-prompting.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        id={SCANNER_DIV_ID}
        className="overflow-hidden rounded-lg border bg-black"
      />
      <p className="text-center text-xs text-muted-foreground">
        Point at the barcode. Holds steady, good light.
      </p>
    </div>
  );
}

function MealPicker({ defaultMeal: dm }: { defaultMeal: Meal }) {
  return (
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
              defaultChecked={m === dm}
              className="sr-only"
            />
            {m}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MacroField({
  name,
  label,
  value,
  step = "any",
}: {
  name: string;
  label: string;
  value: number | null;
  step?: string;
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
        step={step}
        min="0"
        defaultValue={value ?? ""}
        className="h-9"
      />
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Save entry"}
    </Button>
  );
}

const saveInitial: SaveState = { ok: false };

function ConfirmForm({
  barcode,
  source,
  data,
  onCancel,
}: {
  barcode: string;
  source: "openfoodfacts" | "claude";
  data: OffNutrition;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(saveBarcodeEntry, saveInitial);

  useEffect(() => {
    if (state.ok) router.push("/today");
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="barcode" value={barcode} />

      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        <p className="font-mono">{barcode}</p>
        <p className="text-muted-foreground">
          {source === "openfoodfacts"
            ? "From OpenFoodFacts"
            : "Estimated by Claude (no OpenFoodFacts record)"}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Product</Label>
        <Textarea
          id="description"
          name="description"
          required
          rows={2}
          defaultValue={data.description}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="serving_size">Serving</Label>
        <Input
          id="serving_size"
          name="serving_size"
          defaultValue={data.serving_size ?? ""}
          placeholder={data.basis === "100g" ? "100g" : ""}
        />
        {data.basis === "100g" ? (
          <p className="text-xs text-muted-foreground">
            OpenFoodFacts didn&apos;t list a per-serving size — values shown are
            per 100g. Edit if you ate a different amount.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MacroField name="calories" label="kcal" value={data.calories} step="1" />
        <MacroField name="protein_g" label="Protein" value={data.protein_g} />
        <MacroField name="carbs_g" label="Carbs" value={data.carbs_g} />
        <MacroField name="fat_g" label="Fat" value={data.fat_g} />
        <MacroField name="fiber_g" label="Fiber" value={data.fiber_g} />
      </div>

      <MealPicker defaultMeal={defaultMeal()} />

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex gap-2">
        <SaveButton />
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function NotFoundForm({
  barcode,
  fallbackError,
  onCancel,
  onResolved,
}: {
  barcode: string;
  fallbackError?: string;
  onCancel: () => void;
  onResolved: (result: OffNutrition) => void;
}) {
  const [guess, setGuess] = useState("");
  const [error, setError] = useState<string | null>(fallbackError ?? null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await runClaudeFallback({ barcode, productGuess: guess });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onResolved(r.data);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        <p className="font-mono">{barcode}</p>
        <p className="text-muted-foreground">
          Not in OpenFoodFacts. Tell me what the product is and Claude will
          estimate.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="product-guess">Product</Label>
        <Textarea
          id="product-guess"
          required
          rows={2}
          placeholder="Chobani plain Greek yogurt, 5.3 oz cup"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          autoFocus
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? "Estimating…" : "Estimate with Claude"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ScanFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "scanning" });
  const [, startLookupTransition] = useTransition();

  function handleScan(barcode: string) {
    setStage({ kind: "looking-up", barcode });
    startLookupTransition(async () => {
      const r: LookupResult = await lookupBarcode(barcode);
      if (r.ok) {
        setStage({
          kind: "confirming",
          barcode: r.barcode,
          source: "openfoodfacts",
          data: r.data,
        });
      } else if (r.reason === "not_found") {
        setStage({ kind: "not-found", barcode: r.barcode });
      } else {
        setStage({ kind: "error", barcode: r.barcode, error: r.error });
      }
    });
  }

  function resetToScanning() {
    setStage({ kind: "scanning" });
  }

  return (
    <div className="space-y-4">
      {stage.kind === "scanning" ? (
        <>
          <Viewfinder onScan={handleScan} />
          <div className="text-center">
            <Link
              href="/log"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Type it instead →
            </Link>
          </div>
        </>
      ) : null}

      {stage.kind === "looking-up" ? (
        <div className="space-y-3 rounded-lg border p-4 text-center">
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          <p className="font-mono text-sm">{stage.barcode}</p>
          <p className="text-xs text-muted-foreground">
            Looking up in OpenFoodFacts…
          </p>
        </div>
      ) : null}

      {stage.kind === "not-found" ? (
        <NotFoundForm
          barcode={stage.barcode}
          fallbackError={stage.fallbackError}
          onCancel={() => router.push("/today")}
          onResolved={(data) =>
            setStage({
              kind: "confirming",
              barcode: stage.barcode,
              source: "claude",
              data,
            })
          }
        />
      ) : null}

      {stage.kind === "confirming" ? (
        <ConfirmForm
          barcode={stage.barcode}
          source={stage.source}
          data={stage.data}
          onCancel={resetToScanning}
        />
      ) : null}

      {stage.kind === "error" ? (
        <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-mono">{stage.barcode}</p>
          <p className="text-destructive">{stage.error}</p>
          <Button onClick={resetToScanning} variant="outline" size="sm">
            <Camera className="mr-1 size-4" /> Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
