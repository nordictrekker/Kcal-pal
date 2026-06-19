import type { Meal } from "./types";

// A food the user logs often, derived from their history (no manual saving
// needed). Powers the "pantry" quick-fill chips on the log screen — e.g. a
// daily nonfat Greek yogurt, or a regular Starbucks vanilla latte.
export type FrequentItem = {
  key: string; // normalized match key
  description: string; // representative original-cased description
  meal: Meal | null;
  count: number;
  lastUsed: string; // ISO timestamp of most recent log
};

export type PantryRow = {
  description: string | null;
  meal: Meal | null;
  consumed_at: string;
};

// Loose normalization so trivially different phrasings collapse together
// ("Nonfat Greek yogurt" / "nonfat greek yogurt!" → same key).
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Rank a user's recent entries into their most-logged foods. Items seen at
// least `minCount` times qualify; ties break by recency.
export function detectFrequentItems(
  rows: PantryRow[],
  opts: { minCount?: number; limit?: number } = {},
): FrequentItem[] {
  const minCount = opts.minCount ?? 2;
  const limit = opts.limit ?? 12;

  const map = new Map<string, FrequentItem>();
  for (const r of rows) {
    const desc = (r.description ?? "").trim();
    if (!desc) continue;
    const key = normalize(desc);
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        description: desc,
        meal: r.meal,
        count: 1,
        lastUsed: r.consumed_at,
      });
    } else {
      existing.count += 1;
      // Keep the most recent phrasing/meal as the representative.
      if (r.consumed_at > existing.lastUsed) {
        existing.lastUsed = r.consumed_at;
        existing.description = desc;
        existing.meal = r.meal;
      }
    }
  }

  return Array.from(map.values())
    .filter((it) => it.count >= minCount)
    .sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, limit);
}
