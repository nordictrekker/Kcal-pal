// Extract the per-component breakdown of a food entry from its stored AI
// response. raw_ai_response holds the full Anthropic message envelope
// ({ content: [{ type: "text", text: "<json>" }] }), so the items live inside
// that text as JSON — not at the top level. Handles a direct parsed object
// too, in case storage changes later.

export type ComponentItem = {
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // Per-component extended nutrients. Optional: older logs only itemized
  // macros, so these are absent there.
  fiber_g?: number;
  saturated_fat_g?: number;
  cholesterol_mg?: number;
  iron_mg?: number;
  calcium_mg?: number;
  magnesium_mg?: number;
  vitamin_d_mcg?: number;
  omega3_mg?: number;
};

function stripFences(text: string): string {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence ? fence[1].trim() : t;
}

function optNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && v != null && v !== "" ? n : undefined;
}

function normalizeItems(arr: unknown): ComponentItem[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i) => ({
      name: typeof i.name === "string" ? i.name : "",
      quantity: typeof i.quantity === "string" ? i.quantity : "",
      calories: Number(i.calories) || 0,
      protein_g: Number(i.protein_g) || 0,
      carbs_g: Number(i.carbs_g) || 0,
      fat_g: Number(i.fat_g) || 0,
      fiber_g: optNum(i.fiber_g),
      saturated_fat_g: optNum(i.saturated_fat_g),
      cholesterol_mg: optNum(i.cholesterol_mg),
      iron_mg: optNum(i.iron_mg),
      calcium_mg: optNum(i.calcium_mg),
      magnesium_mg: optNum(i.magnesium_mg),
      vitamin_d_mcg: optNum(i.vitamin_d_mcg),
      omega3_mg: optNum(i.omega3_mg),
    }))
    .filter((i) => i.name !== "");
}

export function extractComponents(raw: unknown): ComponentItem[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;

  // Already the parsed nutrition object.
  if (Array.isArray(obj.items)) return normalizeItems(obj.items);

  // Anthropic message envelope: items are JSON inside the first text block.
  if (Array.isArray(obj.content)) {
    const block = (obj.content as Array<Record<string, unknown>>).find(
      (b) => b && b.type === "text" && typeof b.text === "string",
    );
    if (block && typeof block.text === "string") {
      try {
        const parsed = JSON.parse(stripFences(block.text)) as {
          items?: unknown;
        };
        return normalizeItems(parsed.items);
      } catch {
        return [];
      }
    }
  }
  return [];
}
