import { describe, it, expect } from "vitest";
import {
  TEMPLATE_NUTRIENT_COLUMNS,
  TEMPLATE_SELECT,
  nutrientsFrom,
  missingMicros,
} from "@/lib/saved-meals";

describe("saved meal templates carry full nutrition", () => {
  it("the select string covers every column we copy", () => {
    const selected = new Set(TEMPLATE_SELECT.split(","));
    for (const col of TEMPLATE_NUTRIENT_COLUMNS) {
      expect(selected.has(col), `${col} missing from TEMPLATE_SELECT`).toBe(true);
    }
    expect(selected.has("raw_ai_response")).toBe(true);
  });

  it("copies micros, plants and the component breakdown, not just macros", () => {
    // The kite hill yogurt from the field report: saved with macros only, so
    // re-logging it produced an entry with every micronutrient blank.
    const entry = {
      description: "kite hill — plain unsweetened Greek style yogurt",
      calories: 56,
      protein_g: 6.4,
      carbs_g: 2.6,
      fat_g: 2.3,
      fiber_g: 1,
      saturated_fat_g: 0.2,
      cholesterol_mg: 0,
      iron_mg: 0.7,
      calcium_mg: 224.4,
      magnesium_mg: 15,
      vitamin_d_mcg: 2.2,
      omega3_mg: 50,
      folate_mcg: 10,
      choline_mg: 10,
      iodine_mcg: 3,
      plants: ["almond", "soy"],
      serving_size: "64 g",
      raw_ai_response: { items: [{ name: "yogurt" }] },
      edited_by_user: true,
    };
    const copied = nutrientsFrom(entry);
    expect(copied.calcium_mg).toBe(224.4);
    expect(copied.vitamin_d_mcg).toBe(2.2);
    expect(copied.iodine_mcg).toBe(3);
    expect(copied.plants).toEqual(["almond", "soy"]);
    // The portion travels with the template.
    expect(copied.serving_size).toBe("64 g");
    expect(copied.raw_ai_response).toEqual({ items: [{ name: "yogurt" }] });
    // Only nutrition is copied — never identity or provenance fields.
    expect(copied.description).toBeUndefined();
    expect(copied.edited_by_user).toBeUndefined();
  });

  it("absent fields become explicit nulls rather than being dropped", () => {
    const copied = nutrientsFrom({ calories: 100 });
    expect(copied.calories).toBe(100);
    expect(copied.iodine_mcg).toBeNull();
    expect(copied.serving_size).toBeNull();
    expect(Object.keys(copied)).toHaveLength(TEMPLATE_NUTRIENT_COLUMNS.length + 1);
  });

  it("flags legacy macro-only templates for self-healing", () => {
    // Pre-0029 row: macros present, every micro column missing.
    expect(
      missingMicros({ calories: 180, protein_g: 3.6, fat_g: 1.8, fiber_g: 5 }),
    ).toBe(true);
    // A genuine zero is data, not absence — don't re-heal it every log.
    expect(missingMicros({ calories: 180, cholesterol_mg: 0 })).toBe(false);
    expect(missingMicros({ iron_mg: 2.1 })).toBe(false);
  });
});
