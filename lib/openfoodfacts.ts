// OpenFoodFacts v2 API client. Free, no key. Single-call lookup by barcode.

// Nutrition per single gram of product — the base the portion editor scales.
export type PerGram = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
};

export type OffNutrition = {
  // Description for the food_entries row.
  description: string;
  // The values shown by default (one serving when known, else per 100g).
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  serving_size: string | null;
  // For UI: were these values per serving or per 100g?
  basis: "serving" | "100g";
  // Base nutrition per gram, so the portion editor can recompute macros for any
  // amount the user actually ate. Null when the product has no gram-based data.
  perGram: PerGram | null;
  // Grams in one labeled serving (so "1 serving" / "½ serving" presets work).
  servingGrams: number | null;
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

  // Serving size in grams: prefer the structured field, else parse the label.
  const servingGrams =
    numeric(p.serving_quantity) ?? gramsFromText(p.serving_size);

  // Per-gram base for the portion editor: prefer per-100g (most products have
  // it), else derive from per-serving values and the serving weight.
  const per100Energy = readEnergy(n, "100g");
  let perGram: PerGram | null = null;
  if (per100Energy !== null) {
    perGram = {
      calories: per100Energy / 100,
      protein_g: perGramFrom(n["proteins_100g"], 100),
      carbs_g: perGramFrom(n["carbohydrates_100g"], 100),
      fat_g: perGramFrom(n["fat_100g"], 100),
      fiber_g: perGramFrom(n["fiber_100g"], 100),
    };
  } else if (servingGrams && readEnergy(n, "serving") !== null) {
    perGram = {
      calories: (readEnergy(n, "serving") as number) / servingGrams,
      protein_g: perGramFrom(n["proteins_serving"], servingGrams),
      carbs_g: perGramFrom(n["carbohydrates_serving"], servingGrams),
      fat_g: perGramFrom(n["fat_serving"], servingGrams),
      fiber_g: perGramFrom(n["fiber_serving"], servingGrams),
    };
  }

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
    perGram,
    servingGrams,
  };
}

function perGramFrom(v: unknown, per: number): number | null {
  const n = numeric(v);
  return n === null ? null : n / per;
}

// Pull a gram weight out of a free-text serving label like "30 g", "1 cup
// (240ml)", "2 squares (10 g)". Returns null when no grams are present.
function gramsFromText(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  return m ? Number(m[1]) : null;
}
