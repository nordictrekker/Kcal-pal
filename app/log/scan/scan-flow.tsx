"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import Link from "next/link";
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

// The 1D retail symbologies found on packaging — both scan paths use these.
const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];

// Minimal shape of the native BarcodeDetector API (not in the TS DOM lib yet).
type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]>;
};
type DetectorCtor = new (opts?: { formats?: string[] }) => NativeDetector;

// html5-qrcode often rejects with a plain string (not an Error), so pull the
// message out of whatever shape we're handed — otherwise the real reason
// (permission denied, no camera, camera in use…) gets swallowed.
function errMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.name ? `${e.name}: ${e.message}` : e.message;
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message?: unknown }).message);
  return "Camera failed to start.";
}

function isPermissionError(msg: string): boolean {
  return /denied|notallowed|permission/i.test(msg);
}

function Viewfinder({ onScan }: { onScan: (code: string) => void }) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // null until we know which path; "native" uses the phone's built-in detector
  // (instant, no WASM), "fallback" lazy-loads html5-qrcode only when needed.
  const [mode, setMode] = useState<"native" | "fallback" | null>(null);
  // Bumped by "Try again" so the whole start sequence re-runs (e.g. after the
  // user grants camera permission).
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let fallbackScanner: { stop: () => Promise<unknown>; clear: () => void } | null =
      null;
    setError(null);

    const stopNative = () => {
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };

    async function startNative(Ctor: DetectorCtor) {
      const detector = new Ctor({ formats: BARCODE_FORMATS });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch (e) {
        setError(errMsg(e));
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const tick = async () => {
        if (cancelled) return;
        try {
          const codes = await detector.detect(video);
          const value = codes?.[0]?.rawValue;
          if (value) {
            cancelled = true;
            stopNative();
            onScanRef.current(value);
            return;
          }
        } catch {
          // Transient decode errors between frames — keep going.
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    async function startFallback() {
      let mod: typeof import("html5-qrcode");
      try {
        mod = await import("html5-qrcode");
      } catch (e) {
        setError(errMsg(e));
        return;
      }
      if (cancelled) return;
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod;

      // The mount point only exists once `mode` flips to "fallback"; on a retry
      // the cached import resolves before that render commits, so wait a frame.
      if (!document.getElementById(SCANNER_DIV_ID)) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      if (cancelled) return;

      let scanner: InstanceType<typeof Html5Qrcode>;
      try {
        scanner = new Html5Qrcode(SCANNER_DIV_ID, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
          ],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
      } catch (e: unknown) {
        setError(errMsg(e));
        return;
      }
      fallbackScanner = scanner;

      const onDecode = (decoded: string) => {
        if (cancelled) return;
        cancelled = true;
        scanner.stop().catch(() => {});
        onScanRef.current(decoded);
      };

      // Plain environment-facing request — no resolution/focus constraints, which
      // some iOS Safari versions reject outright. disableFlip + a lower fps (both
      // scan-config flags, not media constraints) keep the WASM decode cheap.
      scanner
        .start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (vw, vh) => {
              const w = Math.min(320, Math.floor(vw * 0.85));
              const h = Math.max(80, Math.floor(vh * 0.25));
              return { width: w, height: h };
            },
            aspectRatio: 1.333,
            disableFlip: true,
          },
          onDecode,
          () => {},
        )
        .catch((e: unknown) => {
          if (!cancelled) setError(errMsg(e));
        });
    }

    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor })
      .BarcodeDetector;
    if (Ctor) {
      setMode("native");
      startNative(Ctor);
    } else {
      setMode("fallback");
      startFallback();
    }

    return () => {
      cancelled = true;
      stopNative();
      try {
        fallbackScanner
          ?.stop()
          .catch(() => {})
          .finally(() => fallbackScanner?.clear());
      } catch {
        // Already stopped / never started.
      }
    };
  }, [retryKey]);

  if (error) {
    const perm = isPermissionError(error);
    return (
      <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">Camera couldn&apos;t start</p>
        <p className="break-words text-muted-foreground">{error}</p>
        <p className="text-muted-foreground">
          {perm
            ? "Safari is blocking the camera. Tap the “aA” menu (or ⋯) in the address bar → Website Settings → Camera → Allow, then tap Try again."
            : "On iPhone, open this in Safari (not a link preview) and allow camera access. If another app is using the camera, close it first, then Try again."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRetryKey((k) => k + 1)}
        >
          <Camera className="mr-1 size-4" /> Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mode === "native" ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-[4/3] w-full rounded-lg border bg-black object-cover"
        />
      ) : (
        <div
          id={SCANNER_DIV_ID}
          className="overflow-hidden rounded-lg border bg-black"
        />
      )}
      <p className="text-center text-xs text-muted-foreground">
        {mode === null
          ? "Starting camera…"
          : "Point at the barcode. Hold steady, good light."}
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

function NumberField({
  name,
  label,
  value,
  onChange,
  step = "any",
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9"
      />
    </div>
  );
}

type Macros = {
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
};

const MACRO_KEYS: (keyof Macros)[] = [
  "calories", "protein_g", "carbs_g", "fat_g", "fiber_g",
];

function fmt(n: number | null, decimals: number): string {
  if (n === null || !Number.isFinite(n)) return "";
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f);
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
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

