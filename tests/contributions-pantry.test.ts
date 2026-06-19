import { describe, it, expect } from "vitest";
import {
  contributionsForField,
  topWithOther,
  type ContribEntry,
} from "@/lib/contributions";
import { detectFrequentItems, type PantryRow } from "@/lib/pantry";

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

describe("detectFrequentItems", () => {
  const rows: PantryRow[] = [
    { description: "Nonfat Greek yogurt", meal: "breakfast", consumed_at: "2026-06-01T08:00:00Z" },
    { description: "nonfat greek yogurt!", meal: "snack", consumed_at: "2026-06-03T08:00:00Z" },
    { description: "Nonfat Greek Yogurt", meal: "breakfast", consumed_at: "2026-06-05T08:00:00Z" },
    { description: "Vanilla latte", meal: "snack", consumed_at: "2026-06-02T10:00:00Z" },
    { description: "Vanilla latte", meal: "snack", consumed_at: "2026-06-04T10:00:00Z" },
    { description: "Random one-off", meal: "dinner", consumed_at: "2026-06-04T19:00:00Z" },
  ];

  it("collapses trivially-different phrasings into one item and counts them", () => {
    const items = detectFrequentItems(rows);
    const yogurt = items.find((i) => i.key.includes("greek yogurt"));
    expect(yogurt?.count).toBe(3);
    // representative description comes from the most recent log
    expect(yogurt?.description).toBe("Nonfat Greek Yogurt");
  });

  it("ranks by frequency and excludes items below minCount", () => {
    const items = detectFrequentItems(rows);
    expect(items[0].key).toContain("greek yogurt");
    expect(items.find((i) => i.key === "random one off")).toBeUndefined();
  });

  it("respects a custom minCount", () => {
    expect(detectFrequentItems(rows, { minCount: 3 })).toHaveLength(1);
  });
});
