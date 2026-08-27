import { describe, it, expect } from "vitest";
import { dedupeRecentMeals, type RecentMealRow } from "@/lib/recent-meals";

function row(
  id: string,
  description: string,
  consumed_at: string,
  calories: number | null = 300,
): RecentMealRow {
  return { id, description, calories, consumed_at };
}

describe("dedupeRecentMeals", () => {
  it("keeps the most recent occurrence per normalized description", () => {
    const out = dedupeRecentMeals([
      row("a", "Greek yogurt with honey", "2026-06-27T08:00:00Z"),
      row("b", "greek  yogurt with Honey", "2026-06-29T08:00:00Z", 310),
      row("c", "Lentil soup", "2026-06-28T12:00:00Z"),
    ]);
    expect(out.map((m) => m.entryId)).toEqual(["b", "c"]);
    expect(out[0].calories).toBe(310);
  });

  it("orders most recent first and caps at the limit", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(`id${i}`, `meal ${i}`, `2026-06-${10 + i}T12:00:00Z`),
    );
    const out = dedupeRecentMeals(rows, 4);
    expect(out).toHaveLength(4);
    expect(out[0].entryId).toBe("id9");
  });

  it("skips blank or too-short descriptions and handles null input", () => {
    expect(dedupeRecentMeals(null)).toEqual([]);
    const out = dedupeRecentMeals([
      row("a", "  ", "2026-06-29T08:00:00Z"),
      row("b", "ab", "2026-06-29T09:00:00Z"),
      row("c", "omelette", "2026-06-29T10:00:00Z"),
    ]);
    expect(out.map((m) => m.entryId)).toEqual(["c"]);
  });
});

import { proteinDistributionNote } from "@/lib/protein-timing";

describe("proteinDistributionNote", () => {
  const dinnerHeavy = [
    { meal: "breakfast" as const, protein_g: 10 },
    { meal: "dinner" as const, protein_g: 70 },
  ];
  it("nudges when protein is back-loaded on a muscle goal", () => {
    const note = proteinDistributionNote({ goal: "muscle", entries: dinnerHeavy, proteinTargetG: 160 });
    expect(note).toMatch(/protein/i);
  });
  it("silent for other goals, balanced days, and thin data", () => {
    expect(proteinDistributionNote({ goal: "lose", entries: dinnerHeavy, proteinTargetG: 160 })).toBeNull();
    expect(proteinDistributionNote({ goal: "muscle", entries: [{ meal: "breakfast", protein_g: 40 }, { meal: "dinner", protein_g: 45 }], proteinTargetG: 160 })).toBeNull();
    expect(proteinDistributionNote({ goal: "muscle", entries: [{ meal: "dinner", protein_g: 20 }], proteinTargetG: 160 })).toBeNull();
  });
});
