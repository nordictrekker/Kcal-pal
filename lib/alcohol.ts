// Alcohol math: drink catalog, container sizes, and the
// calorie/standard-drink/hydration conversions. Pure and deterministic.
//
// Estimates use typical ABVs and calorie densities; they're approximations,
// not lab values, and we say so in the UI.

export const ETHANOL_DENSITY = 0.789; // g/ml
// US standard drink = 14 g of pure alcohol.
export const STANDARD_DRINK_G = 14;

// Hydration offset: alcohol is a diuretic, so each standard drink raises the
// water goal rather than counting as intake. ~250 ml same-day to offset, plus
// a residual ~125 ml carried to the next day.
export const HYDRATION_ML_PER_DRINK_TODAY = 250;
export const HYDRATION_ML_PER_DRINK_NEXT_DAY = 125;

export type DrinkType =
  | "red_wine"
  | "white_wine"
  | "beer"
  | "skinny_cocktail"
  | "fruity_cocktail"
  | "spirit";

type DrinkDef = {
  label: string;
  abv: number; // 0–1
  kcalPerMl: number; // bundles alcohol + sugar/carb calories
  defaultGlassMl: number; // a "glass" / single serving of this drink
};

export const DRINKS: Record<DrinkType, DrinkDef> = {
  red_wine: { label: "Red wine", abv: 0.13, kcalPerMl: 0.85, defaultGlassMl: 150 },
  white_wine: { label: "White / rosé", abv: 0.12, kcalPerMl: 0.82, defaultGlassMl: 150 },
  beer: { label: "Beer", abv: 0.05, kcalPerMl: 0.43, defaultGlassMl: 330 },
  skinny_cocktail: { label: "Skinny cocktail", abv: 0.15, kcalPerMl: 0.65, defaultGlassMl: 150 },
  fruity_cocktail: { label: "Fruity cocktail", abv: 0.12, kcalPerMl: 1.3, defaultGlassMl: 200 },
  spirit: { label: "Neat spirit", abv: 0.4, kcalPerMl: 2.3, defaultGlassMl: 40 },
};

export const DRINK_ORDER: DrinkType[] = [
  "red_wine",
  "white_wine",
  "skinny_cocktail",
  "fruity_cocktail",
  "beer",
  "spirit",
];

export function isDrinkType(t: string): t is DrinkType {
  return t in DRINKS;
}

// Container sizes. "glass" resolves to the drink's own default serving; the
// rest are fixed volumes. `ml` is a free 100 ml step.
export type ContainerId = "glass" | "ml" | "cl33" | "cl50" | "cl75";

export const CONTAINERS: Array<{ id: ContainerId; label: string; ml: number | null }> = [
  { id: "glass", label: "Glass", ml: null },
  { id: "cl33", label: "33cl", ml: 330 },
  { id: "cl50", label: "50cl", ml: 500 },
  { id: "cl75", label: "75cl", ml: 750 },
  { id: "ml", label: "ml", ml: 100 },
];

// Resolve a container + amount (multiplier) into a volume in ml for a drink.
export function resolveVolumeMl(
  drink: DrinkType,
  container: ContainerId,
  amount: number,
): number {
  const base =
    container === "glass"
      ? DRINKS[drink].defaultGlassMl
      : (CONTAINERS.find((c) => c.id === container)?.ml ?? 100);
  return Math.max(0, Math.round(base * amount));
}

export type DrinkComputation = {
  alcohol_g: number;
  standard_drinks: number;
  calories: number;
};

export function computeDrink(drink: DrinkType, volumeMl: number): DrinkComputation {
  const def = DRINKS[drink];
  const alcohol_g = volumeMl * def.abv * ETHANOL_DENSITY;
  return {
    alcohol_g: Math.round(alcohol_g * 10) / 10,
    standard_drinks: Math.round((alcohol_g / STANDARD_DRINK_G) * 100) / 100,
    calories: Math.round(volumeMl * def.kcalPerMl),
  };
}

// Extra water (ml) to add to the goal given standard drinks today and
// yesterday. Capped so a heavy night doesn't produce an absurd target.
export function hydrationOffsetMl(
  stdDrinksToday: number,
  stdDrinksYesterday: number,
): number {
  const raw =
    stdDrinksToday * HYDRATION_ML_PER_DRINK_TODAY +
    stdDrinksYesterday * HYDRATION_ML_PER_DRINK_NEXT_DAY;
  return Math.min(2000, Math.round(raw / 50) * 50);
}

// A human label for a logged drink, e.g. "Red wine · 375 ml".
export function describeDrink(drink: string, volumeMl: number): string {
  const label = isDrinkType(drink) ? DRINKS[drink].label : "Drink";
  return `${label} · ${Math.round(volumeMl)} ml`;
}
