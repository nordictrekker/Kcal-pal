"use client";

import { useState, useTransition } from "react";
import { Droplet, Wine, Minus, Plus } from "lucide-react";
import { logWater, undoLastWater, type WaterResult } from "./water-actions";
import {
  logAlcohol,
  undoLastAlcohol,
  type AlcoholResult,
} from "./alcohol-actions";
import {
  BEVERAGES,
  mlToOz,
  mlToL,
  formatDual,
  type BeverageKind,
} from "@/lib/hydration";
import {
  CONTAINERS,
  DRINKS,
  DRINK_ORDER,
  type ContainerId,
  type DrinkType,
} from "@/lib/alcohol";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PRESETS_OZ = [8, 16, 20];
const BEVERAGE_BUTTONS: BeverageKind[] = ["coffee", "tea", "shake"];

const PACE_LABEL: Record<string, { text: string; cls: string }> = {
  behind: { text: "A bit behind", cls: "text-[var(--macro-fat)]" },
  ontrack: { text: "On track", cls: "text-[var(--macro-fiber)]" },
  ahead: { text: "Ahead of pace", cls: "text-[var(--macro-fiber)]" },
  met: { text: "Goal met", cls: "text-[var(--macro-fiber)]" },
};

export function WaterCard({
  loggedMl,
  autoFluidMl,
  targetMl,
  goalNote,
  pace,
  alcohol,
}: {
  loggedMl: number;
  autoFluidMl: number;
  targetMl: number;
  goalNote?: string;
  // Time-of-day pace status (null in the early morning / when not meaningful).
  pace?: string | null;
  alcohol: { drinks: number; calories: number; count: number };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"water" | "alcohol">("water");

  const totalMl = loggedMl + autoFluidMl;
  const totalOz = mlToOz(totalMl);
  const targetOz = mlToOz(targetMl);
  const pct = targetMl > 0 ? Math.min(100, (totalMl / targetMl) * 100) : 0;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          {mode === "water" ? (
            <div className="flex items-baseline gap-2">
              <Droplet className="size-4 translate-y-0.5 text-muted-foreground" />
              <span className="text-sm font-medium">Water</span>
              <span className="font-serif text-2xl font-medium tabular-nums leading-none">
                {totalOz}
              </span>
              <span className="text-xs text-muted-foreground">
                / {targetOz} oz · {mlToL(totalMl).toFixed(1)}/
                {mlToL(targetMl).toFixed(1)} L
              </span>
              {pace && PACE_LABEL[pace] ? (
                <span className={`text-[11px] font-medium ${PACE_LABEL[pace].cls}`}>
                  · {PACE_LABEL[pace].text}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <Wine className="size-4 translate-y-0.5 text-muted-foreground" />
              <span className="text-sm font-medium">Alcohol</span>
              <span className="font-serif text-2xl font-medium tabular-nums leading-none">
                {alcohol.drinks.toFixed(alcohol.drinks % 1 === 0 ? 0 : 1)}
              </span>
              <span className="text-xs text-muted-foreground">
                {alcohol.drinks === 1 ? "drink" : "drinks"} · {alcohol.calories}{" "}
                kcal today
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode((m) => (m === "water" ? "alcohol" : "water"));
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label={mode === "water" ? "Log alcohol" : "Back to water"}
          >
            {mode === "water" ? (
              <Wine className="size-4" />
            ) : (
              <Droplet className="size-4" />
            )}
          </button>
        </div>

        {mode === "water" ? (
          <WaterMode
            totalOz={totalOz}
            targetOz={targetOz}
            pct={pct}
            autoFluidMl={autoFluidMl}
            loggedMl={loggedMl}
            goalNote={goalNote}
            pending={pending}
            onLog={(fields) => {
              setError(null);
              const fd = new FormData();
              for (const [k, v] of Object.entries(fields)) fd.set(k, v);
              start(async () => {
                const r: WaterResult = await logWater(fd);
                if (!r.ok) setError(r.error ?? "Couldn't log.");
              });
            }}
            onUndo={() => {
              setError(null);
              start(async () => {
                const r = await undoLastWater();
                if (!r.ok) setError(r.error ?? "Couldn't undo.");
              });
            }}
          />
        ) : (
          <AlcoholMode
            alcohol={alcohol}
            pending={pending}
            onLog={(drink, container, amount) => {
              setError(null);
              const fd = new FormData();
              fd.set("drink", drink);
              fd.set("container", container);
              fd.set("amount", String(amount));
              start(async () => {
                const r: AlcoholResult = await logAlcohol(fd);
                if (!r.ok) setError(r.error ?? "Couldn't log.");
              });
            }}
            onUndo={() => {
              setError(null);
              start(async () => {
                const r = await undoLastAlcohol();
                if (!r.ok) setError(r.error ?? "Couldn't undo.");
              });
            }}
          />
        )}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function WaterMode({
  totalOz,
  targetOz,
  pct,
  autoFluidMl,
  loggedMl,
  goalNote,
  pending,
  onLog,
  onUndo,
}: {
  totalOz: number;
  targetOz: number;
  pct: number;
  autoFluidMl: number;
  loggedMl: number;
  goalNote?: string;
  pending: boolean;
  onLog: (fields: Record<string, string>) => void;
  onUndo: () => void;
}) {
  const [when, setWhen] = useState<"now" | "earlier">("now");
  return (
    <>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        aria-label={`${totalOz} of ${targetOz} ounces`}
      >
        <div
          className="h-full rounded-full bg-[var(--macro-carbs)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {autoFluidMl > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Includes {formatDual(autoFluidMl)} from drinks logged with meals.
        </p>
      ) : null}

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Logging:</span>
        <div className="inline-flex overflow-hidden rounded-md border">
          {(["now", "earlier"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWhen(w)}
              className={cn(
                "px-2.5 py-1 transition-colors",
                when === w
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w === "now" ? "Just now" : "Earlier"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {PRESETS_OZ.map((oz) => (
          <Button
            key={oz}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onLog({ oz: String(oz), kind: "water", when })}
            disabled={pending}
            className="flex-1"
          >
            +{oz} oz
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        {BEVERAGE_BUTTONS.map((kind) => {
          const b = BEVERAGES[kind];
          return (
            <Button
              key={kind}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onLog({ ml: String(b.defaultMl), kind, when })}
              disabled={pending}
              className="flex-1 text-muted-foreground"
            >
              +{b.label} ({mlToOz(b.defaultMl)} oz)
            </Button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        {goalNote ? (
          <p className="text-[11px] text-muted-foreground">{goalNote}</p>
        ) : (
          <span />
        )}
        {loggedMl > 0 ? (
          <button
            type="button"
            onClick={onUndo}
            disabled={pending}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            Undo last
          </button>
        ) : null}
      </div>
    </>
  );
}

function AlcoholMode({
  alcohol,
  pending,
  onLog,
  onUndo,
}: {
  alcohol: { drinks: number; calories: number; count: number };
  pending: boolean;
  onLog: (drink: DrinkType, container: ContainerId, amount: number) => void;
  onUndo: () => void;
}) {
  const [container, setContainer] = useState<ContainerId>("glass");
  const [amount, setAmount] = useState(1);

  const step = 0.5;
  const dec = () => setAmount((a) => Math.max(step, Math.round((a - step) * 10) / 10));
  const inc = () => setAmount((a) => Math.min(20, Math.round((a + step) * 10) / 10));

  const fixed = CONTAINERS.find((c) => c.id === container)?.ml ?? null;
  const sizeLabel =
    container === "glass"
      ? `${amount % 1 === 0 ? amount : amount.toFixed(1)} glass`
      : fixed
        ? `≈ ${Math.round(fixed * amount)} ml`
        : `${Math.round(100 * amount)} ml`;

  return (
    <div className="space-y-3">
      {/* Section 1: amount + container */}
      <div className="space-y-2 rounded-md border p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dec}
              disabled={pending}
              aria-label="Less"
              className="rounded-md border p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-[2.5rem] text-center text-sm font-medium tabular-nums">
              {amount % 1 === 0 ? amount : amount.toFixed(1)}×
            </span>
            <button
              type="button"
              onClick={inc}
              disabled={pending}
              aria-label="More"
              className="rounded-md border p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground">{sizeLabel}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CONTAINERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setContainer(c.id)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                container === c.id
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: drink types */}
      <div className="grid grid-cols-2 gap-1.5">
        {DRINK_ORDER.map((d) => (
          <Button
            key={d}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onLog(d, container, amount)}
            className="justify-start"
          >
            + {DRINKS[d].label}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Calories count toward your day; raises your water goal. Estimates.
        </p>
        {alcohol.count > 0 ? (
          <button
            type="button"
            onClick={onUndo}
            disabled={pending}
            className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            Undo last
          </button>
        ) : null}
      </div>
    </div>
  );
}
