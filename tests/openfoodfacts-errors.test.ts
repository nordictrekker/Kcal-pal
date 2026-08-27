import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupOpenFoodFacts } from "@/lib/openfoodfacts";

// A barcode lookup that fails on the wire must not look like "no such product":
// the scan flow only offers the Claude fallback for a genuine miss.
function mockFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lookupOpenFoodFacts", () => {
  it("returns null when OFF has no such product", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(async () => ({
      status: 404,
      ok: false,
      json: async () => ({ status: 0 }),
    }));
    await expect(lookupOpenFoodFacts("0000000000000")).resolves.toBeNull();

    mockFetch(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ status: 0 }),
    }));
    await expect(lookupOpenFoodFacts("0000000000000")).resolves.toBeNull();
  });

  it("throws on network failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });
    await expect(lookupOpenFoodFacts("123")).rejects.toThrow(
      /Couldn't reach OpenFoodFacts/,
    );
  });

  it("throws on a non-404 error status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(async () => ({ status: 503, ok: false, json: async () => ({}) }));
    await expect(lookupOpenFoodFacts("123")).rejects.toThrow(/503/);
  });

  it("throws on a malformed body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(async () => ({
      status: 200,
      ok: true,
      json: async () => {
        throw new Error("Unexpected token <");
      },
    }));
    await expect(lookupOpenFoodFacts("123")).rejects.toThrow(/malformed/);
  });

  it("parses a product with per-100g nutriments", async () => {
    mockFetch(async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: "Oats",
          brands: "Brand",
          nutriments: {
            "energy-kcal_100g": 380,
            proteins_100g: 13,
            carbohydrates_100g: 67,
            fat_100g: 7,
            fiber_100g: 10,
          },
        },
      }),
    }));
    const r = await lookupOpenFoodFacts("123");
    expect(r?.description).toBe("Brand — Oats");
    expect(r?.basis).toBe("100g");
    expect(r?.calories).toBe(380);
    expect(r?.perGram?.calories).toBeCloseTo(3.8);
  });
});
