import { describe, it, expect } from "vitest";
import {
  toEditableItems,
  scaleItem,
  totalsFromItems,
  descriptionFromItems,
  plantsFromItems,
  formatMultiplier,
  PORTION_STEPS,
} from "@/lib/photo-items";
import type { ParsedItem } from "@/lib/types";

const plate: ParsedItem[] = [
  {
    name: "white rice", quantity: "1 cup", grams: 158,
    calories: 205, protein_g: 4.3, carbs_g: 45, fat_g: 0.4,
    fiber_g: 0.6, saturated_fat_g: 0.1, cholesterol_mg: 0, iron_mg: 1.9,
  },
  {
    name: "grilled salmon", quantity: "1 fillet", grams: 120,
    calories: 233, protein_g: 25, carbs_g: 0, fat_g: 14,
    fiber_g: 0, saturated_fat_g: 3.1, cholesterol_mg: 63, iron_mg: 0.5,
  },
];

describe("per-component portion adjustment", () => {
  it("totals equal the sum of the parts when nothing is touched", () => {
    const t = totalsFromItems(toEditableItems(plate));
    expect(t.calories).toBe(438);
    // Totals >= 10 round to whole numbers (4.3 + 25 = 29.3 -> 29), matching how
    // the rest of the app displays them; sub-10 values keep a decimal so small
    // micronutrient amounts don't vanish.
    expect(t.protein_g).toBe(29);
    expect(t.fat_g).toBe(14); // 0.4 + 14 = 14.4 -> 14
    expect(t.cholesterol_mg).toBe(63);
  });

  it("halving one component halves only that component's contribution", () => {
    const items = toEditableItems(plate);
    items[0].multiplier = 0.5; // half the rice
    const t = totalsFromItems(items);
    // 205/2 + 233 = 335.5 -> 336 (>=10 rounds to integer)
    expect(t.calories).toBe(336);
    // Salmon's cholesterol is untouched; rice contributes none either way.
    expect(t.cholesterol_mg).toBe(63);
    expect(t.carbs_g).toBe(23); // 45/2 = 22.5 -> 23
  });

  it("removing a component drops it from totals, description and plants", () => {
    const items = toEditableItems(plate);
    items[1].removed = true; // no salmon
    const t = totalsFromItems(items);
    expect(t.calories).toBe(205);
    expect(t.cholesterol_mg).toBe(0);
    expect(descriptionFromItems(items)).toBe("1 cup white rice");
    expect(plantsFromItems(items, ["rice", "salmon"])).toEqual(["rice"]);
  });

  it("scales micronutrients too, not just macros", () => {
    // The old form posted the model's whole-meal micros regardless of any
    // edit, so a halved plate still logged full iron.
    const items = toEditableItems(plate);
    items[1].multiplier = 0.5;
    const t = totalsFromItems(items);
    expect(t.iron_mg).toBe(2.2); // 1.9 + 0.25
    expect(t.saturated_fat_g).toBe(1.7); // 0.1 + 1.55
  });

  it("a scaled item carries adjusted grams and an honest quantity", () => {
    const items = toEditableItems(plate);
    items[0].multiplier = 2;
    const scaled = scaleItem(items[0]);
    expect(scaled.calories).toBe(410);
    expect(scaled.grams).toBe(316);
    expect(scaled.quantity).toBe("2× 1 cup");
    // Internal bookkeeping must not leak into what gets stored.
    expect((scaled as Record<string, unknown>).multiplier).toBeUndefined();
    expect((scaled as Record<string, unknown>).removed).toBeUndefined();
    expect((scaled as Record<string, unknown>).key).toBeUndefined();
  });

  it("leaves absent fields absent rather than inventing zeros", () => {
    const sparse = toEditableItems([
      { name: "mystery", quantity: "1", calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1 },
    ]);
    sparse[0].multiplier = 2;
    const scaled = scaleItem(sparse[0]);
    expect(scaled.calories).toBe(200);
    expect(scaled.iodine_mcg).toBeUndefined();
    expect(scaled.grams).toBeUndefined();
  });

  it("plants are untouched when nothing is removed", () => {
    const items = toEditableItems(plate);
    items[0].multiplier = 3;
    expect(plantsFromItems(items, ["rice", "salmon"])).toEqual(["rice", "salmon"]);
  });

  it("offers a usable portion ladder centred on 1x", () => {
    expect(PORTION_STEPS).toContain(1);
    expect(PORTION_STEPS[0]).toBeLessThan(1);
    expect(PORTION_STEPS[PORTION_STEPS.length - 1]).toBeGreaterThan(1);
    expect(formatMultiplier(0.5)).toBe("½×");
    expect(formatMultiplier(2)).toBe("2×");
  });
});
