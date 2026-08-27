import type { Meal } from "./types";

// One-line protein-distribution nudge: muscle protein synthesis responds to
// ~0.4 g/kg (roughly 25-40 g) doses spread across the day, so the same daily
// total back-loaded into dinner builds less muscle. Only shown when the goal
// is muscle/gain, enough of the day is logged to judge, and dinner+snacks
// carry most of the protein.
export function proteinDistributionNote(args: {
  goal: string | null;
  entries: Array<{ meal: Meal | null; protein_g: number | null }>;
  proteinTargetG: number;
}): string | null {
  if (args.goal !== "muscle" && args.goal !== "gain") return null;
  const byMeal: Record<string, number> = {};
  let total = 0;
  for (const e of args.entries) {
    const g = e.protein_g ?? 0;
    total += g;
    const m = e.meal ?? "snack";
    byMeal[m] = (byMeal[m] ?? 0) + g;
  }
  // Judge only once a real chunk of the day's protein is on the board.
  if (total < Math.max(40, args.proteinTargetG * 0.5)) return null;
  const early = (byMeal.breakfast ?? 0) + (byMeal.lunch ?? 0);
  if (early / total >= 0.4) return null;
  const perMeal = Math.round((args.proteinTargetG / 4) / 5) * 5;
  return `Most of today's protein came late — aiming for ~${perMeal} g by breakfast and lunch supports muscle better than a protein-heavy dinner.`;
}
