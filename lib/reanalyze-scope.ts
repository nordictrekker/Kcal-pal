// Scope options for a re-analyze run. Keeping the filter pure (and unit-
// tested) means the page can offer "last week / 2 weeks / 30 days / all"
// without extra queries — every target already carries its latest date.

export type ScopeKey = "7" | "14" | "30" | "all";

export const SCOPE_OPTIONS: Array<{ key: ScopeKey; label: string }> = [
  { key: "7", label: "Last 7 days" },
  { key: "14", label: "Last 14 days" },
  { key: "30", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

// A group is in scope when its MOST RECENT entry falls inside the window.
// (Groups mix dates; re-analyzing the group refreshes all of its entries,
// which is the point — one parse, applied everywhere it appears.)
export function filterByScope<T extends { lastAt: string }>(
  targets: T[],
  scope: ScopeKey,
  now: Date = new Date(),
): T[] {
  if (scope === "all") return targets;
  const days = Number(scope);
  if (!Number.isFinite(days) || days <= 0) return targets;
  const cutoff = now.getTime() - days * 86_400_000;
  return targets.filter((t) => {
    const at = Date.parse(t.lastAt);
    return Number.isFinite(at) && at >= cutoff;
  });
}
