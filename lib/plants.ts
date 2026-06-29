// The weekly count showcases how much real fruit/veg/whole-plant food someone
// eats. Flavourings, beverages, and seasonings (coffee, vanilla, a pinch of
// cinnamon) are plant-derived but aren't a meaningful serving, so they must not
// inflate the count. The meal parse is asked to omit them (see lib/anthropic.ts
// — it only lists plants eaten in a meaningful amount), and we ALSO filter here
// so already-logged meals are counted correctly and as a backstop for the model.
const EXCLUDED_PLANTS = new Set<string>([
  // beverages & flavourings
  "coffee", "espresso", "cold brew", "decaf", "cocoa", "cacao", "chocolate",
  "dark chocolate", "vanilla", "vanilla extract", "vanilla bean", "tea",
  "green tea", "black tea", "matcha", "chai", "kombucha",
  // dried spices / leaveners (used in pinches, never a serving)
  "salt", "sea salt", "pepper", "black pepper", "white pepper", "peppercorn",
  "cinnamon", "nutmeg", "clove", "cardamom", "allspice", "paprika",
  "smoked paprika", "cumin", "coriander", "turmeric", "curry powder", "curry",
  "chili powder", "chilli powder", "cayenne", "chili flake", "red pepper flake",
  "mustard seed", "fennel seed", "star anise", "saffron", "msg", "baking soda",
  "baking powder", "yeast",
  // soft/leafy herbs (seasoning amounts)
  "basil", "oregano", "thyme", "rosemary", "sage", "parsley", "cilantro",
  "coriander leaf", "dill", "mint", "tarragon", "marjoram", "bay leaf", "bay",
  "chive", "lemongrass", "kaffir lime leaf",
  // whole grains & grain products — excluded by product decision (the count
  // showcases fruit/veg/legumes/nuts/seeds, not grains)
  "oat", "oatmeal", "rice", "brown rice", "white rice", "wild rice",
  "basmati rice", "jasmine rice", "quinoa", "barley", "bulgur", "farro",
  "freekeh", "millet", "buckwheat", "amaranth", "sorghum", "teff", "rye",
  "spelt", "wheat", "whole wheat", "wheat berry", "couscous", "bread",
  "whole grain bread", "whole-grain bread", "toast", "pasta", "noodle",
  "polenta", "cornmeal", "popcorn", "grits", "cereal", "granola", "muesli",
  "tortilla", "bagel", "cracker",
]);

function isExcluded(normalized: string): boolean {
  if (EXCLUDED_PLANTS.has(normalized)) return true;
  // tolerate simple plurals ("cloves", "chives", "peppercorns")
  if (normalized.endsWith("s") && EXCLUDED_PLANTS.has(normalized.slice(0, -1))) {
    return true;
  }
  return false;
}

// Normalise to lowercase, drop flavourings/seasonings (preserving order &
// frequency, NOT de-duplicated). Use for produce-motif selection where how
// often a plant appears matters.
export function withoutFlavourings(
  names: Iterable<string> | null | undefined,
): string[] {
  if (!names) return [];
  const out: string[] = [];
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const n = raw.trim().toLowerCase();
    if (!n || isExcluded(n)) continue;
    out.push(n);
  }
  return out;
}

// Normalise to lowercase, drop flavourings/seasonings, and de-duplicate. Use
// for the distinct weekly plant-diversity count.
export function cleanPlants(names: Iterable<string> | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of withoutFlavourings(names)) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
