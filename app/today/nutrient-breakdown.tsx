"use client";

import { useState } from "react";
import { ChevronDown, ChartPie, List } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  contributionsForField,
  topWithOther,
  type ContribEntry,
  type Contribution,
} from "@/lib/contributions";

function round(n: number) {
  return Math.round(n);
}

// Compact amount: one decimal under 10 (so 4.2 mg reads), whole numbers above.
function fmtAmount(n: number, unit: string) {
  const v = n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return `${v}${unit}`;
}

// Opacity ramp so every slice is the same hue as the nutrient — a cohesive,
// mono-color wheel rather than a clashing rainbow.
function sliceOpacity(i: number, n: number) {
  if (n <= 1) return 1;
  return 1 - (i / n) * 0.62;
}

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
}

function Donut({
  slices,
  total,
  colorVar,
}: {
  slices: Contribution[];
  total: number;
  colorVar: string;
}) {
  const R = 52;
  const r = 33;
  const color = `var(${colorVar})`;

  // Single contributor → a clean full ring (arc math degenerates at 360°).
  if (slices.length === 1) {
    return (
      <svg viewBox="0 0 120 120" className="size-32 shrink-0" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={(R + r) / 2}
          fill="none"
          stroke={color}
          strokeWidth={R - r}
        />
      </svg>
    );
  }

  let acc = 0;
  return (
    <svg viewBox="0 0 120 120" className="size-32 shrink-0" aria-hidden>
      {slices.map((s, i) => {
        const a0 = (acc / total) * 360;
        acc += s.amount;
        const a1 = (acc / total) * 360;
        const large = a1 - a0 > 180 ? 1 : 0;
        const [x0, y0] = polar(R, a0);
        const [x1, y1] = polar(R, a1);
        const [x2, y2] = polar(r, a1);
        const [x3, y3] = polar(r, a0);
        const d = `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`;
        return (
          <path
            key={s.id}
            d={d}
            fill={color}
            fillOpacity={sliceOpacity(i, slices.length)}
            stroke="var(--card)"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}

function Legend({
  slices,
  total,
  colorVar,
  view,
  unit,
}: {
  slices: Contribution[];
  total: number;
  colorVar: string;
  view: "pie" | "table";
  unit: string;
}) {
  return (
    <ul className="min-w-0 flex-1 space-y-1.5">
      {slices.map((s, i) => {
        const pct = Math.round((s.amount / total) * 100);
        return (
          <li key={s.id} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{
                background: `var(${colorVar})`,
                opacity: sliceOpacity(i, slices.length),
              }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {s.label}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {view === "pie" ? `${pct}%` : fmtAmount(s.amount, unit)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// One nutrient row that expands to reveal which logged foods contributed to it.
// Defaults to a percentage pie; toggles to an exact-amount table/bar view.
export function NutrientBreakdown({
  label,
  value,
  target,
  unit,
  kind,
  colorVar,
  field,
  entries,
  weekly = false,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  kind: "goal" | "limit";
  colorVar: string;
  field: string;
  entries: ContribEntry[];
  // Weekly mode: table-only, showing the top 5 contributing foods for the week
  // (merged across days) rather than a per-day pie.
  weekly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"pie" | "table">("pie");
  const effectiveView = weekly ? "table" : view;

  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  const fill = kind === "limit" && over ? "var(--destructive)" : `var(${colorVar})`;

  const all = contributionsForField(field, entries);
  const total = all.reduce((s, c) => s + c.amount, 0);
  const slices = weekly ? all.slice(0, 5) : topWithOther(all);
  const maxAmount = slices.reduce((m, s) => Math.max(m, s.amount), 0);
  const period = weekly ? "this week" : "yet today";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full space-y-1 text-left"
      >
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 font-medium">
            {label}
            <ChevronDown
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </span>
          <span className="tabular-nums text-muted-foreground">
            {round(value)}
            {unit} / {round(target)}
            {unit}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: fill }}
          />
        </div>
      </button>

      {open ? (
        <div className="rounded-lg border bg-muted/20 p-3">
          {total <= 0 ? (
            <p className="text-xs text-muted-foreground">
              No tracked {label.toLowerCase()} contributors {period}.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  What contributed to {label.toLowerCase()}
                  {weekly ? " this week" : ""}
                </p>
                {weekly ? null : (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setView("pie")}
                      aria-label="Percentage pie"
                      aria-pressed={view === "pie"}
                      className={cn(
                        "rounded-md p-1.5 text-muted-foreground hover:bg-accent",
                        view === "pie" && "bg-accent text-foreground",
                      )}
                    >
                      <ChartPie className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("table")}
                      aria-label="Exact amounts"
                      aria-pressed={view === "table"}
                      className={cn(
                        "rounded-md p-1.5 text-muted-foreground hover:bg-accent",
                        view === "table" && "bg-accent text-foreground",
                      )}
                    >
                      <List className="size-4" />
                    </button>
                  </div>
                )}
              </div>

              {effectiveView === "pie" ? (
                <div className="flex items-center gap-4">
                  <Donut slices={slices} total={total} colorVar={colorVar} />
                  <Legend
                    slices={slices}
                    total={total}
                    colorVar={colorVar}
                    view="pie"
                    unit={unit}
                  />
                </div>
              ) : (
                <ul className="space-y-2">
                  {slices.map((s, i) => (
                    <li key={s.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {s.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {fmtAmount(s.amount, unit)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${maxAmount > 0 ? (s.amount / maxAmount) * 100 : 0}%`,
                            background: `var(${colorVar})`,
                            opacity: sliceOpacity(i, slices.length),
                          }}
                        />
                      </div>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-2 border-t pt-2 text-xs font-medium">
                    <span>Total</span>
                    <span className="tabular-nums">{fmtAmount(total, unit)}</span>
                  </li>
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
