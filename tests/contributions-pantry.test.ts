import { describe, it, expect } from "vitest";
import {
  contributionsForField,
  topWithOther,
  buildComponentContributors,
  type ContribEntry,
} from "@/lib/contributions";
import { detectFrequentItems, type PantryComponent } from "@/lib/pantry";

describe("contributionsForField", () => {
  const entries: ContribEntry[] = [
    { id: "a", label: "Greek yogurt", meal: "breakfast", values: { iron_mg: 1, protein_g: 17 } },
    { id: "b", label: "Spinach salad", meal: "lunch", values: { iron_mg: 3, protein_g: 2 } },
    { id: "c", label: "Water", meal: "snack", values: { iron_mg: 0, protein_g: 0 } },
  ];

  it("returns only positive contributors, largest first", () => {
    const r = contributionsForField("iron_mg", entries);
    expect(r.map((c) => c.label)).toEqual(["Spinach salad", "Greek yogurt"]);
    expect(r.map((c) => c.amount)).toEqual([3, 1]);
  });

  it("drops entries that contributed nothing", () => {
    const r = contributionsForField("protein_g", entries);
    expect(r.find((c) => c.label === "Water")).toBeUndefined();
  });

  it("ignores missing fields", () => {
    expect(contributionsForField("calcium_mg", entries)).toEqual([]);
  });
});

describe("topWithOther", () => {
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: String(i),
      label: `f${i}`,
      meal: null,
      amount: 10 - i,
    }));

  it("passes through when within the cap", () => {
    expect(topWithOther(make(4), 6)).toHaveLength(4);
  });

  it("groups the tail into a single Other slice that conserves the total", () => {
    const grouped = topWithOther(make(10), 6);
    expect(grouped).toHaveLength(6);
    const other = grouped[grouped.length - 1];
    expect(other.label).toBe("Other");
    const total = make(10).reduce((s, c) => s + c.amount, 0);
    expect(grouped.reduce((s, c) => s + c.amount, 0)).toBe(total);
  });
});

describe("buildComponentContributors", () => {
  // Mirrors the user's real log: skyr + golden kiwi + nespresso w/ skim milk.
  const entry = {
    id: "e1",
    description: "Skyr, kiwi, coffee",
    meal: "breakfast" as const,
    raw_ai_response: {
      items: [
        { name: "Yoplait skyr", calories: 60, protein_g: 11, carbs_g: 4, fat_g: 0, fiber_g: 0 },
        { name: "golden kiwi", calories: 25, protein_g: 0.5, carbs_g: 6, fat_g: 0.2, fiber_g: 1.5 },
        { name: "nespresso w/ skim milk", calories: 15, protein_g: 1, carbs_g: 2, fat_g: 0, fiber_g: 0 },
      ],
    },
    totals: { protein_g: 12.5, carbs_g: 12, fiber_g: 1.5, iron_mg: 0.6 },
  };

  it("splits a log into one contributor per component", () => {
    const c = buildComponentContributors([entry]);
    expect(c.map((x) => x.label)).toEqual([
      "Yoplait skyr",
      "golden kiwi",
      "nespresso w/ skim milk",
    ]);
  });

  it("attributes each nutrient to the right component", () => {
    const c = buildComponentContributors([entry]);
    expect(contributionsForField("protein_g", c)[0].label).toBe("Yoplait skyr");
    // fiber comes almost entirely from the kiwi, not the protein-heavy skyr
    expect(contributionsForField("fiber_g", c)[0].label).toBe("golden kiwi");
  });

  it("reconciles component shares to the entry's stored total", () => {
    const c = buildComponentContributors([entry]);
    const sum = contributionsForField("protein_g", c).reduce((s, x) => s + x.amount, 0);
    expect(sum).toBeCloseTo(12.5, 5);
  });

  it("allocates a non-itemized nutrient by calorie share (still per-component)", () => {
    const c = buildComponentContributors([entry]);
    const iron = contributionsForField("iron_mg", c);
    expect(iron[0].label).toBe("Yoplait skyr"); // highest calories
    expect(iron.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(0.6, 5);
  });

  it("falls back to a single whole-entry contributor when there are no items", () => {
    const c = buildComponentContributors([
      { id: "e2", description: "Mystery snack", meal: null, raw_ai_response: null, totals: { protein_g: 5 } },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].label).toBe("Mystery snack");
    expect(c[0].values.protein_g).toBe(5);
  });
});

describe("detectFrequentItems", () => {
  const comp = (
    name: string,
    quantity: string,
    consumedAt: string,
    nutrients: Record<string, number> = {},
  ): PantryComponent => ({ name, quantity, meal: "breakfast", consumedAt, nutrients });

  // Differently-worded each time and buried among other foods — mirrors how
  // the AI itemizes a real prose log.
  const components: PantryComponent[] = [
    comp("Yoplait skyr non fat plain", "1/2 cup", "2026-06-17T08:00:00Z", { protein_g: 11 }),
    comp("golden kiwi", "1/2", "2026-06-17T08:00:00Z"),
    comp("yoplait skyr non fat natural", "1/2 cup", "2026-06-18T08:00:00Z"),
    comp("2 inch whole wheat bread", "1 slice", "2026-06-18T08:00:00Z"),
    comp("Yoplait skyr natural", "4 tbsp", "2026-06-19T08:00:00Z", { protein_g: 6 }),
    comp("Golden kiwi, 1/2", "1/2", "2026-06-19T08:00:00Z"),
    comp("Kiwi, yellow (gold)", "1", "2026-06-18T12:00:00Z"),
    comp("Croissant (bakery, butter)", "1", "2026-06-17T09:00:00Z"),
  ];

  it("clusters differently-worded components of the same food", () => {
    const items = detectFrequentItems(components);
    const skyr = items.find((i) => i.label.toLowerCase().includes("skyr"));
    const kiwi = items.find((i) => i.label.toLowerCase().includes("kiwi"));
    expect(skyr?.count).toBe(3);
    expect(kiwi?.count).toBe(3);
  });

  it("represents a cluster by its most recent occurrence + nutrients", () => {
    const skyr = detectFrequentItems(components).find((i) =>
      i.label.toLowerCase().includes("skyr"),
    );
    expect(skyr?.label).toContain("Yoplait skyr natural"); // most recent
    expect(skyr?.nutrients.protein_g).toBe(6);
  });

  it("excludes one-off foods below minCount", () => {
    const items = detectFrequentItems(components);
    expect(items.find((i) => i.label.toLowerCase().includes("croissant"))).toBeUndefined();
    expect(items.find((i) => i.label.toLowerCase().includes("bread"))).toBeUndefined();
  });

  it("ranks more-frequent foods first", () => {
    const items = detectFrequentItems(components);
    expect(items[0].count).toBeGreaterThanOrEqual(items[items.length - 1].count);
  });
});
