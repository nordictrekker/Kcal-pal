import { describe, it, expect } from "vitest";
import { cleanPlants, withoutFlavourings } from "@/lib/plants";

describe("cleanPlants", () => {
  it("drops flavourings and beverages (coffee, vanilla, cocoa, tea)", () => {
    expect(cleanPlants(["spinach", "coffee", "vanilla", "cocoa", "tea"])).toEqual([
      "spinach",
    ]);
  });

  it("drops herbs and spices used as seasoning", () => {
    expect(
      cleanPlants(["tomato", "basil", "black pepper", "cinnamon", "salt"]),
    ).toEqual(["tomato"]);
  });

  it("keeps real fruit/veg/legume/nut/seed servings", () => {
    expect(
      cleanPlants(["apple", "chickpea", "walnut", "chia", "kale"]).sort(),
    ).toEqual(["apple", "chia", "chickpea", "kale", "walnut"]);
  });

  it("drops whole grains and grain products", () => {
    expect(
      cleanPlants(["oats", "rice", "quinoa", "barley", "bread", "pasta", "lentil"]),
    ).toEqual(["lentil"]);
  });

  it("normalises case/whitespace and de-duplicates", () => {
    expect(cleanPlants([" Spinach ", "spinach", "SPINACH"])).toEqual(["spinach"]);
  });

  it("tolerates simple plurals of excluded items (cloves, chives)", () => {
    expect(cleanPlants(["cloves", "chives", "carrot"])).toEqual(["carrot"]);
  });

  it("handles null and garbage input", () => {
    expect(cleanPlants(null)).toEqual([]);
    expect(cleanPlants([1 as unknown as string, "", "  ", "pear"])).toEqual([
      "pear",
    ]);
  });
});

describe("withoutFlavourings", () => {
  it("filters flavourings but preserves order and duplicates (for motif weighting)", () => {
    expect(withoutFlavourings(["kale", "coffee", "kale", "apple"])).toEqual([
      "kale",
      "kale",
      "apple",
    ]);
  });
});
