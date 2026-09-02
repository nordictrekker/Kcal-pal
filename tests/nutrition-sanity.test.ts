import { describe, it, expect } from "vitest";
import { enforceNutrientConsistency } from "@/lib/nutrition-sanity";
import type { ParsedNutrition } from "@/lib/types";

const base: ParsedNutrition = {
  calories: 448, protein_g: 45, carbs_g: 12, fat_g: 20, fiber_g: 4,
  saturated_fat_g: 23.7, trans_fat_g: 0, cholesterol_mg: 312, iron_mg: 6.2,
  calcium_mg: 80, magnesium_mg: 70, vitamin_d_mcg: 0.4, omega3_mg: 300,
  folate_mcg: 90, choline_mg: 150, iodine_mcg: 10,
  plants: ["broccoli", "carrot"], serving_size: "1 plate",
  items: [
    { name: "chicken thigh", quantity: "1 cup", grams: 140, calories: 300,
      protein_g: 38, carbs_g: 0, fat_g: 15, saturated_fat_g: 22, trans_fat_g: 0 },
  ],
  assumptions: [],
};

describe("enforceNutrientConsistency", () => {
  it("caps saturated and trans fat at total fat (the chicken-thigh bug)", () => {
    const out = enforceNutrientConsistency(base);
    // The component's 22 g saturated is first capped at its own 15 g total
    // fat, then to a plausible 65% share (9.8 g); the entry total follows the
    // components rather than its original impossible 23.7 g.
    expect(out.items[0].saturated_fat_g).toBeCloseTo(9.8, 5);
    expect(out.saturated_fat_g).toBeCloseTo(9.8, 5);
    expect(out.saturated_fat_g).toBeLessThanOrEqual(out.fat_g);
  });

  it("zeroes negative values", () => {
    const out = enforceNutrientConsistency({ ...base, iron_mg: -3 });
    expect(out.iron_mg).toBe(0);
  });

  it("leaves consistent values untouched", () => {
    const out = enforceNutrientConsistency({ ...base, saturated_fat_g: 4.5 });
    expect(out.saturated_fat_g).toBe(4.5);
    expect(out.fat_g).toBe(20);
    expect(out.cholesterol_mg).toBe(312);
  });
});

import { capSaturatedShare } from "@/lib/nutrition-sanity";

describe("saturated fat as a share of total fat", () => {
  it("caps the impossible share from the real seduction-loaf entry", () => {
    // 10.1 g saturated of 12 g total fat (84%) on bread + avocado + egg whites.
    expect(capSaturatedShare(10.1, 12, "seduction loaf avocado egg white coffee")).toBe(7.8);
  });

  it("leaves genuinely saturated foods alone", () => {
    // Butter is ~63% saturated — under the default ceiling.
    expect(capSaturatedShare(7.2, 11.5, "butter")).toBe(7.2);
    // Coconut oil is ~87% saturated and named, so it keeps the high ceiling.
    expect(capSaturatedShare(12, 14, "coconut oil")).toBe(12);
  });

  it("leaves ordinary values untouched", () => {
    expect(capSaturatedShare(1.4, 10, "avocado")).toBe(1.4);
    expect(capSaturatedShare(0, 0, "egg white")).toBe(0);
    expect(capSaturatedShare(null, 10, "x")).toBeNull();
  });
});

describe("entry total prefers the sum of capped components", () => {
  it("reduces an inflated entry total to its components' sum", () => {
    const out = enforceNutrientConsistency({
      ...base,
      fat_g: 12,
      saturated_fat_g: 10.1,
      items: [
        { name: "seduction loaf slice", quantity: "1 slice", grams: 50, calories: 120, protein_g: 5, carbs_g: 18, fat_g: 2, saturated_fat_g: 0.4 },
        { name: "avocado", quantity: "1/2", grams: 70, calories: 115, protein_g: 1, carbs_g: 6, fat_g: 10, saturated_fat_g: 1.4 },
        { name: "egg whites", quantity: "3", grams: 100, calories: 51, protein_g: 11, carbs_g: 1, fat_g: 0, saturated_fat_g: 0 },
      ],
    });
    expect(out.saturated_fat_g).toBeCloseTo(1.8, 5);
  });
});
