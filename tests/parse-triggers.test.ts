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

import { profileNutrientColumns, supplementNameKey } from "@/lib/supplement-profiles";

describe("supplement profile cache helpers", () => {
  it("sanitizes stored nutrients into insertable columns", () => {
    const cols = profileNutrientColumns({
      calories: 5, protein_g: 0, iron_mg: 27, folate_mcg: 1000,
      choline_mg: "bad", serving_size: "1 capsule", plants: ["x"],
    });
    expect(cols.iron_mg).toBe(27);
    expect(cols.folate_mcg).toBe(1000);
    expect(cols.choline_mg).toBeNull();
    expect(cols.serving_size).toBe("1 capsule");
    expect(cols.plants).toEqual([]);
  });

  it("name keys normalize case and whitespace", () => {
    expect(supplementNameKey("  Pure  Encapsulation Prenatal ")).toBe(
      supplementNameKey("pure encapsulation prenatal"),
    );
  });
});

import { looksLikeVenue } from "@/lib/anthropic";

describe("venue detection (restaurant menu lookup)", () => {
  it("catches the real-world venue entries the old regex missed", () => {
    // Every one of these silently skipped the menu lookup before.
    expect(looksLikeVenue("River oyster bar Miami - Mahi mahi blackened (half portion), 4 oysters")).toBe(true);
    expect(looksLikeVenue("Vale healthy kitchen\nByo small bowl with Mediterranean chicken thigh")).toBe(true);
    expect(looksLikeVenue("flourless viking bread with smashed avocado, a poched egg (from madam olivia in midtown miami)")).toBe(true);
    expect(looksLikeVenue("Small Duck leg confit from à la tour Eiffel in Paris (15th district)")).toBe(true);
    expect(looksLikeVenue("carrot express turkey burger with a green goddess side salad")).toBe(false);
  });

  it("still catches the explicit wording", () => {
    expect(looksLikeVenue("PASTA Miami restaurant on 124 NW 28th st")).toBe(true);
    expect(looksLikeVenue("lunch at a café in Lyon")).toBe(true);
  });

  it("does not fire on plain home-cooked ingredient lists", () => {
    expect(looksLikeVenue("1 cup chicken thigh\n1 cup broccoli\n1/2 medium carrot")).toBe(false);
    expect(looksLikeVenue("1/3 cup non fat greek yoghurt, 1/2 banana, 1 brazil nut")).toBe(false);
    expect(looksLikeVenue("two eggs and toast")).toBe(false);
  });
});
