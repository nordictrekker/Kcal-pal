import { afterEach, describe, it, expect, vi } from "vitest";
import { lookupOpenFoodFacts } from "@/lib/openfoodfacts";

function response(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

describe("lookupOpenFoodFacts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null for network, HTTP, JSON, and product failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await lookupOpenFoodFacts("123")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, false)));
    expect(await lookupOpenFoodFacts("123")).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      }),
    );
    expect(await lookupOpenFoodFacts("123")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status: 0 })));
    expect(await lookupOpenFoodFacts("123")).toBeNull();
  });

  it("uses per-serving nutrition and URL-encodes the barcode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        status: 1,
        product: {
          brands: "Acme",
          product_name: "Berry Bar",
          serving_size: "1 bar (50 g)",
          serving_quantity: 50,
          nutriments: {
            "energy-kcal_serving": 250,
            proteins_serving: 10,
            carbohydrates_serving: 30,
            fat_serving: 8,
            fiber_serving: 5,
            "energy-kcal_100g": 500,
            proteins_100g: 20,
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await lookupOpenFoodFacts("12/34?56");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/12%2F34%3F56?fields="),
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(out).toEqual({
      description: "Acme — Berry Bar",
      calories: 250,
      protein_g: 10,
      carbs_g: 30,
      fat_g: 8,
      fiber_g: 5,
      serving_size: "1 bar (50 g)",
      basis: "serving",
      perGram: {
        calories: 5,
        protein_g: 0.2,
        carbs_g: null,
        fat_g: null,
        fiber_g: null,
      },
      servingGrams: 50,
    });
  });

  it("falls back to per-100g energy and converts kJ or generic energy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          status: 1,
          product: {
            product_name: "Plain Food",
            nutriments: {
              "energy-kj_100g": 418.4,
              proteins_100g: 4,
              carbohydrates_100g: 20,
              fat_100g: 2,
              fiber_100g: 3,
            },
          },
        }),
      ),
    );
    expect(await lookupOpenFoodFacts("1")).toMatchObject({
      description: "Plain Food",
      calories: 100,
      protein_g: 4,
      basis: "100g",
      serving_size: "100g",
      perGram: {
        calories: 1,
        protein_g: 0.04,
        carbs_g: 0.2,
        fat_g: 0.02,
        fiber_g: 0.03,
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          status: 1,
          product: {
            nutriments: { energy_100g: 418.4 },
          },
        }),
      ),
    );
    expect((await lookupOpenFoodFacts("2"))?.calories).toBe(100);
  });

  it("derives per-gram values from serving data and parses serving grams", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          status: 1,
          product: {
            generic_name: "Chocolate squares",
            serving_size: "2 squares (10 g)",
            nutriments: {
              "energy-kcal_serving": 50,
              proteins_serving: 2,
              carbohydrates_serving: 6,
              fat_serving: 3,
              fiber_serving: 1,
            },
          },
        }),
      ),
    );
    const out = await lookupOpenFoodFacts("3");
    expect(out).toMatchObject({
      description: "Chocolate squares",
      basis: "100g",
      serving_size: "100g",
      servingGrams: 10,
      perGram: {
        calories: 5,
        protein_g: 0.2,
        carbs_g: 0.6,
        fat_g: 0.3,
        fiber_g: 0.1,
      },
    });
  });

  it("uses generic and unknown product descriptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({ status: 1, product: { generic_name: "Generic item", nutriments: {} } }),
      ),
    );
    expect((await lookupOpenFoodFacts("4"))?.description).toBe("Generic item");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({ status: 1, product: { nutriments: {} } }),
      ),
    );
    expect((await lookupOpenFoodFacts("5"))?.description).toBe("Unknown product");
  });
});
