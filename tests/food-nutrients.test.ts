import { describe, it, expect } from "vitest";
import { sumTotals, selectRelevantHistory, nutrientColumns } from "@/lib/food";
import { extractComponents } from "@/lib/food-items";
import {
  sanitizeMetricKeys,
  metricValueAndTarget,
  METRICS,
  DEFAULT_HOME_METRICS,
} from "@/lib/nutrients";
import { evidenceFor } from "@/lib/insights";
import type { ParsedNutrition } from "@/lib/types";

describe("sumTotals", () => {
  it("sums macros and micros, treating null as 0", () => {
    const t = sumTotals([
      { calories: 100, protein_g: 10, carbs_g: 20, fat_g: 5, fiber_g: 2, iron_mg: 3 },
      { calories: 200, protein_g: null, carbs_g: 30, fat_g: 10, fiber_g: 4, iron_mg: 1 },
    ]);
    expect(t.calories).toBe(300);
    expect(t.protein_g).toBe(10);
    expect(t.iron_mg).toBe(4);
  });
});

describe("selectRelevantHistory", () => {
  const entries = [
    { description: "double espresso", serving_size: "60ml", calories: 6, protein_g: 0, carbs_g: 1, fat_g: 0, edited_by_user: true },
    { description: "grilled salmon and rice", serving_size: null, calories: 600, protein_g: 40, carbs_g: 50, fat_g: 20, edited_by_user: false },
    { description: "single espresso", serving_size: "30ml", calories: 3, protein_g: 0, carbs_g: 0, fat_g: 0, edited_by_user: false },
  ];
  it("returns entries sharing significant words, corrections first", () => {
    const out = selectRelevantHistory("morning espresso", entries);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.description.includes("espresso"))).toBe(true);
    expect(out[0].edited_by_user).toBe(true); // corrected entry ranks first
  });
  it("returns nothing when no words overlap", () => {
    expect(selectRelevantHistory("banana", entries)).toHaveLength(0);
  });
});

describe("nutrientColumns", () => {
  it("maps a parse to DB columns", () => {
    const d = {
      calories: 100, protein_g: 10, carbs_g: 20, fat_g: 5, fiber_g: 2,
      saturated_fat_g: 1, cholesterol_mg: 30, iron_mg: 2, calcium_mg: 100,
      magnesium_mg: 40, vitamin_d_mcg: 1, omega3_mg: 200, plants: ["oat"],
      serving_size: "", items: [], assumptions: [],
    } as ParsedNutrition;
    const cols = nutrientColumns(d);
    expect(cols.cholesterol_mg).toBe(30);
    expect(cols.plants).toEqual(["oat"]);
    expect(cols.serving_size).toBeNull(); // empty string → null
  });
});

describe("extractComponents", () => {
  it("parses items out of the Anthropic envelope", () => {
    const envelope = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            items: [
              { name: "Egg", quantity: "1", calories: 70, protein_g: 6, carbs_g: 0, fat_g: 5 },
            ],
          }),
        },
      ],
    };
    const items = extractComponents(envelope);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Egg");
    expect(items[0].calories).toBe(70);
  });
  it("parses a direct parsed object", () => {
    const items = extractComponents({ items: [{ name: "Toast", calories: 120 }] });
    expect(items[0].name).toBe("Toast");
  });
  it("returns empty for junk", () => {
    expect(extractComponents(null)).toHaveLength(0);
    expect(extractComponents({ foo: "bar" })).toHaveLength(0);
  });
});

describe("nutrients registry", () => {
  it("sanitizes metric keys with a default fallback", () => {
    expect(sanitizeMetricKeys(["protein", "bogus", "iron"])).toEqual(["protein", "iron"]);
    expect(sanitizeMetricKeys(null)).toEqual(DEFAULT_HOME_METRICS);
    expect(sanitizeMetricKeys([])).toEqual(DEFAULT_HOME_METRICS);
  });
  it("personalized macros pull target from targets, micros use reference", () => {
    const totals = { calories: 0, protein_g: 50, carbs_g: 0, fat_g: 0, fiber_g: 0, iron_mg: 9 };
    const targets = { calories: 2000, protein_g: 120, carbs_g: 200, fat_g: 60, fiber_g: 30 };
    const p = metricValueAndTarget(METRICS.protein, totals, targets);
    expect(p).toEqual({ value: 50, target: 120 });
    const iron = metricValueAndTarget(METRICS.iron, totals, targets);
    expect(iron.value).toBe(9);
    expect(iron.target).toBe(METRICS.iron.reference);
  });

  it("uses male RDA references when sex is male", () => {
    const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, iron_mg: 8, magnesium_mg: 400, omega3_mg: 1200, choline_mg: 500 } as never;
    const targets = { calories: 2000, protein_g: 130, carbs_g: 220, fat_g: 70, fiber_g: 30 } as never;
    expect(metricValueAndTarget(METRICS.iron, totals, targets, "male").target).toBe(8);
    expect(metricValueAndTarget(METRICS.iron, totals, targets, "female").target).toBe(18);
    expect(metricValueAndTarget(METRICS.iron, totals, targets).target).toBe(18);
    expect(metricValueAndTarget(METRICS.magnesium, totals, targets, "male").target).toBe(420);
    expect(metricValueAndTarget(METRICS.choline, totals, targets, "male").target).toBe(550);
    expect(metricValueAndTarget(METRICS.omega3, totals, targets, "male").target).toBe(1600);
    // Sex-invariant references unchanged.
    expect(metricValueAndTarget(METRICS.calcium, totals, targets, "male").target).toBe(1000);
    expect(metricValueAndTarget(METRICS.folate, totals, targets, "male").target).toBe(400);
  });
});

describe("evidenceFor", () => {
  it("flags cycle claims as emerging and physiology as established", () => {
    expect(evidenceFor("luteal_carb_pattern")).toBe("emerging");
    expect(evidenceFor("hydration_today_behind")).toBe("established");
    expect(evidenceFor("weekend_permission")).toBeUndefined();
  });
});
