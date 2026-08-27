import { describe, it, expect } from "vitest";
import { RESTAURANT_REF, SUPPLEMENT_REF } from "@/lib/anthropic";

describe("web-search parse triggers", () => {
  it("restaurant trigger fires on restaurant/menu wording", () => {
    expect(RESTAURANT_REF.test("Restaurant: Chez Panisse, menu item: ratatouille")).toBe(true);
    expect(RESTAURANT_REF.test("lunch at a café in Lyon")).toBe(true);
    expect(RESTAURANT_REF.test("greek yogurt with honey")).toBe(false);
  });

  it("supplement trigger fires on labeled-product wording", () => {
    expect(SUPPLEMENT_REF.test("1/3 tablet Berocca Immunité Flash effervescent tablet")).toBe(true);
    expect(SUPPLEMENT_REF.test("one scoop protein powder in milk")).toBe(true);
    expect(SUPPLEMENT_REF.test("magnesium supplement")).toBe(true);
    expect(SUPPLEMENT_REF.test("two vitamin D gummies")).toBe(true);
    expect(SUPPLEMENT_REF.test("an RXBAR protein bar")).toBe(true);
    // Non-English label words (the Swedish Kapsel bug from the field).
    expect(SUPPLEMENT_REF.test("Apoteket Hjärtats Omega-3 Forte Kapsel")).toBe(true);
    expect(SUPPLEMENT_REF.test("magnesium tablett")).toBe(true);
  });

  it("supplement trigger stays quiet on ordinary meals", () => {
    expect(SUPPLEMENT_REF.test("chicken salad with olive oil")).toBe(false);
    expect(SUPPLEMENT_REF.test("oatmeal with blueberries and walnuts")).toBe(false);
    expect(SUPPLEMENT_REF.test("two eggs and toast")).toBe(false);
  });
});
