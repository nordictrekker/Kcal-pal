// OpenFoodFacts v2 API client. Free, no key. Single-call lookup by barcode.

export type OffNutrition = {
  // Description for the food_entries row.
  description: string;
  // Per the spec we store per-serving values when possible, else per 100g
  // with the serving_size labeled so the user can adjust.
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  serving_size: string | null;
  // For UI: were these values per serving or per 100g?
  basis: "serving" | "100g";
};

type OffResponse = {
  status?: number;
  product?: {
    product_name?: string;
    generic_name?: string;
    brands?: string;
    serving_size?: string;
    serving_quantity?: number;
    nutriments?: Record<string, number | string | undefined>;
  };
};

function numeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// OFF returns kcal and kJ separately depending on label. Prefer kcal; convert kJ otherwise.
function readEnergy(
  nutriments: Record<string, number | string | undefined>,
  suffix: "100g" | "serving",
): number | null {
  const kcal = numeric(nutriments[`energy-kcal_${suffix}`]);
  if (kcal !== null) return kcal;
  const kj = numeric(nutriments[`energy-kj_${suffix}`]);
  if (kj !== null) return Math.round(kj / 4.184);
  // Some products only have generic "energy" assumed to be kJ.
  const energy = numeric(nutriments[`energy_${suffix}`]);
  if (energy !== null) return Math.round(energy / 4.184);
  return null;
}

export async function lookupOpenFoodFacts(
  barcode: string,
): Promise<OffNutrition | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    barcode,
  )}?fields=product_name,generic_name,brands,serving_size,serving_quantity,nutriments`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        // OFF asks API users to identify themselves.
        "User-Agent": "Kcal-pal/0.1 (personal use)",
      },
      // Don't cache between users — values can change as OFF community edits.
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let body: OffResponse;
  try {
    body = (await res.json()) as OffResponse;
  } catch {
    return null;
  }

  if (body.status !== 1 || !body.product) return null;

  const p = body.product;
  const n = p.nutriments ?? {};

  // Prefer per-serving values when present; otherwise fall back to per 100g.
  const hasServing =
    p.serving_quantity != null &&
    readEnergy(n, "serving") !== null;
  const basis: "serving" | "100g" = hasServing ? "serving" : "100g";

  const name =
    [p.brands, p.product_name ?? p.generic_name]
      .filter((s): s is string => typeof s === "string" && s.trim() !== "")
      .join(" — ")
      .trim() || "Unknown product";

  return {
    description: name,
    calories: readEnergy(n, basis),
    protein_g: numeric(n[`proteins_${basis}`]),
    carbs_g: numeric(n[`carbohydrates_${basis}`]),
    fat_g: numeric(n[`fat_${basis}`]),
    fiber_g: numeric(n[`fiber_${basis}`]),
    serving_size:
      basis === "serving"
        ? p.serving_size?.trim() || `${p.serving_quantity}g`
        : "100g",
    basis,
  };
}
