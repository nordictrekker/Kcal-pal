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
    expect(out.saturated_fat_g).toBe(20);
    expect(out.items[0].saturated_fat_g).toBe(15);
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
