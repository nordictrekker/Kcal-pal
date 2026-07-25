import { describe, it, expect, afterEach, vi } from "vitest";
import { enrichMicrosWithUsda, parseGrams, usdaMicrosForItem } from "@/lib/fdc";
import type { ParsedNutrition } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// A minimal in-memory stand-in for the bits of the Supabase client fdc.ts uses:
// .from("fdc_cache").select(...).eq(...).maybeSingle() and .upsert(...).
function fakeSupabase() {
  const store = new Map<string, { matched: boolean; per100g: unknown }>();
  return {
    client: {
      from() {
        let key = "";
        const api = {
          select() {
            return api;
          },
          eq(_col: string, val: string) {
            key = val;
            return api;
          },
          async maybeSingle() {
            return { data: store.get(key) ?? null };
          },
          async upsert(row: { query: string; matched: boolean; per100g: unknown }) {
            store.set(row.query, { matched: row.matched, per100g: row.per100g });
            return { error: null };
          },
        };
        return api;
      },
    } as unknown as SupabaseClient,
    store,
  };
}

// One FDC search result with per-100 g nutrients (salmon-ish).
const SALMON_FOOD = {
  fdcId: 1,
  description: "Fish, salmon, raw",
  foodNutrients: [
    { nutrientNumber: "303", value: 0.8 }, // iron mg
    { nutrientNumber: "301", value: 12 }, // calcium mg
    { nutrientNumber: "304", value: 29 }, // magnesium mg
    { nutrientNumber: "328", value: 11 }, // vitamin D µg
    { nutrientNumber: "606", value: 1.5 }, // saturated fat g
    { nutrientNumber: "601", value: 55 }, // cholesterol mg
    { nutrientNumber: "621", value: 1.0 }, // DHA g
    { nutrientNumber: "629", value: 0.5 }, // EPA g
    { nutrientNumber: "417", value: 25 }, // folate, total µg
    { nutrientNumber: "435", value: 26 }, // folate DFE µg (preferred over 417)
    { nutrientNumber: "421", value: 90 }, // choline mg
    { nutrientNumber: "314", value: 15 }, // iodine µg
  ],
};

const base: ParsedNutrition = {
  calories: 400,
  protein_g: 40,
  carbs_g: 0,
  fat_g: 25,
  fiber_g: 0,
  saturated_fat_g: 99, // deliberately wrong AI estimates
  cholesterol_mg: 99,
  iron_mg: 99,
  calcium_mg: 99,
  magnesium_mg: 99,
  vitamin_d_mcg: 99,
  omega3_mg: 99,
  folate_mcg: 99,
  choline_mg: 99,
  iodine_mcg: 99,
  plants: [],
  serving_size: "1 fillet",
  items: [
    { name: "salmon", quantity: "200 g", grams: 200, calories: 400, protein_g: 40, carbs_g: 0, fat_g: 25 },
  ],
  assumptions: [],
};

describe("enrichMicrosWithUsda", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.USDA_FDC_API_KEY;
  });

  it("returns the input unchanged when no API key is set", async () => {
    delete process.env.USDA_FDC_API_KEY;
    const { client } = fakeSupabase();
    const out = await enrichMicrosWithUsda(client, base);
    expect(out).toBe(base);
  });

  it("replaces micros with FDC values scaled by grams", async () => {
    process.env.USDA_FDC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ foods: [SALMON_FOOD] }),
      })),
    );
    const { client } = fakeSupabase();
    const out = await enrichMicrosWithUsda(client, base);

    // 200 g → ×2 the per-100 g values.
    expect(out.iron_mg).toBeCloseTo(1.6, 5);
    expect(out.calcium_mg).toBeCloseTo(24, 5);
    expect(out.magnesium_mg).toBeCloseTo(58, 5);
    expect(out.vitamin_d_mcg).toBeCloseTo(22, 5);
    expect(out.saturated_fat_g).toBeCloseTo(3, 5);
    expect(out.cholesterol_mg).toBeCloseTo(110, 5);
    // (1.0 + 0.5) g × 2 = 3 g = 3000 mg
    expect(out.omega3_mg).toBe(3000);
    // Folate uses the DFE value (435), not total (417): 26 × 2.
    expect(out.folate_mcg).toBeCloseTo(52, 5);
    expect(out.choline_mg).toBeCloseTo(180, 5);
    expect(out.iodine_mcg).toBeCloseTo(30, 5);
    expect(out.assumptions.at(-1)).toMatch(/USDA FoodData Central/);
  });

  it("falls back to the AI estimate for items FDC can't resolve", async () => {
    process.env.USDA_FDC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ foods: [] }) })),
    );
    const { client } = fakeSupabase();
    const out = await enrichMicrosWithUsda(client, base);
    // Nothing resolved → unchanged AI aggregate.
    expect(out).toBe(base);
  });

  it("caches a lookup so a second item with the same name skips the network", async () => {
    process.env.USDA_FDC_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ foods: [SALMON_FOOD] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const twoSalmon: ParsedNutrition = {
      ...base,
      items: [
        { name: "salmon", quantity: "100 g", grams: 100, calories: 200, protein_g: 20, carbs_g: 0, fat_g: 12 },
        { name: "salmon", quantity: "100 g", grams: 100, calories: 200, protein_g: 20, carbs_g: 0, fat_g: 13 },
      ],
    };
    const { client } = fakeSupabase();
    const out = await enrichMicrosWithUsda(client, twoSalmon);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 100 + 100 g = 200 g total → same as the single 200 g case.
    expect(out.iron_mg).toBeCloseTo(1.6, 5);
  });
});

describe("parseGrams", () => {
  it("pulls grams out of serving text", () => {
    expect(parseGrams("45 g")).toBe(45);
    expect(parseGrams("1 bar (45g)")).toBe(45);
    expect(parseGrams("100g")).toBe(100);
    expect(parseGrams("30 grams")).toBe(30);
  });
  it("returns null for non-gram or missing units", () => {
    expect(parseGrams("150 ml")).toBeNull();
    expect(parseGrams("1 cup")).toBeNull();
    expect(parseGrams(null)).toBeNull();
    expect(parseGrams("")).toBeNull();
  });
});

describe("usdaMicrosForItem (barcode path)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.USDA_FDC_API_KEY;
  });

  it("returns null without an API key", async () => {
    delete process.env.USDA_FDC_API_KEY;
    const { client } = fakeSupabase();
    expect(await usdaMicrosForItem(client, "salmon", 200)).toBeNull();
  });

  it("returns null when grams are unknown", async () => {
    process.env.USDA_FDC_API_KEY = "test-key";
    const { client } = fakeSupabase();
    expect(await usdaMicrosForItem(client, "salmon", null)).toBeNull();
  });

  it("scales FDC micros by grams on a match", async () => {
    process.env.USDA_FDC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ foods: [SALMON_FOOD] }) })),
    );
    const { client } = fakeSupabase();
    const m = await usdaMicrosForItem(client, "salmon", 200);
    expect(m?.iron_mg).toBeCloseTo(1.6, 5);
    expect(m?.omega3_mg).toBe(3000);
  });

  it("returns null when FDC has no match", async () => {
    process.env.USDA_FDC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ foods: [] }) })),
    );
    const { client } = fakeSupabase();
    expect(await usdaMicrosForItem(client, "mystery bar", 45)).toBeNull();
  });
});
