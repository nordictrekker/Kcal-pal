// Pick which produce motif to show in the Today header, based on the whole
// foods the user logged this week. Every meal parse already extracts a `plants`
// list (lowercase singular: "spinach", "avocado", …); we tally the week's
// plants and show the most-logged one we have a motif for. If nothing maps
// (or nothing was logged), the header falls back to the steaming bowl.

// The motifs we can draw. Keep in sync with app/today/produce-motif.tsx.
export type ProduceKind =
  | "bowl"
  | "apple"
  | "avocado"
  | "carrot"
  | "strawberry"
  | "tomato"
  | "grapes"
  | "citrus"
  | "rice"
  | "wheat"
  | "corn"
  | "cake";

// Plant name (lowercase singular, as stored) → motif. Synonyms welcome.
const PLANT_TO_KIND: Record<string, ProduceKind> = {
  apple: "apple",
  avocado: "avocado",
  carrot: "carrot",
  strawberry: "strawberry",
  tomato: "tomato",
  grape: "grapes",
  orange: "citrus",
  lemon: "citrus",
  lime: "citrus",
  grapefruit: "citrus",
  clementine: "citrus",
  mandarin: "citrus",
  tangerine: "citrus",
  rice: "rice",
  wheat: "wheat",
  oat: "wheat",
  barley: "wheat",
  corn: "corn",
  maize: "corn",
};

function kindForPlant(plant: string): ProduceKind | null {
  const p = plant.trim().toLowerCase();
  if (!p) return null;
  // Try the name as-is, then a naively de-pluralized form ("apples" → "apple").
  return PLANT_TO_KIND[p] ?? PLANT_TO_KIND[p.replace(/s$/, "")] ?? null;
}

// Choose the week's produce. `plants` should be ordered most-recent-first so
// that ties break toward what the user ate most recently.
export function pickProduceKind(plants: string[]): ProduceKind {
  const count = new Map<ProduceKind, number>();
  const firstIndex = new Map<ProduceKind, number>();
  plants.forEach((plant, i) => {
    const kind = kindForPlant(plant);
    if (!kind) return;
    count.set(kind, (count.get(kind) ?? 0) + 1);
    if (!firstIndex.has(kind)) firstIndex.set(kind, i);
  });

  if (count.size === 0) return "bowl";

  let best: ProduceKind = "bowl";
  let bestCount = -1;
  let bestIdx = Infinity;
  for (const [kind, c] of count) {
    const idx = firstIndex.get(kind) ?? Infinity;
    if (c > bestCount || (c === bestCount && idx < bestIdx)) {
      best = kind;
      bestCount = c;
      bestIdx = idx;
    }
  }
  return best;
}

// True when today falls in the user's birth month (so the header celebrates
// with a cake all month). Both dates are YYYY-MM-DD, so we just compare months.
export function isBirthdayMonth(
  dateOfBirth: string | null,
  todayKey: string,
): boolean {
  if (!dateOfBirth || dateOfBirth.length < 7 || todayKey.length < 7) return false;
  return dateOfBirth.slice(5, 7) === todayKey.slice(5, 7);
}