type Unit = "g" | "serving";

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

  const hasGramMath = data.perGram != null;
  const servingGrams = data.servingGrams;

  // Default portion: one labeled serving when we know it, else 100 g when we
  // have per-gram data, else a 1× serving multiplier of the looked-up values.
  const [unit, setUnit] = useState<Unit>(
    servingGrams ? "serving" : hasGramMath ? "g" : "serving",
  );
  const [amount, setAmount] = useState<string>(
    servingGrams ? "1" : hasGramMath ? "100" : "1",
  );

  // Compute the macros for a chosen portion. With per-gram data we scale by
  // grams; otherwise we scale the looked-up serving values by a serving count.
  const computeMacros = useCallback(
    (amountStr: string, u: Unit): Macros => {
      const a = Number(amountStr);
      const amt = Number.isFinite(a) && a >= 0 ? a : 0;
      const grams = u === "g" ? amt : servingGrams != null ? amt * servingGrams : null;

      if (hasGramMath && grams != null && data.perGram) {
        const g = data.perGram;
        return {
          calories: fmt(g.calories != null ? g.calories * grams : null, 0),
          protein_g: fmt(g.protein_g != null ? g.protein_g * grams : null, 1),
          carbs_g: fmt(g.carbs_g != null ? g.carbs_g * grams : null, 1),
          fat_g: fmt(g.fat_g != null ? g.fat_g * grams : null, 1),
          fiber_g: fmt(g.fiber_g != null ? g.fiber_g * grams : null, 1),
        };
      }
      // No gram data → scale the looked-up (one-serving) values by serving count.
      const s = (v: number | null, d: number) => fmt(v != null ? v * amt : null, d);
      return {
        calories: s(data.calories, 0),
        protein_g: s(data.protein_g, 1),
        carbs_g: s(data.carbs_g, 1),
        fat_g: s(data.fat_g, 1),
        fiber_g: s(data.fiber_g, 1),
      };
    },
    [hasGramMath, servingGrams, data],
  );

  // Macros recompute when the portion changes, but stay editable for manual
  // fine-tuning (a tweak persists until the portion is changed again).
  const [macros, setMacros] = useState<Macros>(() => computeMacros(amount, unit));
  useEffect(() => {
    setMacros(computeMacros(amount, unit));
  }, [amount, unit, computeMacros]);

  // A human-readable serving label stored alongside the entry.
  const servingLabel = useMemo(() => {
    const a = Number(amount);
    const amt = Number.isFinite(a) ? a : 0;
    if (unit === "g") return `${trimNum(amt)} g`;
    const plural = amt === 1 ? "" : "s";
    return servingGrams != null
      ? `${trimNum(amt)} serving${plural} (${Math.round(amt * servingGrams)} g)`
      : `${trimNum(amt)} serving${plural}`;
  }, [amount, unit, servingGrams]);

  useEffect(() => {
    if (state.ok) router.push("/today");
  }, [state.ok, router]);

  function preset(u: Unit, a: number) {
    setUnit(u);
    setAmount(trimNum(a));
  }

  const presets: { label: string; unit: Unit; amount: number }[] = servingGrams
    ? [
        { label: "1 serving", unit: "serving", amount: 1 },
        { label: "½ serving", unit: "serving", amount: 0.5 },
        { label: "2 servings", unit: "serving", amount: 2 },
        { label: "100 g", unit: "g", amount: 100 },
      ]
    : hasGramMath
      ? [
          { label: "100 g", unit: "g", amount: 100 },
          { label: "50 g", unit: "g", amount: 50 },
          { label: "25 g", unit: "g", amount: 25 },
          { label: "10 g", unit: "g", amount: 10 },
        ]
      : [
          { label: "½ serving", unit: "serving", amount: 0.5 },
          { label: "1 serving", unit: "serving", amount: 1 },
          { label: "2 servings", unit: "serving", amount: 2 },
        ];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="barcode" value={barcode} />
      <input type="hidden" name="serving_size" value={servingLabel} />

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

      {/* Portion editor — macros below recalculate live as you change this. */}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <Label>How much did you eat?</Label>
          {hasGramMath && servingGrams ? (
            <div className="flex overflow-hidden rounded-md border text-xs">
              <button
                type="button"
                onClick={() => setUnit("serving")}
                className={cn("px-2 py-1", unit === "serving" && "bg-primary text-primary-foreground")}
              >
                servings
              </button>
              <button
                type="button"
                onClick={() => setUnit("g")}
                className={cn("px-2 py-1", unit === "g" && "bg-primary text-primary-foreground")}
              >
                grams
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9 w-24"
          />
          <span className="text-sm text-muted-foreground">
            {unit === "g"
              ? "grams"
              : servingGrams != null
                ? `serving${Number(amount) === 1 ? "" : "s"} · ${servingGrams} g each`
                : `serving${Number(amount) === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => preset(p.unit, p.amount)}
              className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
        {!hasGramMath ? (
          <p className="text-[11px] text-muted-foreground">
            No gram data for this product — adjust by servings.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MACRO_KEYS.map((k) => (
          <NumberField
            key={k}
            name={k}
            label={k === "calories" ? "kcal" : k.replace("_g", "").replace(/^\w/, (c) => c.toUpperCase())}
            value={macros[k]}
            step={k === "calories" ? "1" : "any"}
            onChange={(v) => setMacros((m) => ({ ...m, [k]: v }))}
          />
        ))}
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
