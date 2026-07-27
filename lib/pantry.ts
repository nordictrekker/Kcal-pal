import type { Meal } from "./types";

// A single component food pulled from a logged entry's AI item breakdown.
export type PantryComponent = {
  name: string;
  quantity: string;
  meal: Meal | null;
  consumedAt: string;
  nutrients: Record<string, number | null | undefined>;
};

// A food the user eats often, surfaced as a quick-fill chip — e.g. a daily
// nonfat Greek yogurt or a regular oat-milk latte. Derived from history; no
// manual saving needed.
export type FrequentItem = {
  key: string; // the food token the cluster formed around
  label: string; // representative phrase shown on the chip
  description: string; // phrase used when logging (name + quantity)
  meal: Meal | null;
  count: number;
  lastUsed: string;
  nutrients: Record<string, number | null | undefined>;
};

// Quantity words, units and generic modifiers that aren't the food itself.
const STOP = new Set([
  "cup", "cups", "tbsp", "tbsps", "tablespoon", "tablespoons", "tsp",
  "teaspoon", "teaspoons", "slice", "slices", "inch", "inches", "oz",
  "ounce", "ounces", "gram", "grams", "ml", "mls", "litre", "liter",
  "dollop", "dollops", "sample", "samples", "piece", "pieces", "serving",
  "servings", "small", "medium", "large", "half", "cooked", "raw",
  "roasted", "fresh", "dried", "grilled", "baked", "sauteed", "fried",
  "prepared", "ready", "drink", "non", "fat", "nonfat", "low", "full",
  "plain", "natural", "unflavored", "unsweetened", "sweetened", "light",
  "extra", "with", "and", "the", "for", "from", "mixed", "whole", "skim",
  "reduced", "lean", "homemade", "bakery", "style", "long", "size",
]);

// Significant food tokens in a component name (parentheticals/quantities/
// modifiers stripped).
function tokensOf(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

// Compact a parsed quantity for chip display: drop weight parentheticals
// ("1 half (~2 g)" → "1 half"), turn word-fractions into numerals ("1 half" →
// "1/2"), and drop words the name already says ("12 fries" on a French-fries
// chip → "12"). The full quantity still rides along in `description` for
// logging. Exported for tests.
export function simplifyQuantity(quantity: string, name: string): string {
  let q = quantity.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const FRACTIONS: Array<[RegExp, string]> = [
    [/\b(?:1|a|one) half\b/gi, "1/2"],
    [/\b(?:1|a|one) quarter\b/gi, "1/4"],
    [/\b(?:1|a|one) third\b/gi, "1/3"],
    [/^half\b/i, "1/2"],
  ];
  for (const [re, rep] of FRACTIONS) q = q.replace(re, rep);
  const nameTokens = new Set(
    name.toLowerCase().split(/[^a-zà-ÿ0-9/]+/i).filter(Boolean),
  );
  q = q
    .split(/\s+/)
    .filter((w) => {
      const t = w.toLowerCase().replace(/[.,;]+$/, "");
      const singular = t.endsWith("s") ? t.slice(0, -1) : t;
      return !nameTokens.has(t) && !nameTokens.has(singular);
    })
    .join(" ")
    .trim();
  return q;
}

function phrase(c: PantryComponent): string {
  const q = c.quantity ? simplifyQuantity(c.quantity, c.name) : "";
  if (q && !c.name.toLowerCase().includes(q.toLowerCase())) {
    return `${c.name} (${q})`;
  }
  return c.name;
}

// Cluster a user's logged component foods into their most-eaten items.
// Components are grouped by their most-distinctive shared token (so "golden
// kiwi", "Golden kiwi, 1/2" and "Kiwi, yellow" collapse into one "kiwi" chip),
// and clusters seen at least `minCount` times qualify.
export function detectFrequentItems(
  components: PantryComponent[],
  opts: { minCount?: number; limit?: number } = {},
): FrequentItem[] {
  const minCount = opts.minCount ?? 2;
  const limit = opts.limit ?? 12;

  // 1. Token document-frequency (how many components contain each token).
  const freq = new Map<string, number>();
  const compTokens = components.map((c) => {
    const toks = Array.from(new Set(tokensOf(c.name)));
    for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1);
    return toks;
  });

  // 2. Assign each component to its highest-frequency token (ties → the longer,
  //    more specific token), so each food clusters once.
  const clusters = new Map<string, PantryComponent[]>();
  components.forEach((c, i) => {
    const toks = compTokens[i];
    if (toks.length === 0) return;
    let best = toks[0];
    for (const t of toks) {
      const ft = freq.get(t) ?? 0;
      const fb = freq.get(best) ?? 0;
      if (ft > fb || (ft === fb && t.length > best.length)) best = t;
    }
    const arr = clusters.get(best) ?? [];
    arr.push(c);
    clusters.set(best, arr);
  });

  // 3. Build a chip per qualifying cluster, represented by its most recent log.
  const items: FrequentItem[] = [];
  for (const [key, members] of clusters) {
    if (members.length < minCount) continue;
    const rep = members.reduce((a, b) =>
      b.consumedAt > a.consumedAt ? b : a,
    );
    items.push({
      key,
      label: phrase(rep),
      description: phrase(rep),
      meal: rep.meal,
      count: members.length,
      lastUsed: rep.consumedAt,
      nutrients: rep.nutrients,
    });
  }

  return items
    .sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, limit);
}
