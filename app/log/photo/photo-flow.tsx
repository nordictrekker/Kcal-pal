"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import {
  analyzePhoto,
  savePhotoEntry,
  type SaveState,
} from "./actions";
import type { Meal, ParsedNutrition } from "@/lib/types";
import { defaultMeal, MEALS } from "@/lib/food";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Stage =
  | { kind: "picking" }
  | { kind: "previewing"; file: File; previewUrl: string }
  | { kind: "analyzing"; file: File; previewUrl: string }
  | {
      kind: "confirming";
      previewUrl: string;
      photoPath: string;
      parsed: ParsedNutrition | null;
      parseError?: string;
    };

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
    <Button type="submit" className="flex-1" disabled={pending}>
      {pending ? "Saving…" : "Save entry"}
    </Button>
  );
}

const saveInitial: SaveState = { ok: false };

function ConfirmForm({
  previewUrl,
  photoPath,
  parsed,
  parseError,
  onCancel,
}: {
  previewUrl: string;
  photoPath: string;
  parsed: ParsedNutrition | null;
  parseError?: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(savePhotoEntry, saveInitial);

  useEffect(() => {
    if (state.ok) router.push("/today");
  }, [state.ok, router]);

  // Default description from items if Claude returned them, else empty.
  const defaultDescription = useMemo(() => {
    if (!parsed) return "";
    if (parsed.items.length > 0) {
      return parsed.items
        .map((i) => (i.quantity ? `${i.quantity} ${i.name}` : i.name))
        .join(", ");
    }
    return "";
  }, [parsed]);

  const confidencePct =
    parsed && typeof parsed.confidence === "number"
      ? Math.round(parsed.confidence * 100)
      : null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="photo_url" value={photoPath} />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl}
        alt="Meal preview"
        className="w-full rounded-lg border object-cover"
      />

      {parseError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-destructive">
            Couldn&apos;t auto-parse
          </p>
          <p className="text-muted-foreground">{parseError}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Photo is saved. Fill in the macros manually and save, or cancel.
          </p>
        </div>
      ) : null}

      {confidencePct !== null ? (
        <p className="text-xs text-muted-foreground">
          Claude confidence: <span className="tabular-nums">{confidencePct}%</span>
          {confidencePct < 50 ? " — check carefully" : null}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="description">What is it?</Label>
        <Textarea
          id="description"
          name="description"
          required
          rows={2}
          defaultValue={defaultDescription}
          placeholder="Describe the meal"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="serving_size">Serving</Label>
        <Input
          id="serving_size"
          name="serving_size"
          defaultValue={parsed?.serving_size ?? ""}
          placeholder="1 plate, 1 cup, etc."
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MacroField name="calories" label="kcal" value={parsed?.calories ?? null} step="1" />
        <MacroField name="protein_g" label="Protein" value={parsed?.protein_g ?? null} />
        <MacroField name="carbs_g" label="Carbs" value={parsed?.carbs_g ?? null} />
        <MacroField name="fat_g" label="Fat" value={parsed?.fat_g ?? null} />
        <MacroField name="fiber_g" label="Fiber" value={parsed?.fiber_g ?? null} />
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

// Downsample to a max long edge (1568px = Opus 4.6's vision ceiling) and
// re-encode as JPEG q=0.85 before upload. Reduces Claude vision cost
// roughly 8x for typical 4032x3024 iPhone photos, and shrinks what we
// store in Supabase Storage too. Returns the original file if the
// browser can't decode it (e.g. HEIC) — the server-side type guard will
// handle that case with a friendly message.
async function resizeImage(
  file: File,
  maxLongEdge = 1568,
  quality = 0.85,
): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= maxLongEdge) return file;

    const scale = maxLongEdge / longEdge;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

export function PhotoFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "picking" });
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Tear down object URLs when we leave a stage that owns one.
  useEffect(() => {
    return () => {
      if (stage.kind !== "picking") {
        URL.revokeObjectURL(stage.previewUrl);
      }
    };
  }, [stage]);

  function onFile(file: File | null | undefined) {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setStage({ kind: "previewing", file, previewUrl });
  }

  function analyze() {
    if (stage.kind !== "previewing") return;
    setStage({ ...stage, kind: "analyzing" });
    startTransition(async () => {
      // Resize before upload: Opus tops out at 1568px on the long edge
      // for vision, so anything bigger is wasted tokens (~8x cost cut).
      const resized = await resizeImage(stage.file);
      const fd = new FormData();
      fd.append("photo", resized);
      const r = await analyzePhoto(fd);
      if (r.ok) {
        setStage({
          kind: "confirming",
          previewUrl: stage.previewUrl,
          photoPath: r.photo_path,
          parsed: r.parsed,
        });
      } else if (r.photo_path) {
        // Upload succeeded but parsing failed — let user fill in manually.
        setStage({
          kind: "confirming",
          previewUrl: stage.previewUrl,
          photoPath: r.photo_path,
          parsed: null,
          parseError: r.error,
        });
      } else {
        // Upload itself failed — show error, let them retry from preview.
        setStage({ ...stage, kind: "previewing" });
        alert(r.error);
      }
    });
  }

  function reset() {
    setStage({ kind: "picking" });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  if (stage.kind === "picking") {
    return (
      <div className="space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/40 text-secondary-foreground hover:bg-secondary"
        >
          <Camera className="size-8" />
          <span className="font-medium">Take photo</span>
        </button>
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md border text-sm text-muted-foreground hover:bg-accent"
        >
          <ImagePlus className="size-4" />
          Pick from library
        </button>
        <div className="text-center">
          <Link
            href="/log"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Type it instead →
          </Link>
        </div>
      </div>
    );
  }

  if (stage.kind === "previewing" || stage.kind === "analyzing") {
    const analyzing = stage.kind === "analyzing" || pending;
    return (
      <div className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={stage.previewUrl}
          alt="Selected meal"
          className="w-full rounded-lg border object-cover"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={analyze}
            className="flex-1"
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" /> Analyzing…
              </>
            ) : (
              "Analyze with Claude"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={reset}
            disabled={analyzing}
          >
            Cancel
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Vision is less reliable than text — you&apos;ll confirm before saving.
        </p>
      </div>
    );
  }

  return (
    <ConfirmForm
      previewUrl={stage.previewUrl}
      photoPath={stage.photoPath}
      parsed={stage.parsed}
      parseError={stage.parseError}
      onCancel={() => router.push("/today")}
    />
  );
}
