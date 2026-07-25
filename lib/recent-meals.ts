// Zero-setup repeat logging: surface recently logged whole meals as one-tap
// "log again" items. Unlike saved meals (which require an explicit save that,
// in practice, nobody does) this mines what was already logged. Deduped by
// normalized description so the daily latte shows once, most recent first.

export type RecentMealRow = {
  id: string;
  description: string;
  calories: number | null;
  consumed_at: string;
};

export type RecentMeal = {
  entryId: string;
  description: string;
  calories: number | null;
  lastLogged: string;
};

const MIN_DESCRIPTION_LENGTH = 3;

export function dedupeRecentMeals(
  rows: RecentMealRow[] | null | undefined,
  limit = 6,
): RecentMeal[] {
  if (!rows || limit <= 0) return [];
  // Most recent first, then keep the first occurrence per normalized text.
  const sorted = [...rows].sort((a, b) =>
    b.consumed_at.localeCompare(a.consumed_at),
  );
  const seen = new Set<string>();
  const out: RecentMeal[] = [];
  for (const r of sorted) {
    const desc = (r.description ?? "").trim();
    if (desc.length < MIN_DESCRIPTION_LENGTH) continue;
    const key = desc.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      entryId: r.id,
      description: desc,
      calories: r.calories,
      lastLogged: r.consumed_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}
