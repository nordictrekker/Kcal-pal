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

import { filterByScope, SCOPE_OPTIONS } from "@/lib/reanalyze-scope";

describe("reanalyze scope filter", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const targets = [
    { lastAt: "2026-08-31T09:00:00Z", label: "yesterday" },
    { lastAt: "2026-08-26T09:00:00Z", label: "6 days ago" },
    { lastAt: "2026-08-20T09:00:00Z", label: "12 days ago" },
    { lastAt: "2026-08-10T09:00:00Z", label: "22 days ago" },
    { lastAt: "2026-06-01T09:00:00Z", label: "3 months ago" },
  ];

  it("scopes to the selected window by most recent entry", () => {
    expect(filterByScope(targets, "7", now).map((t) => t.label)).toEqual([
      "yesterday",
      "6 days ago",
    ]);
    expect(filterByScope(targets, "14", now).map((t) => t.label)).toEqual([
      "yesterday",
      "6 days ago",
      "12 days ago",
    ]);
    expect(filterByScope(targets, "30", now)).toHaveLength(4);
  });

  it("all-time returns everything, and offers four choices", () => {
    expect(filterByScope(targets, "all", now)).toHaveLength(5);
    expect(SCOPE_OPTIONS.map((o) => o.key)).toEqual(["7", "14", "30", "all"]);
  });

  it("ignores unparseable dates rather than including them blindly", () => {
    const bad = [{ lastAt: "not-a-date", label: "x" }];
    expect(filterByScope(bad, "7", now)).toHaveLength(0);
  });
});
